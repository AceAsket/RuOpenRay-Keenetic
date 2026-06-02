package main

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

type geoUserList struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Kind      string   `json:"kind"`
	Target    string   `json:"target"`
	Items     []string `json:"items"`
	Enabled   bool     `json:"enabled"`
	UpdatedAt string   `json:"updatedAt"`
	Warnings  []string `json:"warnings,omitempty"`
}

func (s *serverState) geoListsPath() string {
	return filepath.Join(s.cfg.DataDir, "geo-lists.json")
}

func (s *serverState) geoUserLists() []geoUserList {
	body, err := os.ReadFile(s.geoListsPath())
	if err != nil {
		return []geoUserList{}
	}
	var raw []geoUserList
	if json.Unmarshal(body, &raw) != nil {
		return []geoUserList{}
	}
	lists := make([]geoUserList, 0, len(raw))
	for index, item := range raw {
		lists = append(lists, normalizeGeoUserList(item, index))
	}
	sort.SliceStable(lists, func(i, j int) bool {
		return strings.ToLower(lists[i].Name) < strings.ToLower(lists[j].Name)
	})
	return lists
}

func (s *serverState) saveGeoUserLists(payload map[string]any) map[string]any {
	var raw []geoUserList
	if values, ok := payload["lists"].([]any); ok {
		for _, value := range values {
			if item, ok := value.(map[string]any); ok {
				raw = append(raw, geoUserListFromMap(item))
			}
		}
	}
	lists := make([]geoUserList, 0, len(raw))
	seen := map[string]bool{}
	for index, item := range raw {
		list := normalizeGeoUserList(item, index)
		if list.Name == "" || len(list.Items) == 0 {
			continue
		}
		if seen[list.ID] {
			list.ID = fmt.Sprintf("%s-%d", list.ID, index+1)
		}
		seen[list.ID] = true
		lists = append(lists, list)
	}
	body, _ := json.MarshalIndent(lists, "", "  ")
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "lists": lists}
	}
	if err := os.WriteFile(s.geoListsPath(), body, 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "lists": lists}
	}
	return map[string]any{"ok": true, "lists": lists, "status": s.geoStatus(), "stdout": "Пользовательские geo-списки сохранены"}
}

func geoUserListFromMap(item map[string]any) geoUserList {
	list := geoUserList{
		ID:        strings.TrimSpace(fmt.Sprint(item["id"])),
		Name:      strings.TrimSpace(fmt.Sprint(item["name"])),
		Kind:      strings.TrimSpace(fmt.Sprint(item["kind"])),
		Target:    strings.TrimSpace(fmt.Sprint(item["target"])),
		Enabled:   item["enabled"] != false,
		UpdatedAt: strings.TrimSpace(fmt.Sprint(item["updatedAt"])),
	}
	switch values := item["items"].(type) {
	case []any:
		for _, value := range values {
			list.Items = append(list.Items, fmt.Sprint(value))
		}
	case []string:
		list.Items = append(list.Items, values...)
	case string:
		list.Items = splitGeoListItems(values)
	}
	return list
}

func normalizeGeoUserList(item geoUserList, index int) geoUserList {
	item.Name = strings.TrimSpace(item.Name)
	if item.Name == "" {
		item.Name = fmt.Sprintf("Geo-список %d", index+1)
	}
	item.Kind = strings.ToLower(strings.TrimSpace(item.Kind))
	if item.Kind != "ip" {
		item.Kind = "domain"
	}
	item.Target = strings.ToLower(strings.TrimSpace(item.Target))
	if item.Target != "direct" && item.Target != "block" {
		item.Target = "proxy"
	}
	if item.ID == "" {
		item.ID = slugID(item.Name, fmt.Sprintf("geo-list-%d", index+1))
	} else {
		item.ID = slugID(item.ID, fmt.Sprintf("geo-list-%d", index+1))
	}
	if item.UpdatedAt == "" {
		item.UpdatedAt = time.Now().Format(time.RFC3339)
	}
	items, warnings := normalizeGeoListItems(item.Kind, item.Items)
	item.Items = items
	item.Warnings = warnings
	return item
}

func normalizeGeoListItems(kind string, raw []string) ([]string, []string) {
	seen := map[string]bool{}
	items := []string{}
	warnings := []string{}
	for _, line := range raw {
		for _, value := range splitGeoListItems(line) {
			normalized, ok := normalizeGeoListItem(kind, value)
			if !ok {
				warnings = append(warnings, fmt.Sprintf("Пропущено: %s", strings.TrimSpace(value)))
				continue
			}
			key := strings.ToLower(normalized)
			if seen[key] {
				continue
			}
			seen[key] = true
			items = append(items, normalized)
		}
	}
	return items, warnings
}

func splitGeoListItems(text string) []string {
	lines := strings.FieldsFunc(text, func(r rune) bool {
		return r == '\n' || r == '\r' || r == ',' || r == ';'
	})
	items := make([]string, 0, len(lines))
	for _, line := range lines {
		value := strings.TrimSpace(line)
		if value == "" || strings.HasPrefix(value, "#") || strings.HasPrefix(value, "//") {
			continue
		}
		if before, _, found := strings.Cut(value, "#"); found {
			value = strings.TrimSpace(before)
		}
		if value != "" {
			items = append(items, value)
		}
	}
	return items
}

func normalizeGeoListItem(kind string, value string) (string, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", false
	}
	if strings.Contains(value, "->") {
		value = strings.TrimSpace(strings.SplitN(value, "->", 2)[0])
	}
	value = unwrapRuleFunction(value)
	if kind == "ip" {
		return normalizeGeoIPItem(value)
	}
	return normalizeGeoDomainItem(value)
}

func unwrapRuleFunction(value string) string {
	open := strings.Index(value, "(")
	close := strings.LastIndex(value, ")")
	if open > 0 && close > open {
		head := strings.ToLower(strings.TrimSpace(value[:open]))
		if head == "domain" || head == "ip" {
			return strings.TrimSpace(value[open+1 : close])
		}
	}
	return value
}

func normalizeGeoIPItem(value string) (string, bool) {
	value = strings.TrimSpace(value)
	lower := strings.ToLower(value)
	if strings.HasPrefix(lower, "geoip:") {
		body := strings.TrimSpace(value[len("geoip:"):])
		if body == "" || !geoListCodePattern.MatchString(body) {
			return "", false
		}
		return "geoip:" + strings.ToLower(body), true
	}
	value = strings.TrimPrefix(value, "ip:")
	if strings.Contains(value, "/") {
		ip, network, err := net.ParseCIDR(value)
		if err != nil || ip == nil || network == nil {
			return "", false
		}
		return network.String(), true
	}
	ip := net.ParseIP(value)
	if ip == nil {
		return "", false
	}
	if v4 := ip.To4(); v4 != nil {
		return v4.String(), true
	}
	return ip.String(), true
}

var geoDomainPattern = regexp.MustCompile(`^[A-Za-z0-9_*.-]+$`)
var geoListCodePattern = regexp.MustCompile(`^[A-Za-z0-9_.@+-]+$`)

func normalizeGeoDomainItem(value string) (string, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", false
	}
	lower := strings.ToLower(value)
	for _, prefix := range []string{"domain:", "full:", "regexp:", "keyword:", "geosite:"} {
		if strings.HasPrefix(lower, prefix) {
			body := strings.TrimSpace(value[len(prefix):])
			if body == "" {
				return "", false
			}
			if prefix == "geosite:" {
				if !geoListCodePattern.MatchString(body) {
					return "", false
				}
				return prefix + strings.ToLower(body), true
			}
			if prefix == "regexp:" {
				return prefix + body, true
			}
			return prefix + strings.ToLower(body), true
		}
	}
	if strings.Contains(value, "://") || strings.ContainsAny(value, "/?#") {
		return "", false
	}
	if !geoDomainPattern.MatchString(value) {
		return "", false
	}
	return "domain:" + strings.ToLower(strings.TrimPrefix(value, ".")), true
}

func slugID(value, fallback string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	lastDash := false
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	id := strings.Trim(b.String(), "-")
	if id == "" {
		return fallback
	}
	return id
}
