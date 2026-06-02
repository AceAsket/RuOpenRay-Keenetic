package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func (s *serverState) routeNamesPath() string {
	return filepath.Join(s.cfg.DataDir, "route-names.json")
}

func (s *serverState) routeNames() map[string]string {
	body, err := os.ReadFile(s.routeNamesPath())
	if err != nil {
		return map[string]string{}
	}
	var names map[string]string
	if err := json.Unmarshal(body, &names); err != nil || names == nil {
		return map[string]string{}
	}
	return sanitizeRouteNames(names)
}

func sanitizeRouteNames(raw map[string]string) map[string]string {
	names := make(map[string]string, len(raw))
	for key, value := range raw {
		cleanKey := strings.TrimSpace(key)
		cleanValue := strings.TrimSpace(value)
		if cleanKey == "" || cleanValue == "" {
			continue
		}
		names[cleanKey] = cleanValue
	}
	return names
}

func routeNamesFromPayload(payload map[string]any) map[string]string {
	raw, _ := payload["names"].(map[string]any)
	names := make(map[string]string, len(raw))
	for key, value := range raw {
		if value == nil {
			continue
		}
		cleanValue := strings.TrimSpace(fmt.Sprint(value))
		if strings.TrimSpace(key) == "" || cleanValue == "" {
			continue
		}
		names[strings.TrimSpace(key)] = cleanValue
	}
	return names
}

func (s *serverState) routeNamesReport() map[string]any {
	return map[string]any{"ok": true, "names": s.routeNames()}
}

func (s *serverState) saveRouteNames(payload map[string]any) map[string]any {
	names := routeNamesFromPayload(payload)
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "names": s.routeNames()}
	}
	body, err := json.MarshalIndent(names, "", "  ")
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "names": s.routeNames()}
	}
	if err := os.WriteFile(s.routeNamesPath(), body, 0o600); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "names": s.routeNames()}
	}
	return map[string]any{"ok": true, "names": names}
}
