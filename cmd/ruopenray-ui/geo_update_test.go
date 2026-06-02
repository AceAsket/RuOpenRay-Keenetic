package main

import "testing"

func TestSeparateGeoTargets(t *testing.T) {
	geoip, geosite := separateGeoTargets("runet")
	if geoip != "runet-geoip.dat" || geosite != "runet-geosite.dat" {
		t.Fatalf("unexpected targets: %s %s", geoip, geosite)
	}
}

func TestNormalizeGeoPresetOverridesKeepsMode(t *testing.T) {
	overrides := normalizeGeoPresetOverrides(map[string]map[string]any{
		"runetfreedom": {"mode": "separate", "target": "runet"},
	})
	if overrides["runetfreedom"]["mode"] != "separate" {
		t.Fatalf("expected separate mode, got %#v", overrides["runetfreedom"])
	}
}
