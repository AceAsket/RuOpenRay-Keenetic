package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/AceAsket/RuOpenRay-Keenetic/internal/geodata"
)

func (s *serverState) geoSourcesPath() string {
	return filepath.Join(s.cfg.DataDir, "geo-sources.json")
}

func (s *serverState) geoCustomSources() []map[string]any {
	body, err := os.ReadFile(s.geoSourcesPath())
	if err != nil {
		return []map[string]any{}
	}
	var raw []map[string]any
	if json.Unmarshal(body, &raw) != nil {
		return []map[string]any{}
	}
	sources := make([]map[string]any, 0, len(raw))
	for index, item := range raw {
		sources = append(sources, geodata.NormalizeSource(item, index))
	}
	return sources
}

func (s *serverState) saveGeoCustomSources(payload map[string]any) map[string]any {
	var raw []map[string]any
	if values, ok := payload["sources"].([]any); ok {
		for _, value := range values {
			if item, ok := value.(map[string]any); ok {
				raw = append(raw, item)
			}
		}
	}
	sources := make([]map[string]any, 0, len(raw))
	seen := map[string]bool{}
	for index, item := range raw {
		source := geodata.NormalizeSource(item, index)
		id := fmt.Sprint(source["id"])
		if seen[id] {
			source["id"] = fmt.Sprintf("%s-%d", id, index+1)
		}
		seen[fmt.Sprint(source["id"])] = true
		sources = append(sources, source)
	}
	body, _ := json.MarshalIndent(sources, "", "  ")
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	if err := os.WriteFile(s.geoSourcesPath(), body, 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "sources": sources}
	}
	return map[string]any{"ok": true, "sources": sources, "status": s.geoStatus(), "stdout": "Свои источники geodata сохранены"}
}
