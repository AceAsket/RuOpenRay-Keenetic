package main

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRemoveGeoCronLines(t *testing.T) {
	content := "0 4 * * 0 /usr/bin/ruopenray-ui --geo-update-scheduled # RuOpenRay geo update\n15 3 * * * echo keep\n"
	next, changed := removeGeoCronLines(content)
	if !changed {
		t.Fatal("removeGeoCronLines did not report change")
	}
	if strings.Contains(next, geoCronMarker) {
		t.Fatalf("geo cron marker still present: %q", next)
	}
	if !strings.Contains(next, "echo keep") {
		t.Fatalf("unrelated cron line was removed: %q", next)
	}
}

func TestRemoveGeoCronLinesUnchanged(t *testing.T) {
	content := "15 3 * * * echo keep\n"
	next, changed := removeGeoCronLines(content)
	if changed {
		t.Fatal("removeGeoCronLines reported change for unrelated crontab")
	}
	if next != content {
		t.Fatalf("content changed: %q", next)
	}
}

func TestBackupBundleSkipsBackupDir(t *testing.T) {
	dir := t.TempDir()
	dataDir := filepath.Join(dir, "data")
	backupDir := filepath.Join(dataDir, "backups")
	activeConfig := filepath.Join(dir, "config.json")
	if err := os.MkdirAll(filepath.Join(dataDir, "profiles"), 0o755); err != nil {
		t.Fatalf("create data dirs: %v", err)
	}
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		t.Fatalf("create backup dir: %v", err)
	}
	if err := os.WriteFile(activeConfig, []byte(`{"outbounds":[]}`), 0o600); err != nil {
		t.Fatalf("write active config: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, "profiles", "default.json"), []byte(`{}`), 0o600); err != nil {
		t.Fatalf("write profile: %v", err)
	}
	if err := os.WriteFile(filepath.Join(backupDir, "old.json"), []byte(`old`), 0o600); err != nil {
		t.Fatalf("write old backup: %v", err)
	}

	state := &serverState{cfg: appConfig{DataDir: dataDir, BackupDir: backupDir, ActiveConfig: activeConfig}}
	bundlePath, err := state.backupBundle()
	if err != nil {
		t.Fatalf("backupBundle returned error: %v", err)
	}
	reader, err := zip.OpenReader(bundlePath)
	if err != nil {
		t.Fatalf("open bundle: %v", err)
	}
	defer reader.Close()

	names := map[string]bool{}
	for _, file := range reader.File {
		names[file.Name] = true
	}
	if !names["xray/config.json"] {
		t.Fatalf("bundle entries missing xray/config.json: %#v", names)
	}
	if !names["data/profiles/default.json"] {
		t.Fatalf("bundle entries missing profile: %#v", names)
	}
	if names["data/backups/old.json"] {
		t.Fatalf("backup dir was included in full backup: %#v", names)
	}
}
