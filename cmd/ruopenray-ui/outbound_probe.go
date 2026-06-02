package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func (s *serverState) httpOutboundProbe(outbound map[string]any, probeURL string, timeoutMs int, attempts int) (int64, bool, error) {
	port, err := freeLocalPort()
	if err != nil {
		return 0, false, err
	}
	config := map[string]any{
		"log": map[string]any{"loglevel": "warning"},
		"inbounds": []any{map[string]any{
			"tag": "ruopenray-probe", "listen": "127.0.0.1", "port": port, "protocol": "http", "settings": map[string]any{},
		}},
		"outbounds": ensureFragmentOutbounds([]any{outbound}),
	}
	dir := filepath.Join(s.cfg.DataDir, "checks")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return 0, false, err
	}
	file, err := os.CreateTemp(dir, "outbound-*.json")
	if err != nil {
		return 0, false, err
	}
	path := file.Name()
	if err := json.NewEncoder(file).Encode(config); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return 0, false, err
	}
	_ = file.Close()
	defer os.Remove(path)

	samples := attempts
	if samples < 1 {
		samples = 1
	}
	totalSamples := samples + 1
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs*(totalSamples+2))*time.Millisecond+5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "xray", "run", "-config", path)
	cmd.Env = s.xrayEnv()
	var stderr bytes.Buffer
	cmd.Stdout = &stderr
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return 0, false, err
	}
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		_ = cmd.Wait()
	}()
	if err := waitTCPPort("127.0.0.1", port, 2500); err != nil {
		detail := strings.TrimSpace(stderr.String())
		if detail != "" {
			return 0, false, fmt.Errorf("%w: %s", err, lastLine(detail))
		}
		return 0, false, err
	}

	proxyURL, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", port))
	client := &http.Client{
		Timeout: time.Duration(timeoutMs) * time.Millisecond,
		Transport: &http.Transport{
			Proxy: http.ProxyURL(proxyURL),
			TLSClientConfig: &tls.Config{
				MinVersion: tls.VersionTLS12,
			},
		},
	}
	var best int64
	var warmBest int64
	var lastErr error
	for attempt := 0; attempt < totalSamples; attempt++ {
		measured := attempt > 0
		req, err := newProbeHTTPRequest(probeURL)
		if err != nil {
			return 0, false, err
		}
		started := time.Now()
		resp, err := client.Do(req)
		latency := time.Since(started).Milliseconds()
		if err == nil {
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))
			_ = resp.Body.Close()
			if resp.StatusCode < 500 {
				if !measured {
					if warmBest == 0 || latency < warmBest {
						warmBest = latency
					}
					lastErr = nil
					continue
				}
				if best == 0 || latency < best {
					best = latency
				}
				lastErr = nil
				continue
			}
			lastErr = fmt.Errorf("HTTP %d", resp.StatusCode)
			continue
		}
		lastErr = err
	}
	if best > 0 {
		return best, true, nil
	}
	if warmBest > 0 {
		return warmBest, true, nil
	}
	if lastErr != nil {
		if detail := strings.TrimSpace(stderr.String()); detail != "" {
			return 0, false, fmt.Errorf("%w: %s", lastErr, lastLine(detail))
		}
	}
	return 0, false, lastErr
}

func (s *serverState) httpOutboundReadProbe(outbound map[string]any, probeURL string, timeoutMs int, readLimit int64) map[string]any {
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	if readLimit < 1 {
		readLimit = dpiLargeReadBytes
	}
	port, err := freeLocalPort()
	if err != nil {
		return dpiAnnotate("http", map[string]any{"ok": false, "targetBytes": readLimit, "error": err.Error()})
	}
	config := map[string]any{
		"log": map[string]any{"loglevel": "warning"},
		"inbounds": []any{map[string]any{
			"tag": "ruopenray-probe", "listen": "127.0.0.1", "port": port, "protocol": "http", "settings": map[string]any{},
		}},
		"outbounds": ensureFragmentOutbounds([]any{outbound}),
	}
	dir := filepath.Join(s.cfg.DataDir, "checks")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return dpiAnnotate("http", map[string]any{"ok": false, "targetBytes": readLimit, "error": err.Error()})
	}
	file, err := os.CreateTemp(dir, "outbound-read-*.json")
	if err != nil {
		return dpiAnnotate("http", map[string]any{"ok": false, "targetBytes": readLimit, "error": err.Error()})
	}
	path := file.Name()
	if err := json.NewEncoder(file).Encode(config); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return dpiAnnotate("http", map[string]any{"ok": false, "targetBytes": readLimit, "error": err.Error()})
	}
	_ = file.Close()
	defer os.Remove(path)

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs*3)*time.Millisecond+5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "xray", "run", "-config", path)
	cmd.Env = s.xrayEnv()
	var stderr bytes.Buffer
	cmd.Stdout = &stderr
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return dpiAnnotate("http", map[string]any{"ok": false, "targetBytes": readLimit, "error": err.Error()})
	}
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		_ = cmd.Wait()
	}()
	if err := waitTCPPort("127.0.0.1", port, 2500); err != nil {
		if detail := strings.TrimSpace(stderr.String()); detail != "" {
			err = fmt.Errorf("%w: %s", err, lastLine(detail))
		}
		return dpiAnnotate("http", map[string]any{"ok": false, "targetBytes": readLimit, "error": err.Error()})
	}

	proxyURL, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", port))
	client := &http.Client{
		Timeout: time.Duration(timeoutMs) * time.Millisecond,
		Transport: &http.Transport{
			Proxy: http.ProxyURL(proxyURL),
			TLSClientConfig: &tls.Config{
				MinVersion: tls.VersionTLS12,
			},
		},
	}
	req, err := newProbeHTTPRequest(probeURL)
	if err != nil {
		return dpiAnnotate("http", map[string]any{"ok": false, "targetBytes": readLimit, "error": err.Error()})
	}
	started := time.Now()
	resp, err := client.Do(req)
	latency := time.Since(started).Milliseconds()
	if err != nil {
		if detail := strings.TrimSpace(stderr.String()); detail != "" {
			err = fmt.Errorf("%w: %s", err, lastLine(detail))
		}
		return dpiAnnotate("http", map[string]any{"ok": false, "latencyMs": latency, "targetBytes": readLimit, "error": err.Error()})
	}
	defer resp.Body.Close()
	copied, readErr := io.Copy(io.Discard, io.LimitReader(resp.Body, readLimit))
	result := map[string]any{
		"ok":          readErr == nil && resp.StatusCode < 500,
		"status":      resp.StatusCode,
		"latencyMs":   latency,
		"bytes":       copied,
		"targetBytes": readLimit,
	}
	if readErr != nil {
		result["error"] = readErr.Error()
	} else if resp.StatusCode >= 500 {
		result["error"] = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return dpiAnnotate("http", result)
}

func (s *serverState) withOutboundHTTPProbeClient(outbound map[string]any, timeoutMs int, task func(*http.Client, *bytes.Buffer) map[string]any) map[string]any {
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	port, err := freeLocalPort()
	if err != nil {
		return dpiAnnotate("http", map[string]any{"ok": false, "error": err.Error()})
	}
	config := map[string]any{
		"log": map[string]any{"loglevel": "warning"},
		"inbounds": []any{map[string]any{
			"tag": "ruopenray-probe", "listen": "127.0.0.1", "port": port, "protocol": "http", "settings": map[string]any{},
		}},
		"outbounds": ensureFragmentOutbounds([]any{outbound}),
	}
	dir := filepath.Join(s.cfg.DataDir, "checks")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return dpiAnnotate("http", map[string]any{"ok": false, "error": err.Error()})
	}
	file, err := os.CreateTemp(dir, "outbound-http-*.json")
	if err != nil {
		return dpiAnnotate("http", map[string]any{"ok": false, "error": err.Error()})
	}
	path := file.Name()
	if err := json.NewEncoder(file).Encode(config); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return dpiAnnotate("http", map[string]any{"ok": false, "error": err.Error()})
	}
	_ = file.Close()
	defer os.Remove(path)

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs*5)*time.Millisecond+8*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "xray", "run", "-config", path)
	cmd.Env = s.xrayEnv()
	var stderr bytes.Buffer
	cmd.Stdout = &stderr
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return dpiAnnotate("http", map[string]any{"ok": false, "error": err.Error()})
	}
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		_ = cmd.Wait()
	}()
	if err := waitTCPPort("127.0.0.1", port, 2500); err != nil {
		if detail := strings.TrimSpace(stderr.String()); detail != "" {
			err = fmt.Errorf("%w: %s", err, lastLine(detail))
		}
		return dpiAnnotate("http", map[string]any{"ok": false, "error": err.Error()})
	}

	proxyURL, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", port))
	client := &http.Client{
		Timeout: time.Duration(timeoutMs) * time.Millisecond,
		Transport: &http.Transport{
			Proxy: http.ProxyURL(proxyURL),
			TLSClientConfig: &tls.Config{
				MinVersion: tls.VersionTLS12,
			},
		},
	}
	return task(client, &stderr)
}

func (s *serverState) httpOutboundReadProbeSet(outbound map[string]any, probeURL string, timeoutMs int) map[string]any {
	return s.withOutboundHTTPProbeClient(outbound, timeoutMs, func(client *http.Client, stderr *bytes.Buffer) map[string]any {
		return dpiReadProbeSet(func(size int64) map[string]any {
			result := dpiHTTPReadWithClient(client, probeURL, size)
			if !boolPayload(result, "ok", false) {
				if detail := strings.TrimSpace(stderr.String()); detail != "" && strings.TrimSpace(fmt.Sprint(result["error"])) != "" {
					result["error"] = fmt.Sprintf("%s: %s", result["error"], lastLine(detail))
				}
			}
			return result
		})
	})
}

func (s *serverState) httpOutboundRedirectProbe(outbound map[string]any, probeURL string, timeoutMs int) map[string]any {
	return s.withOutboundHTTPProbeClient(outbound, timeoutMs, func(client *http.Client, stderr *bytes.Buffer) map[string]any {
		client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		}
		result := dpiRedirectProbeWithClient(client, probeURL)
		if !boolPayload(result, "ok", false) {
			if detail := strings.TrimSpace(stderr.String()); detail != "" && strings.TrimSpace(fmt.Sprint(result["error"])) != "" {
				result["error"] = fmt.Sprintf("%s: %s", result["error"], lastLine(detail))
			}
		}
		return result
	})
}

func newProbeHTTPRequest(rawURL string) (*http.Request, error) {
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; RuOpenRay/"+appVersion+"; +https://github.com/AceAsket/RuOpenRay-Keenetic)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "ru,en;q=0.8")
	req.Header.Set("Cache-Control", "no-cache")
	return req, nil
}

func (s *serverState) tcpOutboundProbe(outbound map[string]any, host string, targetPort string, timeoutMs int, attempts int) (int64, bool, error) {
	port, err := freeLocalPort()
	if err != nil {
		return 0, false, err
	}
	config := map[string]any{
		"log": map[string]any{"loglevel": "warning"},
		"inbounds": []any{map[string]any{
			"tag": "ruopenray-probe", "listen": "127.0.0.1", "port": port, "protocol": "http", "settings": map[string]any{},
		}},
		"outbounds": ensureFragmentOutbounds([]any{outbound}),
	}
	dir := filepath.Join(s.cfg.DataDir, "checks")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return 0, false, err
	}
	file, err := os.CreateTemp(dir, "outbound-tcp-*.json")
	if err != nil {
		return 0, false, err
	}
	path := file.Name()
	if err := json.NewEncoder(file).Encode(config); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return 0, false, err
	}
	_ = file.Close()
	defer os.Remove(path)

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs*(attempts+2))*time.Millisecond+5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "xray", "run", "-config", path)
	cmd.Env = s.xrayEnv()
	var stderr bytes.Buffer
	cmd.Stdout = &stderr
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return 0, false, err
	}
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		_ = cmd.Wait()
	}()
	if err := waitTCPPort("127.0.0.1", port, 2500); err != nil {
		detail := strings.TrimSpace(stderr.String())
		if detail != "" {
			return 0, false, fmt.Errorf("%w: %s", err, lastLine(detail))
		}
		return 0, false, err
	}

	samples := attempts
	if samples < 1 {
		samples = 1
	}
	totalSamples := samples + 1
	target := net.JoinHostPort(host, targetPort)
	var best int64
	var warmBest int64
	var lastErr error
	for attempt := 0; attempt < totalSamples; attempt++ {
		measured := attempt > 0
		started := time.Now()
		conn, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", fmt.Sprint(port)), time.Duration(timeoutMs)*time.Millisecond)
		if err != nil {
			lastErr = err
			continue
		}
		_ = conn.SetDeadline(time.Now().Add(time.Duration(timeoutMs) * time.Millisecond))
		_, _ = fmt.Fprintf(conn, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n", target, target)
		reader := bufio.NewReader(conn)
		line, readErr := reader.ReadString('\n')
		connectOK := readErr == nil && strings.Contains(line, " 200 ")
		if connectOK {
			if targetPort == "443" {
				tlsConn := tls.Client(conn, &tls.Config{ServerName: host, InsecureSkipVerify: true, MinVersion: tls.VersionTLS12})
				readErr = tlsConn.Handshake()
			} else if targetPort == "80" {
				_, _ = fmt.Fprintf(conn, "HEAD / HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n", host)
				line, readErr = reader.ReadString('\n')
				if readErr == nil && !strings.Contains(line, "HTTP/") {
					readErr = errors.New(strings.TrimSpace(line))
				}
			}
		}
		_ = conn.Close()
		latency := time.Since(started).Milliseconds()
		if readErr == nil && connectOK {
			if !measured {
				if warmBest == 0 || latency < warmBest {
					warmBest = latency
				}
				lastErr = nil
				continue
			}
			if best == 0 || latency < best {
				best = latency
			}
			lastErr = nil
			continue
		}
		if readErr != nil {
			lastErr = readErr
		} else {
			lastErr = errors.New(strings.TrimSpace(line))
		}
	}
	if best > 0 {
		return best, true, nil
	}
	if warmBest > 0 {
		return warmBest, true, nil
	}
	return 0, false, lastErr
}

func directEndpointTCPProbe(address string, portValue int, timeoutMs int, attempts int) (int64, bool, error) {
	samples := attempts
	if samples < 3 {
		samples = 3
	}
	totalSamples := samples + 1
	target := net.JoinHostPort(address, fmt.Sprint(portValue))
	var best int64
	var warmBest int64
	var lastErr error
	for attempt := 0; attempt < totalSamples; attempt++ {
		measured := attempt > 0
		started := time.Now()
		conn, err := dialTCPPreferIPv4(target, time.Duration(timeoutMs)*time.Millisecond)
		latency := time.Since(started).Milliseconds()
		if err == nil {
			_ = conn.Close()
			if !measured {
				if warmBest == 0 || latency < warmBest {
					warmBest = latency
				}
				lastErr = nil
				continue
			}
			if best == 0 || latency < best {
				best = latency
			}
			lastErr = nil
			continue
		}
		lastErr = err
	}
	if best > 0 {
		return best, true, nil
	}
	if warmBest > 0 {
		return warmBest, true, nil
	}
	return 0, false, lastErr
}

func dialTCPPreferIPv4(address string, timeout time.Duration) (net.Conn, error) {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	if ip := net.ParseIP(host); ip != nil && ip.To4() == nil {
		return net.DialTimeout("tcp", address, timeout)
	}
	return net.DialTimeout("tcp4", address, timeout)
}

func freeLocalPort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port, nil
}

func waitTCPPort(host string, port int, timeoutMs int) error {
	deadline := time.Now().Add(time.Duration(timeoutMs) * time.Millisecond)
	address := net.JoinHostPort(host, fmt.Sprint(port))
	var lastErr error
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", address, 150*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return nil
		}
		lastErr = err
		time.Sleep(100 * time.Millisecond)
	}
	if lastErr != nil {
		return lastErr
	}
	return fmt.Errorf("probe HTTP inbound did not start")
}
