package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPrepareActiveLogFilesMigratesVolatilePaths(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	state := &serverState{cfg: appConfig{
		DataDir:      dataDir,
		ActiveConfig: filepath.Join(dataDir, "config.json"),
	}}
	cfg := map[string]any{
		"log": map[string]any{
			"loglevel": "warning",
			"access":   "/tmp/ruopenray/access.log",
			"error":    legacyErrorLogPath,
		},
	}
	if err := state.writeActiveConfigRaw(cfg); err != nil {
		t.Fatalf("write active config: %v", err)
	}
	if err := state.prepareActiveLogFiles(); err != nil {
		t.Fatalf("prepareActiveLogFiles returned error: %v", err)
	}
	read, err := state.readActiveConfig()
	if err != nil {
		t.Fatalf("read active config: %v", err)
	}
	logConfig, _ := read["log"].(map[string]any)
	if got := logConfig["access"]; got != state.defaultAccessLogPath() {
		t.Fatalf("access path = %v, want %s", got, state.defaultAccessLogPath())
	}
	if got := logConfig["error"]; got != state.defaultErrorLogPath() {
		t.Fatalf("error path = %v, want %s", got, state.defaultErrorLogPath())
	}
}

func TestPrepareActiveLogFilesKeepsPersistentCustomPath(t *testing.T) {
	baseDir, err := os.MkdirTemp(".", ".settings-log-test-")
	if err != nil {
		t.Fatalf("create persistent test dir: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(baseDir) })
	baseDir, err = filepath.Abs(baseDir)
	if err != nil {
		t.Fatalf("resolve persistent test dir: %v", err)
	}
	dataDir := filepath.Join(baseDir, "data")
	customDir := filepath.Join(dataDir, "custom")
	customPath := filepath.Join(customDir, "xray-access.log")
	state := &serverState{cfg: appConfig{
		DataDir:      dataDir,
		ActiveConfig: filepath.Join(dataDir, "config.json"),
	}}
	cfg := map[string]any{
		"log": map[string]any{
			"loglevel": "warning",
			"access":   customPath,
		},
	}
	if err := state.writeActiveConfigRaw(cfg); err != nil {
		t.Fatalf("write active config: %v", err)
	}
	if err := state.prepareActiveLogFiles(); err != nil {
		t.Fatalf("prepareActiveLogFiles returned error: %v", err)
	}
	read, err := state.readActiveConfig()
	if err != nil {
		t.Fatalf("read active config: %v", err)
	}
	logConfig, _ := read["log"].(map[string]any)
	if got := logConfig["access"]; got != customPath {
		t.Fatalf("access path = %v, want %s", got, customPath)
	}
}

func TestLoggingSettingsPrefersSavedLevel(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	state := &serverState{cfg: appConfig{
		DataDir:      dataDir,
		ActiveConfig: filepath.Join(dataDir, "config.json"),
	}}
	if err := state.writeActiveConfigRaw(map[string]any{
		"log": map[string]any{
			"loglevel": "debug",
		},
	}); err != nil {
		t.Fatalf("write active config: %v", err)
	}
	if err := state.writeLoggingRuntimeSettings(map[string]any{
		"level": "warning",
	}); err != nil {
		t.Fatalf("write logging settings: %v", err)
	}

	settings := state.loggingSettings()
	if settings["ok"] != true {
		t.Fatalf("loggingSettings failed: %#v", settings)
	}
	if got := settings["level"]; got != "warning" {
		t.Fatalf("level = %v, want warning", got)
	}
	if got := settings["appliedLevel"]; got != "debug" {
		t.Fatalf("appliedLevel = %v, want debug", got)
	}
	if got := settings["levelPending"]; got != true {
		t.Fatalf("levelPending = %v, want true", got)
	}
}

func TestClearLogFilesRemovesRotatedArchives(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	state := &serverState{cfg: appConfig{
		DataDir:      dataDir,
		ActiveConfig: filepath.Join(dataDir, "config.json"),
	}}
	if err := os.MkdirAll(filepath.Join(dataDir, "logs"), 0o755); err != nil {
		t.Fatalf("make logs dir: %v", err)
	}
	access := state.defaultAccessLogPath()
	for path, body := range map[string]string{
		access:           "active",
		access + ".1":    "rotated",
		access + ".1.gz": "compressed",
	} {
		if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}

	result := state.clearLogFiles()
	if result["ok"] != true {
		t.Fatalf("clearLogFiles failed: %#v", result)
	}
	if body, err := os.ReadFile(access); err != nil || len(body) != 0 {
		t.Fatalf("active log was not truncated: len=%d err=%v", len(body), err)
	}
	for _, path := range []string{access + ".1", access + ".1.gz"} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("rotated log still exists: %s err=%v", path, err)
		}
	}
}

func TestRotateLogFileKeepsSingleCopy(t *testing.T) {
	path := filepath.Join(t.TempDir(), "access.log")
	if err := os.WriteFile(path, []byte(strings.Repeat("line\n", 1024)), 0o600); err != nil {
		t.Fatalf("write log: %v", err)
	}
	if err := os.WriteFile(path+".1", []byte("old"), 0o600); err != nil {
		t.Fatalf("write old rotated log: %v", err)
	}
	beforeInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat active log before rotate: %v", err)
	}

	if err := rotateLogFile(path, 1, 256); err != nil {
		t.Fatalf("rotateLogFile returned error: %v", err)
	}
	afterInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat active log after rotate: %v", err)
	}
	if !os.SameFile(beforeInfo, afterInfo) {
		t.Fatalf("active log was replaced; rotation must truncate in place so Xray keeps writing to the visible log")
	}
	if body, err := os.ReadFile(path); err != nil || len(body) != 0 {
		t.Fatalf("active log was not recreated empty: len=%d err=%v", len(body), err)
	}
	if !fileExists(path+".1") && !fileExists(path+".1.gz") {
		t.Fatalf("rotated log was not created")
	}
	if fileExists(path + ".2") {
		t.Fatalf("extra rotated copy exists")
	}
}

func TestMaintainLogFilesTrimsExistingRotatedCopy(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	state := &serverState{cfg: appConfig{
		DataDir:      dataDir,
		ActiveConfig: filepath.Join(dataDir, "config.json"),
	}}
	if err := state.writeLoggingRuntimeSettings(map[string]any{
		"ok":           true,
		"accessPath":   state.defaultAccessLogPath(),
		"errorPath":    state.defaultErrorLogPath(),
		"maxSizeMb":    1,
		"rotateCopies": 1,
	}); err != nil {
		t.Fatalf("write logging settings: %v", err)
	}
	if err := state.writeActiveConfigRaw(map[string]any{"log": map[string]any{}}); err != nil {
		t.Fatalf("write active config: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "logs"), 0o755); err != nil {
		t.Fatalf("make logs dir: %v", err)
	}
	access := state.defaultAccessLogPath()
	if err := os.WriteFile(access, []byte("active"), 0o600); err != nil {
		t.Fatalf("write active log: %v", err)
	}
	if err := os.WriteFile(access+".1", []byte(strings.Repeat("x", 2*1024*1024)), 0o600); err != nil {
		t.Fatalf("write rotated log: %v", err)
	}

	result := state.maintainLogFiles(false)
	if result["ok"] != true {
		t.Fatalf("maintainLogFiles failed: %#v", result)
	}
	if fileExists(access + ".1") {
		info, err := os.Stat(access + ".1")
		if err != nil {
			t.Fatalf("stat rotated log: %v", err)
		}
		if info.Size() > 1024*1024 {
			t.Fatalf("rotated log was not trimmed: %d", info.Size())
		}
	}
}
