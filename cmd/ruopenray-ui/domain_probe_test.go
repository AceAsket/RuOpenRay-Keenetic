package main

import "testing"

func TestDomainProbeURL(t *testing.T) {
	tests := []struct {
		name       string
		host       string
		rawURL     string
		wantURL    string
		wantHost   string
		wantPort   string
		wantScheme string
	}{
		{
			name:       "plain domain defaults to https",
			host:       "example.com",
			wantURL:    "https://example.com",
			wantHost:   "example.com",
			wantPort:   "443",
			wantScheme: "https",
		},
		{
			name:       "domain prefix is accepted",
			host:       "domain:telegram.org",
			wantURL:    "https://telegram.org",
			wantHost:   "telegram.org",
			wantPort:   "443",
			wantScheme: "https",
		},
		{
			name:       "explicit http port",
			rawURL:     "http://example.com:8080/path",
			wantURL:    "http://example.com:8080/path",
			wantHost:   "example.com",
			wantPort:   "8080",
			wantScheme: "http",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotURL, gotHost, gotPort, gotScheme, err := domainProbeURL(tt.host, tt.rawURL)
			if err != nil {
				t.Fatalf("domainProbeURL returned error: %v", err)
			}
			if gotURL != tt.wantURL || gotHost != tt.wantHost || gotPort != tt.wantPort || gotScheme != tt.wantScheme {
				t.Fatalf("domainProbeURL = (%q, %q, %q, %q), want (%q, %q, %q, %q)", gotURL, gotHost, gotPort, gotScheme, tt.wantURL, tt.wantHost, tt.wantPort, tt.wantScheme)
			}
		})
	}
}

func TestDomainProbeVerdict(t *testing.T) {
	tests := []struct {
		name       string
		ping       map[string]any
		directTCP  map[string]any
		proxyTCP   map[string]any
		directHTTP map[string]any
		proxyHTTP  map[string]any
		wantCode   string
	}{
		{
			name:       "proxy fixes blocked http",
			directHTTP: map[string]any{"ok": false},
			proxyHTTP:  map[string]any{"ok": true},
			wantCode:   "proxy-needed",
		},
		{
			name:       "both http paths work",
			directHTTP: map[string]any{"ok": true},
			proxyHTTP:  map[string]any{"ok": true},
			wantCode:   "both-ok",
		},
		{
			name:       "tcp only over proxy",
			directTCP:  map[string]any{"ok": false},
			proxyTCP:   map[string]any{"ok": true},
			directHTTP: map[string]any{"ok": false},
			proxyHTTP:  map[string]any{"ok": false},
			wantCode:   "proxy-tcp",
		},
		{
			name:       "site returns http error but tcp paths are open",
			directTCP:  map[string]any{"ok": true},
			proxyTCP:   map[string]any{"ok": true},
			directHTTP: map[string]any{"ok": false, "status": 503},
			proxyHTTP:  map[string]any{"ok": false, "error": "HTTP 503"},
			wantCode:   "http-target-error",
		},
		{
			name:       "ping only fallback",
			ping:       map[string]any{"ok": true},
			directTCP:  map[string]any{"ok": false},
			proxyTCP:   map[string]any{"ok": false},
			directHTTP: map[string]any{"ok": false},
			proxyHTTP:  map[string]any{"ok": false},
			wantCode:   "ping-only",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := domainProbeVerdict(tt.ping, tt.directTCP, tt.proxyTCP, tt.directHTTP, tt.proxyHTTP)
			if got["code"] != tt.wantCode {
				t.Fatalf("domainProbeVerdict code = %v, want %s", got["code"], tt.wantCode)
			}
		})
	}
}
