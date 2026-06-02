package main

import "testing"

func TestSaveRouteNames(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir()}}
	result := state.saveRouteNames(map[string]any{"names": map[string]any{
		" rule-key ": "  Discord  ",
		"empty":      "",
		"nil":        nil,
		"number":     42,
	}})
	if ok, _ := result["ok"].(bool); !ok {
		t.Fatalf("save failed: %#v", result)
	}
	names := state.routeNames()
	if names["rule-key"] != "Discord" {
		t.Fatalf("expected sanitized route name, got %#v", names)
	}
	if names["number"] != "42" {
		t.Fatalf("expected numeric value to be stringified, got %#v", names)
	}
	if _, ok := names["empty"]; ok {
		t.Fatalf("empty names must not be stored: %#v", names)
	}
	if _, ok := names["nil"]; ok {
		t.Fatalf("nil names must not be stored: %#v", names)
	}
}
