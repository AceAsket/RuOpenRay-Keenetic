package routing

import (
	"path/filepath"
	"testing"
)

func TestLoadDisabledRulesEmptyArray(t *testing.T) {
	rules := LoadDisabledRules(filepath.Join(t.TempDir(), "missing.json"))
	if rules == nil {
		t.Fatal("LoadDisabledRules returned nil slice, want empty slice for JSON []")
	}
	if len(rules) != 0 {
		t.Fatalf("LoadDisabledRules returned %d rules, want 0", len(rules))
	}
}

func TestSaveDisabledRulesFiltersAndLimits(t *testing.T) {
	path := filepath.Join(t.TempDir(), "disabled-routes.json")
	raw := make([]any, 0, 210)
	raw = append(raw, map[string]any{"id": "skip-empty-rule"})
	for i := 0; i < 210; i++ {
		raw = append(raw, map[string]any{
			"id":   i,
			"rule": map[string]any{"type": "field", "outboundTag": "proxy"},
		})
	}
	result, err := SaveDisabledRules(path, raw)
	if err != nil {
		t.Fatalf("SaveDisabledRules failed: %v", err)
	}
	if len(result) != 200 {
		t.Fatalf("saved %d disabled route rules, want 200", len(result))
	}
	saved := LoadDisabledRules(path)
	if len(saved) != 200 {
		t.Fatalf("loaded %d disabled route rules, want 200", len(saved))
	}
	if saved[0]["id"] != float64(0) && saved[0]["id"] != 0 {
		t.Fatalf("first saved rule = %#v, want first valid rule", saved[0])
	}
}
