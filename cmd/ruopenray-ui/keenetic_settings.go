package main

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

func (s *serverState) keeneticSettingsPath() string {
	return filepath.Join(s.cfg.DataDir, "keenetic-settings.json")
}

func defaultKeeneticSettings() map[string]any {
	return map[string]any{
		"ipv6Mode":          "observe",
		"entwareProxy":      false,
		"fdMonitor":         true,
		"dscpMode":          "off",
		"dscpProxy":         63,
		"dscpDirect":        62,
		"nativePolicyMode":  "manual",
		"ipExcludeText":     "",
		"portProxyText":     "",
		"portExcludeText":   "",
		"downloadRetries":   3,
		"offlineInstall":    false,
		"adguardCompatMode": "observe",
	}
}

func (s *serverState) readKeeneticSettingsRaw() map[string]any {
	settings := defaultKeeneticSettings()
	body, err := os.ReadFile(s.keeneticSettingsPath())
	if err != nil {
		return settings
	}
	var saved map[string]any
	if json.Unmarshal(body, &saved) != nil {
		return settings
	}
	for key, value := range saved {
		settings[key] = value
	}
	return settings
}

func cleanKeeneticMode(value any, fallback string, allowed ...string) string {
	raw := strings.ToLower(strings.TrimSpace(fmt.Sprint(value)))
	for _, item := range allowed {
		if raw == item {
			return raw
		}
	}
	return fallback
}

func cleanKeeneticDSCP(value any, fallback int) int {
	out := number(value, fallback)
	if out < 0 {
		return 0
	}
	if out > 63 {
		return 63
	}
	return out
}

func cleanKeeneticRetries(value any) int {
	out := number(value, 3)
	if out < 1 {
		return 1
	}
	if out > 10 {
		return 10
	}
	return out
}

func splitKeeneticTextList(value any) []string {
	out := []string{}
	for _, item := range stringList(value) {
		for _, part := range strings.FieldsFunc(item, func(r rune) bool {
			return r == ',' || r == '\n' || r == '\r' || r == '\t' || r == ' '
		}) {
			part = strings.TrimSpace(part)
			if part != "" {
				out = append(out, part)
			}
		}
	}
	return out
}

func normalizeKeeneticCIDRList(value any) ([]string, []string) {
	items := []string{}
	rejected := []string{}
	seen := map[string]bool{}
	for _, raw := range splitKeeneticTextList(value) {
		if net.ParseIP(raw) == nil {
			if _, _, err := net.ParseCIDR(raw); err != nil {
				rejected = append(rejected, raw)
				continue
			}
		}
		if !seen[raw] {
			seen[raw] = true
			items = append(items, raw)
		}
	}
	return items, rejected
}

var keeneticPortPattern = regexp.MustCompile(`^\d{1,5}(?::\d{1,5})?$`)

func normalizeKeeneticPortList(value any) ([]string, []string) {
	items := []string{}
	rejected := []string{}
	seen := map[string]bool{}
	for _, raw := range splitKeeneticTextList(value) {
		if !keeneticPortPattern.MatchString(raw) {
			rejected = append(rejected, raw)
			continue
		}
		parts := strings.Split(raw, ":")
		first := number(parts[0], 0)
		last := first
		if len(parts) == 2 {
			last = number(parts[1], 0)
		}
		if first < 1 || first > 65535 || last < 1 || last > 65535 || first > last {
			rejected = append(rejected, raw)
			continue
		}
		if !seen[raw] {
			seen[raw] = true
			items = append(items, raw)
		}
	}
	return items, rejected
}

func (s *serverState) normalizeKeeneticSettings(payload map[string]any) map[string]any {
	current := s.readKeeneticSettingsRaw()
	settings := defaultKeeneticSettings()
	for key, value := range current {
		settings[key] = value
	}
	for key, value := range payload {
		settings[key] = value
	}
	settings["ipv6Mode"] = cleanKeeneticMode(settings["ipv6Mode"], "observe", "observe", "disable", "allow")
	settings["entwareProxy"] = boolPayload(settings, "entwareProxy", false)
	settings["fdMonitor"] = boolPayload(settings, "fdMonitor", true)
	settings["dscpMode"] = cleanKeeneticMode(settings["dscpMode"], "off", "off", "tproxy")
	settings["dscpProxy"] = cleanKeeneticDSCP(settings["dscpProxy"], 63)
	settings["dscpDirect"] = cleanKeeneticDSCP(settings["dscpDirect"], 62)
	settings["nativePolicyMode"] = cleanKeeneticMode(settings["nativePolicyMode"], "manual", "manual", "observe")
	settings["downloadRetries"] = cleanKeeneticRetries(settings["downloadRetries"])
	settings["offlineInstall"] = boolPayload(settings, "offlineInstall", false)
	settings["adguardCompatMode"] = cleanKeeneticMode(settings["adguardCompatMode"], "observe", "observe", "manual")
	settings["ipExcludeText"] = strings.Join(normalizeNewlineList(settings["ipExcludeText"]), "\n")
	settings["portProxyText"] = strings.Join(normalizeNewlineList(settings["portProxyText"]), "\n")
	settings["portExcludeText"] = strings.Join(normalizeNewlineList(settings["portExcludeText"]), "\n")
	return settings
}

func normalizeNewlineList(value any) []string {
	items := []string{}
	seen := map[string]bool{}
	for _, raw := range splitKeeneticTextList(value) {
		if !seen[raw] {
			seen[raw] = true
			items = append(items, raw)
		}
	}
	return items
}

func (s *serverState) keeneticSettings() map[string]any {
	settings := s.normalizeKeeneticSettings(map[string]any{})
	ipExclude, ipRejected := normalizeKeeneticCIDRList(settings["ipExcludeText"])
	portProxy, portProxyRejected := normalizeKeeneticPortList(settings["portProxyText"])
	portExclude, portExcludeRejected := normalizeKeeneticPortList(settings["portExcludeText"])
	return map[string]any{
		"ok":               true,
		"platform":         s.cfg.Platform,
		"settings":         settings,
		"ipExclude":        ipExclude,
		"portProxy":        portProxy,
		"portExclude":      portExclude,
		"rejected":         map[string]any{"ipExclude": ipRejected, "portProxy": portProxyRejected, "portExclude": portExcludeRejected},
		"appliedFeatures":  map[string]any{"externalLists": true, "dscp": settings["dscpMode"] == "tproxy", "ipv6": settings["ipv6Mode"] == "disable", "entwareProxy": settings["entwareProxy"] == true, "nativePolicy": false},
		"settingsPath":     s.keeneticSettingsPath(),
		"firewallHookPath": keeneticRedirectHookPath,
	}
}

func (s *serverState) saveKeeneticSettings(payload map[string]any) map[string]any {
	settings := s.normalizeKeeneticSettings(payload)
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "settings": s.keeneticSettings()}
	}
	body, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "settings": s.keeneticSettings()}
	}
	body = append(body, '\n')
	if err := os.WriteFile(s.keeneticSettingsPath(), body, 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "settings": s.keeneticSettings()}
	}
	return map[string]any{"ok": true, "settings": s.keeneticSettings(), "stdout": "Настройки Keenetic сохранены"}
}

func (s *serverState) keeneticExternalFirewallLists(payload map[string]any) map[string][]string {
	settings := s.normalizeKeeneticSettings(map[string]any{})
	if v, ok := payload["keeneticIpExclude"]; ok {
		settings["ipExcludeText"] = v
	}
	if v, ok := payload["keeneticPortProxy"]; ok {
		settings["portProxyText"] = v
	}
	if v, ok := payload["keeneticPortExclude"]; ok {
		settings["portExcludeText"] = v
	}
	ipExclude, _ := normalizeKeeneticCIDRList(settings["ipExcludeText"])
	portProxy, _ := normalizeKeeneticPortList(settings["portProxyText"])
	portExclude, _ := normalizeKeeneticPortList(settings["portExcludeText"])
	return map[string][]string{
		"ipExclude":   ipExclude,
		"portProxy":   portProxy,
		"portExclude": portExclude,
	}
}
