package lan

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func DHCPLeases(dataDir string) []map[string]any {
	report := DHCPLeaseReport(dataDir)
	if leases, ok := report["leases"].([]map[string]any); ok {
		return leases
	}
	return []map[string]any{}
}

func DHCPLeaseReport(dataDir string) map[string]any {
	for _, path := range DHCPLeasePaths(dataDir) {
		body, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		leases := ParseDHCPLeases(string(body), path, time.Now().Unix())
		return map[string]any{"ok": true, "source": path, "leases": leases}
	}
	return map[string]any{"ok": true, "source": "", "leases": []map[string]any{}}
}

func DHCPLeasePaths(dataDir string) []string {
	return []string{"/tmp/dhcp.leases", "/var/dhcp.leases", filepath.Join(dataDir, "dhcp.leases")}
}

func ParseDHCPLeases(content string, source string, now int64) []map[string]any {
	leases := []map[string]any{}
	for _, line := range strings.Split(content, "\n") {
		parts := strings.Fields(line)
		if len(parts) < 4 {
			continue
		}
		name := parts[3]
		if name == "*" {
			name = ""
		}
		expires := parseInt64(parts[0])
		remaining := expires - now
		if expires <= 0 || remaining < 0 {
			remaining = 0
		}
		leases = append(leases, map[string]any{
			"expires":   parts[0],
			"remaining": remaining,
			"mac":       parts[1],
			"ip":        parts[2],
			"name":      name,
			"source":    source,
		})
	}
	return leases
}

func parseInt64(value string) int64 {
	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil {
		return 0
	}
	return parsed
}
