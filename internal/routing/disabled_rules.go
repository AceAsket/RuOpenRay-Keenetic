package routing

import (
	"encoding/json"
	"os"
	"path/filepath"
)

const disabledRulesLimit = 200

func LoadDisabledRules(path string) []map[string]any {
	rules := []map[string]any{}
	body, err := os.ReadFile(path)
	if err != nil {
		return rules
	}
	if err := json.Unmarshal(body, &rules); err != nil {
		return []map[string]any{}
	}
	return CleanDisabledRules(rules)
}

func SaveDisabledRules(path string, raw []any) ([]map[string]any, error) {
	rules := make([]map[string]any, 0, len(raw))
	for _, value := range raw {
		item, ok := value.(map[string]any)
		if !ok || item["rule"] == nil {
			continue
		}
		rules = append(rules, item)
		if len(rules) >= disabledRulesLimit {
			break
		}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return rules, err
	}
	body, err := json.MarshalIndent(rules, "", "  ")
	if err != nil {
		return rules, err
	}
	if err := os.WriteFile(path, body, 0o600); err != nil {
		return rules, err
	}
	return rules, nil
}

func CleanDisabledRules(rules []map[string]any) []map[string]any {
	cleaned := make([]map[string]any, 0, len(rules))
	for _, item := range rules {
		if item == nil || item["rule"] == nil {
			continue
		}
		cleaned = append(cleaned, item)
		if len(cleaned) >= disabledRulesLimit {
			break
		}
	}
	return cleaned
}
