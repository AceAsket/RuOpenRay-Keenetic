package geodata

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

func CleanSourceID(value string) string {
	clean := strings.ToLower(strings.TrimSpace(value))
	clean = regexp.MustCompile(`[^a-z0-9_-]+`).ReplaceAllString(clean, "-")
	clean = strings.Trim(clean, "-_")
	if clean == "" {
		clean = fmt.Sprintf("source-%d", time.Now().Unix())
	}
	if !strings.HasPrefix(clean, "custom-") {
		clean = "custom-" + clean
	}
	return clean
}

func CleanTarget(value string) string {
	name := strings.ReplaceAll(strings.TrimSpace(value), "\\", "/")
	name = filepath.Base(name)
	if name == "." || name == "/" || name == "" {
		return ""
	}
	if !strings.HasSuffix(strings.ToLower(name), ".dat") {
		name += ".dat"
	}
	return name
}

func CleanFileName(value string) string {
	name := strings.ReplaceAll(strings.TrimSpace(value), "\\", "/")
	name = filepath.Base(name)
	if name == "." || name == "/" || name == "" || !strings.HasSuffix(strings.ToLower(name), ".dat") {
		return ""
	}
	return name
}

func NormalizeSource(raw map[string]any, index int) map[string]any {
	name := strings.TrimSpace(fmt.Sprint(raw["name"]))
	if name == "" || name == "<nil>" {
		name = fmt.Sprintf("Custom source %d", index+1)
	}
	kind := strings.ToLower(strings.TrimSpace(fmt.Sprint(raw["kind"])))
	if kind != "extra" && kind != "separate" {
		kind = "base"
	}
	id := CleanSourceID(firstNonEmpty(fmt.Sprint(raw["id"]), name))
	source := map[string]any{
		"id":             id,
		"name":           name,
		"kind":           kind,
		"enabled":        boolPayload(raw, "enabled", true),
		"estimatedBytes": 24 * 1024 * 1024,
	}
	if kind == "extra" {
		source["target"] = CleanTarget(fmt.Sprint(raw["target"]))
		source["url"] = strings.TrimSpace(fmt.Sprint(raw["url"]))
		source["estimatedBytes"] = 512 * 1024
		return source
	}
	if kind == "separate" {
		source["target"] = CleanTarget(fmt.Sprint(raw["target"]))
	}
	source["geoipUrl"] = strings.TrimSpace(fmt.Sprint(raw["geoipUrl"]))
	source["geositeUrl"] = strings.TrimSpace(fmt.Sprint(raw["geositeUrl"]))
	return source
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		clean := strings.TrimSpace(value)
		if clean != "" && clean != "<nil>" {
			return clean
		}
	}
	return ""
}

func boolPayload(payload map[string]any, key string, fallback bool) bool {
	value, ok := payload[key]
	if !ok {
		return fallback
	}
	if boolValue, ok := value.(bool); ok {
		return boolValue
	}
	clean := strings.ToLower(strings.TrimSpace(fmt.Sprint(value)))
	if clean == "" || clean == "<nil>" {
		return fallback
	}
	return clean == "1" || clean == "true" || clean == "yes" || clean == "on"
}
