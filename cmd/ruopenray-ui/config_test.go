package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadAppConfigDefaultsPaths(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	t.Setenv("RUOPENRAY_DATA_DIR", dataDir)
	t.Setenv("RUOPENRAY_ACTIVE_CONFIG", "")
	t.Setenv("RUOPENRAY_PROFILES_DIR", "")
	t.Setenv("RUOPENRAY_BACKUP_DIR", "")
	t.Setenv("RUOPENRAY_GEO_DIR", "")

	cfg := loadAppConfig()
	if cfg.DataDir != dataDir {
		t.Fatalf("unexpected data dir: %s", cfg.DataDir)
	}
	if cfg.ActiveConfig != filepath.Join(dataDir, "config.json") {
		t.Fatalf("unexpected active config: %s", cfg.ActiveConfig)
	}
	if cfg.ProfilesDir != filepath.Join(dataDir, "profiles") {
		t.Fatalf("unexpected profiles dir: %s", cfg.ProfilesDir)
	}
	if cfg.BackupDir != filepath.Join(dataDir, "backups") {
		t.Fatalf("unexpected backup dir: %s", cfg.BackupDir)
	}
}

func TestEnsureDataCreatesDefaultProfile(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	cfg := appConfig{
		DataDir:      dataDir,
		ProfilesDir:  filepath.Join(dataDir, "profiles"),
		BackupDir:    filepath.Join(dataDir, "backups"),
		ActiveConfig: filepath.Join(dataDir, "config.json"),
	}
	state := &serverState{cfg: cfg}

	if err := state.ensureData(); err != nil {
		t.Fatalf("ensureData returned error: %v", err)
	}
	for _, path := range []string{cfg.ActiveConfig, filepath.Join(cfg.ProfilesDir, "default.json")} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("expected file %s: %v", path, err)
		}
	}
}

func TestAnalyzeConfigWarnsAboutMissingTransparentInbound(t *testing.T) {
	state := &serverState{cfg: appConfig{GeoDir: t.TempDir()}}
	result := state.analyzeConfig(map[string]any{
		"inbounds": []any{
			map[string]any{"tag": "socks-in", "listen": "127.0.0.1", "port": 10808, "protocol": "socks"},
			map[string]any{"tag": "ruopenray_dns_in", "listen": "127.0.0.1", "port": 5353, "protocol": "dokodemo-door", "settings": map[string]any{"network": "tcp,udp"}},
		},
		"outbounds": []any{
			map[string]any{"tag": "proxy", "protocol": "vless"},
			map[string]any{"tag": "dns-out", "protocol": "dns"},
		},
		"routing": map[string]any{"rules": []any{
			map[string]any{"type": "field", "port": "443", "network": "udp", "outboundTag": "proxy"},
			map[string]any{"type": "field", "inboundTag": []any{"ruopenray_dns_in"}, "outboundTag": "dns-out"},
		}},
	})
	warnings := strings.Join(stringSlice(result["warnings"]), "\n")
	if !strings.Contains(warnings, "Нет входящего потока перехвата") {
		t.Fatalf("expected transparent capture warning, got %#v", result["warnings"])
	}
}

func TestAnalyzeConfigRejectsMissingOutboundTag(t *testing.T) {
	state := &serverState{cfg: appConfig{GeoDir: t.TempDir()}}
	result := state.analyzeConfig(map[string]any{
		"inbounds": []any{
			map[string]any{"tag": "transparent_ipv4", "listen": "0.0.0.0", "port": 52345, "protocol": "dokodemo-door", "settings": map[string]any{"followRedirect": true}},
		},
		"outbounds": []any{
			map[string]any{"tag": "direct", "protocol": "freedom"},
			map[string]any{"tag": "block", "protocol": "blackhole"},
		},
		"routing": map[string]any{"rules": []any{
			map[string]any{"type": "field", "inboundTag": []any{"transparent_ipv4"}, "outboundTag": "proxy"},
		}},
	})
	errors := strings.Join(stringSlice(result["errors"]), "\n")
	if !strings.Contains(errors, `сервер "proxy"`) {
		t.Fatalf("expected missing proxy route target error, got %#v", result["errors"])
	}
}
