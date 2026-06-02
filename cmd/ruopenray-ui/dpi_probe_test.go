package main

import "testing"

func TestDPIClassifyError(t *testing.T) {
	tests := []struct {
		name  string
		stage string
		err   string
		code  string
	}{
		{name: "dns", stage: "dns", err: "lookup example.test: no such host", code: "dns-fail"},
		{name: "tcp timeout", stage: "tcp", err: "dial tcp: i/o timeout", code: "tcp-timeout"},
		{name: "tls reset", stage: "tls", err: "read: connection reset by peer", code: "tls-rst"},
		{name: "http block", stage: "http", err: "HTTP 451", code: "http-block"},
		{name: "network unreachable", stage: "tcp", err: "connect: network is unreachable", code: "net-unreach"},
		{name: "tls spoof", stage: "tls", err: "tls: first record does not look like a TLS handshake", code: "tls-spoof"},
		{name: "tcp abort", stage: "http", err: "unexpected EOF", code: "http-abort"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code, _, _ := dpiClassifyError(tt.stage, tt.err)
			if code != tt.code {
				t.Fatalf("code = %q, want %q", code, tt.code)
			}
		})
	}
}

func TestDPIProbeVerdictProxyNeeded(t *testing.T) {
	verdict := dpiProbeVerdict(
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": false},
		map[string]any{"ok": false},
		map[string]any{"ok": false},
		map[string]any{"ok": false},
		map[string]any{"ok": false},
		map[string]any{"skipped": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"skipped": true},
	)
	if verdict["code"] != "proxy-needed" {
		t.Fatalf("verdict = %#v, want proxy-needed", verdict)
	}
}

func TestDPIProbeVerdictReadStall(t *testing.T) {
	verdict := dpiProbeVerdict(
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": false, "code": "read-stall"},
		map[string]any{"skipped": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"skipped": true},
	)
	if verdict["code"] != "read-stall" {
		t.Fatalf("verdict = %#v, want read-stall", verdict)
	}
}

func TestDPIProbeVerdictRedirectSuspicious(t *testing.T) {
	verdict := dpiProbeVerdict(
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true, "code": "redirect-suspicious"},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
		map[string]any{"ok": true},
	)
	if verdict["code"] != "redirect-suspicious" {
		t.Fatalf("verdict = %#v, want redirect-suspicious", verdict)
	}
}

func TestDPIDNSCompare(t *testing.T) {
	matched := dpiCompareDNS(
		map[string]any{"ok": true, "addresses": []string{"142.250.150.100", "2a00:1450:4010:c1c::64"}},
		map[string]any{"ok": true, "addresses": []string{"142.250.150.100"}},
	)
	if matched["code"] != "ok" {
		t.Fatalf("matched code = %#v, want ok", matched)
	}

	mismatched := dpiCompareDNS(
		map[string]any{"ok": true, "addresses": []string{"10.10.10.10"}},
		map[string]any{"ok": true, "addresses": []string{"142.250.150.100"}},
	)
	if mismatched["code"] != "dns-mismatch" {
		t.Fatalf("mismatched code = %#v, want dns-mismatch", mismatched)
	}
}
