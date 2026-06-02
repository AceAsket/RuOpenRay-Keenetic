package main

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
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
