package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestGeoAuditReportsUsedDatFiles(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "config.json")
	geoDir := filepath.Join(dir, "geo")
	if err := os.MkdirAll(geoDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(geoDir, "geoip.dat"), []byte("geoip"), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg := map[string]any{
		"routing": map[string]any{
			"rules": []any{
				map[string]any{"type": "field", "ip": []any{"geoip:private"}, "outboundTag": "direct"},
				map[string]any{"type": "field", "domain": []any{"geosite:ru", `ext:"LoyalsoldierSite.dat:antifilter-community"`}, "outboundTag": "proxy"},
			},
		},
	}
	body, _ := json.Marshal(cfg)
	if err := os.WriteFile(configPath, body, 0o600); err != nil {
		t.Fatal(err)
	}
	state := &serverState{cfg: appConfig{ActiveConfig: configPath, GeoDir: geoDir}}

	audit := state.geoAudit()
	if audit["ok"] == true {
		t.Fatalf("geoAudit should be false when geosite/ext files are missing: %#v", audit)
	}
	summary := audit["summary"].(map[string]any)
	if summary["total"] != 3 {
		t.Fatalf("expected 3 geo refs, got %#v", summary["total"])
	}
	if summary["missing"] != 2 {
		t.Fatalf("expected 2 missing refs, got %#v", summary["missing"])
	}
}

func TestGeoProbeConfigDoesNotBindPort(t *testing.T) {
	state := &serverState{}
	cfg := state.geoProbeConfig("geoip", "private")
	if len(asArray(cfg["inbounds"])) != 0 {
		t.Fatalf("geo probe should not create inbounds or bind ports: %#v", cfg["inbounds"])
	}
	routing := cfg["routing"].(map[string]any)
	rules := asArray(routing["rules"])
	if len(rules) != 1 {
		t.Fatalf("expected one probe rule, got %#v", rules)
	}
}
