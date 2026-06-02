package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func (s *serverState) configDraftPath() string {
	return filepath.Join(s.cfg.DataDir, "config-draft.json")
}

func (s *serverState) readConfigDraft() map[string]any {
	path := s.configDraftPath()
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]any{"ok": true, "exists": false}
		}
		return map[string]any{"ok": false, "exists": false, "error": err.Error()}
	}
	body, err := os.ReadFile(path)
	if err != nil {
		return map[string]any{"ok": false, "exists": false, "error": err.Error()}
	}
	var cfg map[string]any
	if err := json.Unmarshal(body, &cfg); err != nil {
		return map[string]any{"ok": false, "exists": false, "error": err.Error()}
	}
	normalizeCatchAllRoutingRules(cfg)
	return map[string]any{
		"ok":        true,
		"exists":    true,
		"config":    cfg,
		"updatedAt": info.ModTime().Format(time.RFC3339),
		"path":      path,
	}
}

func (s *serverState) saveConfigDraft(payload map[string]any) map[string]any {
	cfg, ok := payload["config"].(map[string]any)
	if !ok || cfg == nil {
		return map[string]any{"ok": false, "error": "config draft is missing"}
	}
	normalizeCatchAllRoutingRules(cfg)
	body, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	path := s.configDraftPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if err := os.WriteFile(path, body, 0o600); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	return map[string]any{"ok": true, "exists": true, "updatedAt": time.Now().Format(time.RFC3339), "path": path}
}

func (s *serverState) clearConfigDraft() map[string]any {
	path := s.configDraftPath()
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return map[string]any{"ok": false, "error": fmt.Sprintf("remove draft: %v", err)}
	}
	return map[string]any{"ok": true, "exists": false}
}
