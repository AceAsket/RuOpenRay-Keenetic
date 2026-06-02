package main

import (
	"fmt"
	"strings"
)

func stringList(value any) []string {
	var out []string
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			if clean := strings.TrimSpace(fmt.Sprint(item)); clean != "" && clean != "<nil>" {
				out = append(out, clean)
			}
		}
	case []string:
		for _, item := range typed {
			if clean := strings.TrimSpace(item); clean != "" {
				out = append(out, clean)
			}
		}
	case string:
		for _, item := range strings.Split(typed, ",") {
			if clean := strings.TrimSpace(item); clean != "" {
				out = append(out, clean)
			}
		}
	}
	return out
}

func containsString(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func boolPayload(payload map[string]any, key string, fallback bool) bool {
	value, ok := payload[key]
	if !ok {
		return fallback
	}
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		clean := strings.ToLower(strings.TrimSpace(typed))
		return clean == "true" || clean == "1" || clean == "yes" || clean == "on"
	default:
		return fmt.Sprint(value) == "1"
	}
}

func cleanPayloadString(payload map[string]any, key string) string {
	value, ok := payload[key]
	if !ok || value == nil {
		return ""
	}
	text := fmt.Sprint(value)
	if text == "<nil>" {
		return ""
	}
	return text
}
