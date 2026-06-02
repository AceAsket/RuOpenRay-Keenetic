package main

import (
	"path/filepath"
	"testing"
)

func TestValidateConfigWithGeoAuditAttachesAudit(t *testing.T) {
	dataDir := t.TempDir()
	state := &serverState{cfg: appConfig{
		DataDir:      dataDir,
		ActiveConfig: filepath.Join(dataDir, "config.json"),
		GeoDir:       filepath.Join(dataDir, "geo"),
	}}
	cfg := defaultConfig()
	cfg["routing"] = map[string]any{"rules": []any{
		map[string]any{"type": "field", "ip": []any{"geoip:private"}, "outboundTag": "direct"},
	}}
	result := state.validateConfigWithGeoAudit(cfg)
	if result["geoAudit"] == nil {
		t.Fatalf("geoAudit was not attached: %#v", result)
	}
	if result["ok"] != false {
		t.Fatalf("expected config check to fail when Geo Doctor finds missing geo files: %#v", result)
	}
	audit, _ := result["geoAudit"].(map[string]any)
	summary, _ := audit["summary"].(map[string]any)
	if summary["missing"] == nil {
		t.Fatalf("geoAudit summary missing missing count: %#v", audit)
	}
}

func TestValidateConfigWithGeoAuditAttachesAnalysis(t *testing.T) {
	dataDir := t.TempDir()
	state := &serverState{cfg: appConfig{
		DataDir:      dataDir,
		ActiveConfig: filepath.Join(dataDir, "config.json"),
		GeoDir:       filepath.Join(dataDir, "geo"),
	}}
	cfg := defaultConfig()
	cfg["routing"] = map[string]any{"rules": []any{
		map[string]any{"type": "field", "domain": []any{"default"}, "outboundTag": "direct"},
	}}
	result := state.validateConfigWithGeoAudit(cfg)
	analysis, _ := result["analysis"].(map[string]any)
	warnings, _ := analysis["warnings"].([]string)
	if len(warnings) == 0 {
		t.Fatalf("analysis warnings were not attached: %#v", result)
	}
}
