package main

import (
	"fmt"
	"testing"
	"time"
)

func TestSubscriptionCandidateCheckResultsKeepLastPerPoolIndex(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	if err := state.saveSubscriptionCandidateCheckResults("pool", []map[string]any{
		{"index": 1, "tag": "old", "ok": false, "address": "one.example", "port": 443, "checkedAt": "2026-05-26T10:00:00Z"},
	}); err != nil {
		t.Fatalf("save first result: %v", err)
	}
	if err := state.saveSubscriptionCandidateCheckResults("pool", []map[string]any{
		{"index": 1, "tag": "new", "ok": true, "address": "two.example", "port": 443, "checkedAt": "2026-05-26T10:01:00Z"},
		{"index": 2, "tag": "third", "ok": false, "address": "three.example", "port": 8443, "checkedAt": "2026-05-26T10:02:00Z"},
	}); err != nil {
		t.Fatalf("save second result: %v", err)
	}

	results := state.readSubscriptionCandidateCheckResults()
	if len(results["pool"]) != 2 {
		t.Fatalf("expected 2 stored pool results, got %#v", results["pool"])
	}
	if got := results["pool"]["1"]["tag"]; got != "new" {
		t.Fatalf("expected latest index result to win, got %#v", got)
	}
	if got := int(results["pool"]["1"]["port"].(float64)); got != 443 {
		t.Fatalf("unexpected stored port: %d", got)
	}
}

func TestSubscriptionCandidateCheckResultsAreCompact(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	if err := state.saveSubscriptionCandidateCheckResults("pool", []map[string]any{
		{
			"index":     0,
			"tag":       "candidate",
			"ok":        true,
			"checkedAt": "2026-05-26T10:00:00Z",
			"verbose":   "large temporary output",
		},
	}); err != nil {
		t.Fatalf("save result: %v", err)
	}
	results := state.readSubscriptionCandidateCheckResults()
	if _, ok := results["pool"]["0"]["verbose"]; ok {
		t.Fatalf("stored result should not keep verbose output: %#v", results["pool"]["0"])
	}
}

func TestLimitSubscriptionCandidateCheckResults(t *testing.T) {
	pools := map[string]map[string]map[string]any{}
	base := time.Date(2026, 5, 26, 10, 0, 0, 0, time.UTC)
	for i := 0; i < 520; i++ {
		pool := fmt.Sprintf("pool-%02d", i%4)
		if pools[pool] == nil {
			pools[pool] = map[string]map[string]any{}
		}
		index := fmt.Sprintf("%d", i)
		pools[pool][index] = map[string]any{"index": i, "tag": index, "checkedAt": base.Add(time.Duration(i) * time.Minute).Format(time.RFC3339)}
	}

	limited := limitSubscriptionCandidateCheckResults(pools, 512)
	total := 0
	for _, pool := range limited {
		total += len(pool)
	}
	if total != 512 {
		t.Fatalf("expected 512 stored checks, got %d", total)
	}
	if _, ok := limited["pool-00"]["0"]; ok {
		t.Fatalf("oldest item was not trimmed")
	}
}
