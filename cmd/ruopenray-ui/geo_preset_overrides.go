package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func (s *serverState) geoPresetOverridesPath() string {
	return filepath.Join(s.cfg.DataDir, "geo-preset-overrides.json")
}

func (s *serverState) geoPresetOverrides() map[string]map[string]any {
	body, err := os.ReadFile(s.geoPresetOverridesPath())
	if err != nil {
		return map[string]map[string]any{}
	}
	var raw map[string]map[string]any
	if json.Unmarshal(body, &raw) != nil {
		return map[string]map[string]any{}
	}
	return normalizeGeoPresetOverrides(raw)
}

func normalizeGeoPresetOverrides(raw map[string]map[string]any) map[string]map[string]any {
	known := map[string]bool{}
	for _, preset := range geoPresets() {
		known[fmt.Sprint(preset["id"])] = true
	}
	overrides := map[string]map[string]any{}
	for id, item := range raw {
		cleanID := strings.TrimSpace(id)
		if cleanID == "" || !known[cleanID] {
			continue
		}
		next := map[string]any{}
		for _, key := range []string{"name", "purpose", "detail", "compat", "mode", "geoipUrl", "geositeUrl", "url", "target", "ruleHint"} {
			value := strings.TrimSpace(fmt.Sprint(item[key]))
			if value != "" && value != "<nil>" {
				next[key] = value
			}
		}
		if enabled, ok := item["enabled"].(bool); ok {
			next["enabled"] = enabled
		}
		if len(next) > 0 {
			overrides[cleanID] = next
		}
	}
	return overrides
}

func (s *serverState) saveGeoPresetOverrides(payload map[string]any) map[string]any {
	raw := map[string]map[string]any{}
	if values, ok := payload["overrides"].(map[string]any); ok {
		for id, value := range values {
			if item, ok := value.(map[string]any); ok {
				raw[id] = item
			}
		}
	}
	overrides := normalizeGeoPresetOverrides(raw)
	body, _ := json.MarshalIndent(overrides, "", "  ")
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "overrides": s.geoPresetOverrides()}
	}
	if err := os.WriteFile(s.geoPresetOverridesPath(), body, 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "overrides": overrides}
	}
	return map[string]any{"ok": true, "overrides": overrides, "status": s.geoStatus(), "stdout": "Переопределения geo-источников сохранены"}
}
