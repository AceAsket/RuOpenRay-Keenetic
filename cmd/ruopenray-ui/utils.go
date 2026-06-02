package main

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

func firstLine(value, fallback string) string {
	for _, line := range strings.Split(value, "\n") {
		if strings.TrimSpace(line) != "" {
			return strings.TrimSpace(line)
		}
	}
	return fallback
}

func lenArray(value any) int {
	items, ok := value.([]any)
	if !ok {
		return 0
	}
	return len(items)
}

func anySlice(value any) []any {
	items, ok := value.([]any)
	if !ok {
		return []any{}
	}
	return items
}

func stringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			text := strings.TrimSpace(fmt.Sprint(item))
			if text != "" && text != "<nil>" {
				out = append(out, text)
			}
		}
		return out
	case string:
		text := strings.TrimSpace(typed)
		if text == "" {
			return []string{}
		}
		return []string{text}
	default:
		return []string{}
	}
}

func getNested(root map[string]any, keys ...string) any {
	var current any = root
	for _, key := range keys {
		object, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = object[key]
	}
	return current
}

func isSystemOutbound(outbound map[string]any) bool {
	tag := fmt.Sprint(outbound["tag"])
	protocol := fmt.Sprint(outbound["protocol"])
	return tag == "direct" || tag == "block" || tag == "dns-out" || protocol == "freedom" || protocol == "blackhole" || protocol == "dns"
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func extDatFile(value string) string {
	raw := strings.TrimPrefix(strings.TrimSpace(value), "ext:")
	raw = strings.Trim(raw, "\"")
	parts := strings.SplitN(raw, ":", 2)
	return strings.TrimSpace(parts[0])
}

func lastLine(value string) string {
	lines := strings.Split(strings.TrimSpace(value), "\n")
	if len(lines) == 0 {
		return value
	}
	return strings.TrimSpace(lines[len(lines)-1])
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" && value != "<nil>" {
			return value
		}
	}
	return ""
}

func port(u *url.URL, fallback int) int {
	if u.Port() == "" {
		return fallback
	}
	return number(u.Port(), fallback)
}

func number(value any, fallback int) int {
	out, ok := parseNumber(value)
	if !ok {
		return fallback
	}
	return int(out)
}

func numberAny(value any) int64 {
	out, _ := parseNumber(value)
	return out
}

func parseNumber(value any) (int64, bool) {
	switch typed := value.(type) {
	case int:
		return int64(typed), true
	case int8:
		return int64(typed), true
	case int16:
		return int64(typed), true
	case int32:
		return int64(typed), true
	case int64:
		return typed, true
	case uint:
		return int64(typed), true
	case uint8:
		return int64(typed), true
	case uint16:
		return int64(typed), true
	case uint32:
		return int64(typed), true
	case uint64:
		if typed > uint64(^uint64(0)>>1) {
			return 0, false
		}
		return int64(typed), true
	case float32:
		return int64(typed), true
	case float64:
		return int64(typed), true
	case string:
		raw := strings.TrimSpace(typed)
		if raw == "" {
			return 0, false
		}
		if out, err := strconv.ParseInt(raw, 10, 64); err == nil {
			return out, true
		}
		if out, err := strconv.ParseFloat(raw, 64); err == nil {
			return int64(out), true
		}
	}
	raw := strings.TrimSpace(fmt.Sprint(value))
	if raw == "" || raw == "<nil>" {
		return 0, false
	}
	if out, err := strconv.ParseInt(raw, 10, 64); err == nil {
		return out, true
	}
	if out, err := strconv.ParseFloat(raw, 64); err == nil {
		return int64(out), true
	}
	return 0, false
}

func mapValue(value any) map[string]any {
	if m, ok := value.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

func byteCount(size int64) string {
	if size >= 1024*1024*1024 {
		return fmt.Sprintf("%.1f GB", float64(size)/1024/1024/1024)
	}
	if size >= 1024*1024 {
		return fmt.Sprintf("%.1f MB", float64(size)/1024/1024)
	}
	if size >= 1024 {
		return fmt.Sprintf("%d KB", size/1024)
	}
	return fmt.Sprintf("%d B", size)
}

func parseInt64(value string) int64 {
	var out int64
	_, _ = fmt.Sscanf(value, "%d", &out)
	return out
}
