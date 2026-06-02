package main

import "testing"

func TestLocalInboundProxyURLPrefersHTTP(t *testing.T) {
	proxy, info := localInboundProxyURL([]any{
		map[string]any{"tag": "socks-in", "protocol": "socks", "listen": "127.0.0.1", "port": 10808},
		map[string]any{"tag": "http-in", "protocol": "http", "listen": "0.0.0.0", "port": 10809},
	}, "http")
	if proxy == nil {
		t.Fatal("expected proxy URL")
	}
	if proxy.String() != "http://127.0.0.1:10809" {
		t.Fatalf("proxy = %s", proxy.String())
	}
	if info["tag"] != "http-in" || info["protocol"] != "http" {
		t.Fatalf("info = %#v", info)
	}
}

func TestLocalInboundProxyURLAddsAuth(t *testing.T) {
	proxy, _ := localInboundProxyURL([]any{
		map[string]any{
			"tag": "socks-in", "protocol": "socks", "listen": "::", "port": 10808,
			"settings": map[string]any{"accounts": []any{map[string]any{"user": "u", "pass": "p"}}},
		},
	}, "socks")
	if proxy == nil {
		t.Fatal("expected proxy URL")
	}
	if proxy.String() != "socks5://u:p@127.0.0.1:10808" {
		t.Fatalf("proxy = %s", proxy.String())
	}
}
