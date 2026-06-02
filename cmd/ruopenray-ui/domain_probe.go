package main

import (
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

func domainProbeURL(rawHost string, rawURL string) (string, string, string, string, error) {
	value := strings.TrimSpace(firstNonEmpty(rawURL, rawHost))
	value = strings.TrimPrefix(value, "domain:")
	value = strings.TrimPrefix(value, "regexp:")
	value = strings.TrimPrefix(value, "full:")
	if value == "" || value == "<nil>" {
		return "", "", "", "", fmt.Errorf("укажите домен или URL")
	}
	if !strings.Contains(value, "://") {
		value = "https://" + strings.Trim(value, "/")
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", "", "", "", fmt.Errorf("нужен домен или http/https URL")
	}
	port := parsed.Port()
	if port == "" {
		if parsed.Scheme == "http" {
			port = "80"
		} else {
			port = "443"
		}
	}
	return value, parsed.Hostname(), port, parsed.Scheme, nil
}

func directHTTPProbe(rawURL string, timeoutMs int, attempts int) map[string]any {
	if timeoutMs < 500 {
		timeoutMs = 500
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	if attempts < 1 {
		attempts = 1
	}
	transport := &http.Transport{TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12}}
	client := &http.Client{Timeout: time.Duration(timeoutMs) * time.Millisecond, Transport: transport}
	var best int64
	var lastLatency int64
	var lastStatus int
	var lastErr error
	for attempt := 0; attempt < attempts; attempt++ {
		req, err := newProbeHTTPRequest(rawURL)
		if err != nil {
			return map[string]any{"ok": false, "latencyMs": int64(0), "attempts": attempts, "error": err.Error()}
		}
		started := time.Now()
		resp, err := client.Do(req)
		latency := time.Since(started).Milliseconds()
		lastLatency = latency
		if err != nil {
			lastErr = err
			continue
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))
		_ = resp.Body.Close()
		lastStatus = resp.StatusCode
		if resp.StatusCode < 500 {
			if best == 0 || latency < best {
				best = latency
			}
			lastErr = nil
			continue
		}
		lastErr = fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	if best > 0 {
		return map[string]any{"ok": true, "status": lastStatus, "latencyMs": best, "attempts": attempts}
	}
	result := map[string]any{"ok": false, "status": lastStatus, "latencyMs": lastLatency, "attempts": attempts}
	if lastErr != nil {
		result["error"] = lastErr.Error()
	} else if lastStatus > 0 {
		result["error"] = fmt.Sprintf("HTTP %d", lastStatus)
	}
	return result
}

func directTCPProbe(host string, port string, timeoutMs int, attempts int) map[string]any {
	if timeoutMs < 500 {
		timeoutMs = 500
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	if attempts < 3 {
		attempts = 3
	}
	address := net.JoinHostPort(host, port)
	var best int64
	var warmBest int64
	var lastLatency int64
	var lastErr error
	for attempt := 0; attempt < attempts+1; attempt++ {
		measured := attempt > 0
		started := time.Now()
		conn, err := dialTCPPreferIPv4(address, time.Duration(timeoutMs)*time.Millisecond)
		latency := time.Since(started).Milliseconds()
		lastLatency = latency
		if err != nil {
			lastErr = err
			continue
		}
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
	}
	if best > 0 {
		return map[string]any{"ok": true, "latencyMs": best, "address": address, "attempts": attempts}
	}
	if warmBest > 0 {
		return map[string]any{"ok": true, "latencyMs": warmBest, "address": address, "attempts": attempts}
	}
	result := map[string]any{"ok": false, "latencyMs": lastLatency, "address": address, "attempts": attempts}
	if lastErr != nil {
		result["error"] = lastErr.Error()
	}
	return result
}

func directPingProbe(host string, timeoutMs int) map[string]any {
	ping, err := exec.LookPath("ping")
	if err != nil {
		return map[string]any{"ok": false, "skipped": true, "error": "ping не найден на роутере"}
	}
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	timeoutSeconds := (timeoutMs + 999) / 1000
	result := runTimeout(time.Duration(timeoutMs)*time.Millisecond+time.Second, ping, "-c", "1", "-W", strconv.Itoa(timeoutSeconds), host)
	result["host"] = host
	result["tool"] = "ping"
	stdout := fmt.Sprint(result["stdout"])
	if match := regexp.MustCompile(`time[=<]([0-9.]+)\s*ms`).FindStringSubmatch(stdout); len(match) == 2 {
		if latency, err := strconv.ParseFloat(match[1], 64); err == nil {
			result["latencyMs"] = int64(latency)
		}
	}
	return result
}

func firstProxyOutbound(cfg map[string]any) (map[string]any, string) {
	for _, item := range asArray(cfg["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if !ok {
			continue
		}
		tag := strings.TrimSpace(fmt.Sprint(outbound["tag"]))
		protocol := strings.ToLower(strings.TrimSpace(fmt.Sprint(outbound["protocol"])))
		if tag == "" || tag == "<nil>" || protocol == "freedom" || protocol == "blackhole" || protocol == "dns" || tag == "direct" || tag == "block" || tag == "dns-out" {
			continue
		}
		return outbound, tag
	}
	return nil, ""
}

func findOutboundByTag(cfg map[string]any, tag string) map[string]any {
	for _, item := range asArray(cfg["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(fmt.Sprint(outbound["tag"])) == tag {
			return outbound
		}
	}
	return nil
}

func domainProbeVerdict(ping map[string]any, directTCP map[string]any, proxyTCP map[string]any, directHTTP map[string]any, proxyHTTP map[string]any) map[string]any {
	directHTTPOK := boolPayload(directHTTP, "ok", false)
	proxyHTTPOK := boolPayload(proxyHTTP, "ok", false)
	directTCPOK := boolPayload(directTCP, "ok", false)
	proxyTCPOK := boolPayload(proxyTCP, "ok", false)
	pingOK := boolPayload(ping, "ok", false)
	directHTTPStatus := number(directHTTP["status"], 0)
	proxyHTTPStatus := number(proxyHTTP["status"], 0)
	if proxyHTTPStatus == 0 {
		proxyHTTPStatus = httpStatusFromError(fmt.Sprint(proxyHTTP["error"]))
	}
	switch {
	case proxyHTTPOK && !directHTTPOK:
		return map[string]any{"code": "proxy-needed", "label": "нужен proxy", "detail": "HTTP напрямую не открылся, через proxy работает"}
	case proxyHTTPOK && directHTTPOK:
		return map[string]any{"code": "both-ok", "label": "доступен", "detail": "HTTP открывается и напрямую, и через proxy"}
	case directTCPOK && proxyTCPOK && !directHTTPOK && !proxyHTTPOK && (directHTTPStatus >= 500 || proxyHTTPStatus >= 500):
		return map[string]any{"code": "http-target-error", "label": "TCP открыт", "detail": "Порт открыт напрямую и через proxy, но сайт вернул HTTP-ошибку на проверочный запрос. Для проверки маршрута лучше использовать стабильный URL вроде https://www.gstatic.com/generate_204"}
	case directHTTPOK && !proxyHTTPOK:
		return map[string]any{"code": "direct-only", "label": "напрямую", "detail": "HTTP напрямую работает, через выбранный proxy нет"}
	case proxyTCPOK && !directTCPOK:
		return map[string]any{"code": "proxy-tcp", "label": "TCP через proxy", "detail": "порт через proxy открыт, HTTP не ответил"}
	case directTCPOK && !proxyTCPOK:
		return map[string]any{"code": "direct-tcp", "label": "TCP напрямую", "detail": "порт напрямую открыт, через выбранный proxy нет"}
	case proxyTCPOK && directTCPOK:
		return map[string]any{"code": "tcp-open", "label": "TCP открыт", "detail": "порт открыт напрямую и через proxy, HTTP не ответил"}
	case pingOK:
		return map[string]any{"code": "ping-only", "label": "есть ping", "detail": "ICMP отвечает с роутера, TCP/HTTP не подтвердились"}
	default:
		return map[string]any{"code": "down", "label": "не открылся", "detail": "ping, TCP и HTTP не подтвердили доступность"}
	}
}

func httpStatusFromError(value string) int {
	match := regexp.MustCompile(`HTTP\s+([0-9]{3})`).FindStringSubmatch(value)
	if len(match) != 2 {
		return 0
	}
	return number(match[1], 0)
}

func (s *serverState) domainProxyProbe(payload map[string]any) map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	rawURL, host, port, scheme, err := domainProbeURL(strings.TrimSpace(fmt.Sprint(payload["host"])), strings.TrimSpace(fmt.Sprint(payload["url"])))
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	timeoutMs := number(payload["timeoutMs"], 5000)
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	ping := directPingProbe(host, timeoutMs)
	directAttempts := 3
	directTCP := directTCPProbe(host, port, timeoutMs, directAttempts)
	direct := directHTTPProbe(rawURL, timeoutMs, directAttempts)
	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	outbound := map[string]any(nil)
	if tag != "" && tag != "<nil>" {
		outbound = findOutboundByTag(cfg, tag)
	} else {
		outbound, tag = firstProxyOutbound(cfg)
	}
	proxyTCP := map[string]any{"ok": false, "error": "прокси-направление не найдено"}
	proxy := map[string]any{"ok": false, "error": "прокси-направление не найдено"}
	if outbound != nil {
		tcpLatency, tcpOK, tcpErr := s.tcpOutboundProbe(outbound, host, port, timeoutMs, directAttempts)
		proxyTCP = map[string]any{"ok": tcpOK, "tag": tag, "address": net.JoinHostPort(host, port), "attempts": directAttempts}
		if tcpLatency > 0 {
			proxyTCP["latencyMs"] = tcpLatency
		}
		if tcpErr != nil {
			proxyTCP["error"] = tcpErr.Error()
		}
		latency, ok, probeErr := s.httpOutboundProbe(outbound, rawURL, timeoutMs, directAttempts)
		proxy = map[string]any{"ok": ok, "tag": tag, "attempts": directAttempts}
		if latency > 0 {
			proxy["latencyMs"] = latency
		}
		if probeErr != nil {
			proxy["error"] = probeErr.Error()
			if status := httpStatusFromError(probeErr.Error()); status > 0 {
				proxy["status"] = status
			}
		}
	}
	checks := map[string]any{
		"ping":       ping,
		"tcpDirect":  directTCP,
		"tcpProxy":   proxyTCP,
		"httpDirect": direct,
		"httpProxy":  proxy,
	}
	verdict := domainProbeVerdict(ping, directTCP, proxyTCP, direct, proxy)
	return map[string]any{
		"ok":       true,
		"host":     host,
		"url":      rawURL,
		"endpoint": map[string]any{"host": host, "port": port, "scheme": scheme},
		"tag":      tag,
		"direct":   direct,
		"proxy":    proxy,
		"checks":   checks,
		"verdict":  verdict,
	}
}
