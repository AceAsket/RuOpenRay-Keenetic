package main

import (
	"testing"

	rproxy "github.com/AceAsket/RuOpenRay-Keenetic/internal/proxy"
)

func TestEnsureFragmentOutboundsAddsCompanion(t *testing.T) {
	tag := rproxy.FragmentOutboundTag("100-200,10-20,tlshello")
	outbounds := []any{map[string]any{
		"tag": "proxy", "protocol": "vless",
		"streamSettings": map[string]any{"sockopt": map[string]any{"dialerProxy": tag}},
	}}
	got := ensureFragmentOutbounds(outbounds)
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2: %#v", len(got), got)
	}
	companion := got[1].(map[string]any)
	if companion["tag"] != tag || companion["protocol"] != "freedom" {
		t.Fatalf("companion = %#v", companion)
	}
}

func TestEnsureFragmentOutboundsDoesNotDuplicate(t *testing.T) {
	tag := rproxy.FragmentOutboundTag("100-200,10-20,tlshello")
	companion, _ := rproxy.FragmentOutboundFromTag(tag)
	outbounds := []any{
		map[string]any{"tag": "proxy", "streamSettings": map[string]any{"sockopt": map[string]any{"dialerProxy": tag}}},
		companion,
	}
	got := ensureFragmentOutbounds(outbounds)
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2: %#v", len(got), got)
	}
}
