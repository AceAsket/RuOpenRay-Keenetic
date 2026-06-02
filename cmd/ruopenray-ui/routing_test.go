package main

import "testing"

func TestRouterHTTPProbeRejectsInvalidURL(t *testing.T) {
	result := routerHTTPProbe(map[string]any{"url": "file:///etc/passwd"})
	if result["ok"] != false {
		t.Fatalf("routerHTTPProbe accepted invalid URL: %#v", result)
	}
}
