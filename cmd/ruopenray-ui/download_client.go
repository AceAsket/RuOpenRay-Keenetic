package main

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (s *serverState) downloadHTTPClient(timeout time.Duration) (*http.Client, map[string]any) {
	info := map[string]any{"enabled": false, "used": false}
	if !s.cfg.isKeenetic() {
		return &http.Client{Timeout: timeout}, info
	}
	settings := s.normalizeKeeneticSettings(map[string]any{})
	if settings["entwareProxy"] != true {
		return &http.Client{Timeout: timeout}, info
	}
	info["enabled"] = true
	proxyURL, proxyInfo := s.keeneticDownloadProxyURL()
	for key, value := range proxyInfo {
		info[key] = value
	}
	if proxyURL == nil {
		return &http.Client{Timeout: timeout}, info
	}
	info["used"] = true
	transport := &http.Transport{Proxy: http.ProxyURL(proxyURL)}
	return &http.Client{Timeout: timeout, Transport: transport}, info
}

func (s *serverState) downloadHTTPGet(rawURL string, timeout time.Duration) (*http.Response, map[string]any, error) {
	attempts := s.downloadAttempts()
	var lastErr error
	var proxy map[string]any
	for attempt := 1; attempt <= attempts; attempt++ {
		client, currentProxy := s.downloadHTTPClient(timeout)
		proxy = currentProxy
		proxy["attempt"] = attempt
		proxy["attempts"] = attempts
		resp, err := client.Get(rawURL)
		if err == nil && (resp.StatusCode < 500 || attempt == attempts) {
			return resp, proxy, nil
		}
		if resp != nil && resp.Body != nil {
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
			_ = resp.Body.Close()
		}
		if err != nil {
			lastErr = err
		} else {
			lastErr = fmt.Errorf("download HTTP %d", resp.StatusCode)
		}
		time.Sleep(time.Duration(attempt) * 350 * time.Millisecond)
	}
	if proxy == nil {
		_, proxy = s.downloadHTTPClient(timeout)
	}
	return nil, proxy, lastErr
}

func (s *serverState) downloadAttempts() int {
	if !s.cfg.isKeenetic() {
		return 1
	}
	settings := s.normalizeKeeneticSettings(map[string]any{})
	return cleanKeeneticRetries(settings["downloadRetries"])
}

func (s *serverState) offlineInstallEnabled() bool {
	if !s.cfg.isKeenetic() {
		return false
	}
	settings := s.normalizeKeeneticSettings(map[string]any{})
	return settings["offlineInstall"] == true
}

func (s *serverState) offlineInstallDirs() []string {
	dirs := []string{"/opt/var/ruopenray-ui/offline", filepath.Join(s.cfg.DataDir, "offline")}
	if strings.TrimSpace(s.cfg.BackupDir) != "" {
		dirs = append(dirs, filepath.Join(filepath.Dir(s.cfg.BackupDir), "offline"))
	}
	return unique(dirs)
}

func (s *serverState) offlineAssetPath(assetName string) string {
	if !s.offlineInstallEnabled() || strings.TrimSpace(assetName) == "" {
		return ""
	}
	for _, dir := range s.offlineInstallDirs() {
		path := filepath.Join(dir, filepath.Base(assetName))
		if info, err := os.Stat(path); err == nil && !info.IsDir() && info.Size() > 0 {
			return path
		}
	}
	return ""
}

func (s *serverState) keeneticDownloadProxyURL() (*url.URL, map[string]any) {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return nil, map[string]any{"reason": "active Xray config is unavailable", "error": err.Error()}
	}
	inbounds := asArray(cfg["inbounds"])
	if len(inbounds) == 0 {
		return nil, map[string]any{"reason": "active Xray config has no local proxy inbounds"}
	}
	if proxy, info := localInboundProxyURL(inbounds, "http"); proxy != nil {
		return proxy, info
	}
	if proxy, info := localInboundProxyURL(inbounds, "socks"); proxy != nil {
		return proxy, info
	}
	return nil, map[string]any{"reason": "enable HTTP or SOCKS5 local proxy in the active Xray config"}
}

func localInboundProxyURL(inbounds []any, protocol string) (*url.URL, map[string]any) {
	for _, item := range inbounds {
		inbound, ok := item.(map[string]any)
		if !ok || strings.ToLower(strings.TrimSpace(fmt.Sprint(inbound["protocol"]))) != protocol {
			continue
		}
		portValue := number(inbound["port"], 0)
		if portValue <= 0 || portValue > 65535 {
			continue
		}
		listen := strings.TrimSpace(fmt.Sprint(inbound["listen"]))
		if listen == "" || listen == "<nil>" || listen == "0.0.0.0" || listen == "::" || listen == "[::]" {
			listen = "127.0.0.1"
		}
		host := strings.Trim(listen, "[]")
		if net.ParseIP(host) == nil && host != "localhost" {
			host = "127.0.0.1"
		}
		settings := mapValue(inbound["settings"])
		account := map[string]any{}
		if accounts := asArray(settings["accounts"]); len(accounts) > 0 {
			account = mapValue(accounts[0])
		}
		scheme := "http"
		if protocol == "socks" {
			scheme = "socks5"
		}
		proxy := &url.URL{Scheme: scheme, Host: net.JoinHostPort(host, fmt.Sprint(portValue))}
		user := firstNonEmpty(strings.TrimSpace(fmt.Sprint(account["user"])))
		pass := firstNonEmpty(strings.TrimSpace(fmt.Sprint(account["pass"])))
		if user != "" || pass != "" {
			proxy.User = url.UserPassword(user, pass)
		}
		info := map[string]any{
			"protocol": protocol,
			"tag":      strings.TrimSpace(fmt.Sprint(inbound["tag"])),
			"listen":   listen,
			"port":     portValue,
			"url":      proxy.Redacted(),
		}
		return proxy, info
	}
	return nil, map[string]any{}
}
