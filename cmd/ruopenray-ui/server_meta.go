package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type serverMeta struct {
	Country string `json:"country,omitempty"`
	Label   string `json:"label,omitempty"`
}

var serverCountryCodeRe = regexp.MustCompile(`^[A-Z]{2}$`)

func (s *serverState) serverMetaPath() string {
	return filepath.Join(s.cfg.DataDir, "server-meta.json")
}

func (s *serverState) serverMeta() map[string]serverMeta {
	body, err := os.ReadFile(s.serverMetaPath())
	if err != nil {
		return map[string]serverMeta{}
	}
	var items map[string]serverMeta
	if err := json.Unmarshal(body, &items); err != nil || items == nil {
		return map[string]serverMeta{}
	}
	return sanitizeServerMeta(items)
}

func sanitizeServerMeta(raw map[string]serverMeta) map[string]serverMeta {
	items := make(map[string]serverMeta, len(raw))
	for key, value := range raw {
		cleanKey := strings.TrimSpace(key)
		if cleanKey == "" {
			continue
		}
		country := strings.ToUpper(strings.TrimSpace(value.Country))
		label := strings.TrimSpace(value.Label)
		if country != "" && !serverCountryCodeRe.MatchString(country) {
			country = ""
		}
		if len(label) > 80 {
			label = label[:80]
		}
		if country == "" && label == "" {
			continue
		}
		items[cleanKey] = serverMeta{Country: country, Label: label}
	}
	return items
}

func serverMetaFromPayload(payload map[string]any) map[string]serverMeta {
	raw, _ := payload["items"].(map[string]any)
	items := make(map[string]serverMeta, len(raw))
	for key, value := range raw {
		itemMap, _ := value.(map[string]any)
		if itemMap == nil {
			continue
		}
		country, _ := itemMap["country"].(string)
		label, _ := itemMap["label"].(string)
		items[strings.TrimSpace(key)] = serverMeta{Country: country, Label: label}
	}
	return sanitizeServerMeta(items)
}

func (s *serverState) serverMetaReport() map[string]any {
	return map[string]any{"ok": true, "items": s.serverMeta()}
}

func (s *serverState) saveServerMeta(payload map[string]any) map[string]any {
	items := serverMetaFromPayload(payload)
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "items": s.serverMeta()}
	}
	body, err := json.MarshalIndent(items, "", "  ")
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "items": s.serverMeta()}
	}
	if err := os.WriteFile(s.serverMetaPath(), body, 0o600); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "items": s.serverMeta()}
	}
	return map[string]any{"ok": true, "items": items}
}
