package main

import (
	"fmt"
	"testing"
	"time"
)

func TestOutboundCheckResultsKeepLastPerTag(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	base := time.Now().UTC().Add(-2 * time.Minute)
	if err := state.saveOutboundCheckResults([]map[string]any{
		{"tag": "one", "ok": false, "latencyMs": 100, "checkedAt": base.Format(time.RFC3339)},
	}); err != nil {
		t.Fatalf("save first result: %v", err)
	}
	if err := state.saveOutboundCheckResults([]map[string]any{
		{"tag": "one", "ok": true, "latencyMs": 25, "checkedAt": base.Add(time.Minute).Format(time.RFC3339)},
		{"tag": "two", "ok": true, "latencyMs": 50, "checkedAt": base.Add(2 * time.Minute).Format(time.RFC3339)},
	}); err != nil {
		t.Fatalf("save second result: %v", err)
	}

	results := state.readOutboundCheckResults()
	if len(results) != 2 {
		t.Fatalf("expected 2 stored results, got %d", len(results))
	}
	if results["one"]["ok"] != true {
		t.Fatalf("expected latest one result to win, got %#v", results["one"])
	}
	if got := int(results["one"]["latencyMs"].(float64)); got != 25 {
		t.Fatalf("unexpected latency for one: %d", got)
	}
	history := state.readOutboundCheckHistory()
	if len(history["one"]) != 2 {
		t.Fatalf("expected two history entries for one, got %#v", history["one"])
	}
	if got := int(history["one"][0]["latencyMs"].(float64)); got != 25 {
		t.Fatalf("expected newest history entry first, got %d", got)
	}
}

func TestOutboundCheckResultsAreCompact(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	if err := state.saveOutboundCheckResults([]map[string]any{
		{
			"tag":       "one",
			"ok":        true,
			"checkedAt": "2026-05-24T10:00:00Z",
			"ping":      map[string]any{"stdout": "large ping output"},
		},
	}); err != nil {
		t.Fatalf("save result: %v", err)
	}
	results := state.readOutboundCheckResults()
	if _, ok := results["one"]["ping"]; ok {
		t.Fatalf("stored result should not keep verbose ping output: %#v", results["one"])
	}
}

func TestLimitOutboundCheckResults(t *testing.T) {
	items := map[string]map[string]any{}
	base := time.Date(2026, 5, 24, 10, 0, 0, 0, time.UTC)
	for i := 0; i < 70; i++ {
		tag := fmt.Sprintf("tag-%02d", i)
		items[tag] = map[string]any{"tag": tag, "checkedAt": base.Add(time.Duration(i) * time.Minute).Format(time.RFC3339)}
	}

	limited := limitOutboundCheckResults(items, 64)
	if len(limited) != 64 {
		t.Fatalf("expected 64 items, got %d", len(limited))
	}
	if _, ok := limited["tag-00"]; ok {
		t.Fatalf("oldest item was not trimmed")
	}
	if _, ok := limited["tag-69"]; !ok {
		t.Fatalf("newest item was trimmed")
	}
}

func TestOutboundCheckHistorySettingsPruneByLimit(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	base := time.Now().UTC().Add(-4 * time.Minute)
	result := state.saveOutboundCheckHistorySettings(map[string]any{"limit": 2, "retentionHours": 168})
	if result["ok"] != true {
		t.Fatalf("save settings failed: %#v", result)
	}
	for i := 0; i < 4; i++ {
		if err := state.saveOutboundCheckResults([]map[string]any{
			{"tag": "one", "ok": i%2 == 0, "latencyMs": i + 1, "checkedAt": base.Add(time.Duration(i) * time.Minute).Format(time.RFC3339)},
		}); err != nil {
			t.Fatalf("save result %d: %v", i, err)
		}
	}
	history := state.readOutboundCheckHistory()
	if len(history["one"]) != 2 {
		t.Fatalf("expected two retained history entries, got %#v", history["one"])
	}
	if got := int(history["one"][0]["latencyMs"].(float64)); got != 4 {
		t.Fatalf("expected newest history retained first, got %d", got)
	}
}

func TestOutboundCheckHistoryCanBeDisabled(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	result := state.saveOutboundCheckHistorySettings(map[string]any{"limit": 0, "retentionHours": 168})
	if result["ok"] != true {
		t.Fatalf("save settings failed: %#v", result)
	}
	if err := state.saveOutboundCheckResults([]map[string]any{
		{"tag": "one", "ok": true, "checkedAt": "2026-05-24T10:00:00Z"},
	}); err != nil {
		t.Fatalf("save result: %v", err)
	}
	if history := state.readOutboundCheckHistory(); len(history) != 0 {
		t.Fatalf("expected disabled history to stay empty, got %#v", history)
	}
}
