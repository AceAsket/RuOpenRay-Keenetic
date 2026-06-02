package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	maxStoredOutboundChecks            = 64
	defaultOutboundCheckHistoryLimit   = 24
	defaultOutboundCheckRetentionHours = 168
	maxOutboundCheckHistoryLimit       = 200
	maxOutboundCheckRetentionHours     = 2160
)

type outboundCheckHistorySettings struct {
	Limit          int `json:"limit"`
	RetentionHours int `json:"retentionHours"`
}

type outboundCheckResultsStore struct {
	UpdatedAt       string                       `json:"updatedAt"`
	Results         map[string]map[string]any    `json:"results"`
	History         map[string][]map[string]any  `json:"history,omitempty"`
	HistorySettings outboundCheckHistorySettings `json:"historySettings,omitempty"`
}

func (s *serverState) outboundCheckResultsPath() string {
	return filepath.Join(s.cfg.DataDir, "checks", "results.json")
}

func (s *serverState) readOutboundCheckResults() map[string]map[string]any {
	return s.readOutboundCheckResultsStore().Results
}

func (s *serverState) readOutboundCheckHistory() map[string][]map[string]any {
	return s.readOutboundCheckResultsStore().History
}

func (s *serverState) readOutboundCheckHistorySettings() outboundCheckHistorySettings {
	return s.readOutboundCheckResultsStore().HistorySettings
}

func (s *serverState) readOutboundCheckResultsStore() outboundCheckResultsStore {
	body, err := os.ReadFile(s.outboundCheckResultsPath())
	if err != nil {
		return emptyOutboundCheckResultsStore()
	}
	var store outboundCheckResultsStore
	if err := json.Unmarshal(body, &store); err != nil {
		return emptyOutboundCheckResultsStore()
	}
	normalizeOutboundCheckResultsStore(&store)
	return store
}

func (s *serverState) saveOutboundCheckResults(results []map[string]any) error {
	if len(results) == 0 {
		return nil
	}
	dir := filepath.Dir(s.outboundCheckResultsPath())
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	store := s.readOutboundCheckResultsStore()
	current := store.Results
	history := store.History
	settings := normalizeOutboundCheckHistorySettings(store.HistorySettings)
	for _, result := range results {
		tag := stringsTrim(result["tag"])
		if tag == "" {
			continue
		}
		if stringsTrim(result["checkedAt"]) == "" {
			result["checkedAt"] = time.Now().Format(time.RFC3339)
		}
		clean := sanitizeOutboundCheckResult(result)
		current[tag] = clean
		if settings.Limit > 0 {
			history[tag] = append([]map[string]any{clean}, history[tag]...)
		}
	}
	current = limitOutboundCheckResults(current, maxStoredOutboundChecks)
	history = pruneOutboundCheckHistory(history, settings, time.Now())
	store = outboundCheckResultsStore{
		UpdatedAt:       time.Now().Format(time.RFC3339),
		Results:         current,
		History:         history,
		HistorySettings: settings,
	}
	return s.writeOutboundCheckResultsStore(store)
}

func (s *serverState) saveOutboundCheckHistorySettings(payload map[string]any) map[string]any {
	store := s.readOutboundCheckResultsStore()
	settings := normalizeOutboundCheckHistorySettings(outboundCheckHistorySettings{
		Limit:          intPayload(payload, "limit", store.HistorySettings.Limit),
		RetentionHours: intPayload(payload, "retentionHours", store.HistorySettings.RetentionHours),
	})
	store.HistorySettings = settings
	store.History = pruneOutboundCheckHistory(store.History, settings, time.Now())
	store.UpdatedAt = time.Now().Format(time.RFC3339)
	if err := s.writeOutboundCheckResultsStore(store); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "settings": settings, "history": store.History}
	}
	return map[string]any{"ok": true, "settings": settings, "history": store.History}
}

func (s *serverState) writeOutboundCheckResultsStore(store outboundCheckResultsStore) error {
	dir := filepath.Dir(s.outboundCheckResultsPath())
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	normalizeOutboundCheckResultsStore(&store)
	body, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".results-*.json")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(body); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := os.Chmod(tmpPath, 0o600); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, s.outboundCheckResultsPath()); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return nil
}

func emptyOutboundCheckResultsStore() outboundCheckResultsStore {
	return outboundCheckResultsStore{
		Results:         map[string]map[string]any{},
		History:         map[string][]map[string]any{},
		HistorySettings: normalizeOutboundCheckHistorySettings(outboundCheckHistorySettings{}),
	}
}

func normalizeOutboundCheckResultsStore(store *outboundCheckResultsStore) {
	if store.Results == nil {
		store.Results = map[string]map[string]any{}
	}
	if store.History == nil {
		store.History = map[string][]map[string]any{}
	}
	store.HistorySettings = normalizeOutboundCheckHistorySettings(store.HistorySettings)
}

func normalizeOutboundCheckHistorySettings(settings outboundCheckHistorySettings) outboundCheckHistorySettings {
	if settings.Limit == 0 && settings.RetentionHours == 0 {
		settings.Limit = defaultOutboundCheckHistoryLimit
	}
	if settings.Limit < 0 {
		settings.Limit = defaultOutboundCheckHistoryLimit
	}
	if settings.Limit > maxOutboundCheckHistoryLimit {
		settings.Limit = maxOutboundCheckHistoryLimit
	}
	if settings.RetentionHours <= 0 {
		settings.RetentionHours = defaultOutboundCheckRetentionHours
	}
	if settings.RetentionHours > maxOutboundCheckRetentionHours {
		settings.RetentionHours = maxOutboundCheckRetentionHours
	}
	return settings
}

func pruneOutboundCheckHistory(history map[string][]map[string]any, settings outboundCheckHistorySettings, now time.Time) map[string][]map[string]any {
	if history == nil || settings.Limit == 0 {
		return map[string][]map[string]any{}
	}
	cutoff := now.Add(-time.Duration(settings.RetentionHours) * time.Hour)
	pruned := map[string][]map[string]any{}
	for tag, entries := range history {
		if tag == "" {
			continue
		}
		next := make([]map[string]any, 0, minInt(len(entries), settings.Limit))
		for _, entry := range entries {
			if len(next) >= settings.Limit {
				break
			}
			at, err := time.Parse(time.RFC3339, stringsTrim(entry["checkedAt"]))
			if err == nil && at.Before(cutoff) {
				continue
			}
			next = append(next, sanitizeOutboundCheckResult(entry))
		}
		if len(next) > 0 {
			pruned[tag] = next
		}
	}
	return pruned
}

func intPayload(payload map[string]any, key string, fallback int) int {
	value, ok := payload[key]
	if !ok || value == nil {
		return fallback
	}
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case json.Number:
		parsed, err := typed.Int64()
		if err == nil {
			return int(parsed)
		}
	default:
		var parsed int
		if _, err := fmt.Sscanf(stringsTrim(value), "%d", &parsed); err == nil {
			return parsed
		}
	}
	return fallback
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func limitOutboundCheckResults(items map[string]map[string]any, limit int) map[string]map[string]any {
	if limit <= 0 || len(items) <= limit {
		return items
	}
	type checkItem struct {
		tag string
		at  time.Time
	}
	ordered := make([]checkItem, 0, len(items))
	for tag, item := range items {
		at, _ := time.Parse(time.RFC3339, stringsTrim(item["checkedAt"]))
		ordered = append(ordered, checkItem{tag: tag, at: at})
	}
	sort.Slice(ordered, func(i, j int) bool {
		return ordered[i].at.After(ordered[j].at)
	})
	next := map[string]map[string]any{}
	for index, item := range ordered {
		if index >= limit {
			break
		}
		next[item.tag] = items[item.tag]
	}
	return next
}

func sanitizeOutboundCheckResult(result map[string]any) map[string]any {
	allowed := []string{
		"tag", "ok", "skipped", "error", "method", "url", "checkedAt",
		"latencyMs", "httpLatencyMs", "endpointLatencyMs", "pingLatencyMs",
		"httpOk", "endpointOk", "pingOk",
		"protocol", "address", "port", "network", "security",
	}
	clean := map[string]any{}
	for _, key := range allowed {
		if value, ok := result[key]; ok {
			clean[key] = value
		}
	}
	return clean
}

func stringsTrim(value any) string {
	return strings.TrimSpace(fmt.Sprint(value))
}
