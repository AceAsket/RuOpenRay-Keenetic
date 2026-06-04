package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCleanupStorageOldBackupsKeepsNewest(t *testing.T) {
	dir := t.TempDir()
	oldPath := filepath.Join(dir, "ruopenray-ui-20260604-080000")
	newPath := filepath.Join(dir, "ruopenray-ui-20260604-090000")
	if err := os.WriteFile(oldPath, []byte("old"), 0o600); err != nil {
		t.Fatalf("write old backup: %v", err)
	}
	if err := os.WriteFile(newPath, []byte("new"), 0o600); err != nil {
		t.Fatalf("write new backup: %v", err)
	}
	oldTime := time.Unix(1770000000, 0)
	newTime := oldTime.Add(time.Hour)
	if err := os.Chtimes(oldPath, oldTime, oldTime); err != nil {
		t.Fatalf("chtimes old backup: %v", err)
	}
	if err := os.Chtimes(newPath, newTime, newTime); err != nil {
		t.Fatalf("chtimes new backup: %v", err)
	}

	state := &serverState{cfg: appConfig{BackupDir: dir}}
	result := state.cleanupStorage(map[string]any{"target": "old-backups"})
	if result["ok"] != true {
		t.Fatalf("cleanup failed: %#v", result)
	}
	if _, err := os.Stat(newPath); err != nil {
		t.Fatalf("newest backup was not kept: %v", err)
	}
	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Fatalf("old backup still exists or unexpected error: %v", err)
	}
	if numberAny(result["deleted"]) != 1 {
		t.Fatalf("deleted = %#v, want 1", result["deleted"])
	}
}
