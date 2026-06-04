package lan

import (
	"fmt"
	"net"
	"os"
	"os/exec"
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

var activeNetworkNeighbours = detectActiveNetworkNeighbours

func DHCPLeaseReport(dataDir string) map[string]any {
	for _, path := range DHCPLeasePaths(dataDir) {
		body, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		leases := ParseDHCPLeases(string(body), path, time.Now().Unix())
		if len(leases) > 0 {
			return map[string]any{"ok": true, "source": path, "leases": leases}
		}
	}
	if leases, ok := keeneticDHCPLeases(); ok {
		return map[string]any{"ok": true, "source": "ndmc:show ip dhcp bindings", "leases": leases}
	}
	if leases, ok := activeNetworkNeighbours(); ok {
		return map[string]any{"ok": true, "source": "ip neigh show / /proc/net/arp", "leases": leases}
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

func keeneticDHCPLeases() ([]map[string]any, bool) {
	if _, err := exec.LookPath("ndmc"); err != nil {
		return nil, false
	}
	output, err := exec.Command("ndmc", "-c", "show ip dhcp bindings").Output()
	if err != nil {
		return nil, false
	}
	leases := ParseKeeneticDHCPBindings(string(output), time.Now().Unix())
	if len(leases) == 0 {
		return nil, false
	}
	return leases, true
}

func ParseKeeneticDHCPBindings(content string, now int64) []map[string]any {
	leases := []map[string]any{}
	current := map[string]string{}
	flush := func() {
		if current["ip"] == "" || current["mac"] == "" {
			current = map[string]string{}
			return
		}
		remaining := parseInt64(current["expires"])
		if remaining < 0 {
			remaining = 0
		}
		name := firstNonEmpty(current["hostname"], current["name"])
		leases = append(leases, map[string]any{
			"expires":   strconv.FormatInt(now+remaining, 10),
			"remaining": remaining,
			"mac":       strings.ToLower(current["mac"]),
			"ip":        current["ip"],
			"name":      name,
			"source":    "ndmc:show ip dhcp bindings",
		})
		current = map[string]string{}
	}
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(strings.TrimPrefix(line, "\x1b[K"))
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "lease:") {
			flush()
			continue
		}
		key, value, ok := strings.Cut(trimmed, ":")
		if !ok {
			continue
		}
		key = strings.TrimSpace(strings.ToLower(key))
		value = strings.TrimSpace(value)
		switch key {
		case "ip", "mac", "hostname", "name", "expires":
			current[key] = value
		}
	}
	flush()
	return leases
}

func detectActiveNetworkNeighbours() ([]map[string]any, bool) {
	leases := []map[string]any{}
	seen := map[string]bool{}
	add := func(items []map[string]any) {
		for _, item := range items {
			ip := strings.TrimSpace(asString(item["ip"]))
			mac := strings.ToLower(strings.TrimSpace(asString(item["mac"])))
			if ip == "" || mac == "" || seen[ip] {
				continue
			}
			seen[ip] = true
			leases = append(leases, item)
		}
	}
	if output, err := exec.Command("ip", "neigh", "show").Output(); err == nil {
		add(ParseIPNeighbours(string(output), "ip neigh show"))
	}
	if body, err := os.ReadFile("/proc/net/arp"); err == nil {
		add(ParseProcNetARP(string(body), "/proc/net/arp"))
	}
	return leases, len(leases) > 0
}

func ParseIPNeighbours(content string, source string) []map[string]any {
	leases := []map[string]any{}
	for _, line := range strings.Split(content, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}
		ip := fields[0]
		if parsed := net.ParseIP(ip); parsed == nil || parsed.To4() == nil {
			continue
		}
		mac := ""
		dev := ""
		state := fields[len(fields)-1]
		for index, field := range fields {
			switch field {
			case "dev":
				if index+1 < len(fields) {
					dev = fields[index+1]
				}
			case "lladdr":
				if index+1 < len(fields) {
					mac = strings.ToLower(fields[index+1])
				}
			}
		}
		if mac == "" || mac == "00:00:00:00:00:00" {
			continue
		}
		leases = append(leases, map[string]any{
			"expires":   "0",
			"remaining": int64(0),
			"mac":       mac,
			"ip":        ip,
			"name":      "",
			"interface": dev,
			"state":     state,
			"source":    source,
		})
	}
	return leases
}

func ParseProcNetARP(content string, source string) []map[string]any {
	leases := []map[string]any{}
	for index, line := range strings.Split(content, "\n") {
		if index == 0 {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 6 {
			continue
		}
		ip := fields[0]
		if parsed := net.ParseIP(ip); parsed == nil || parsed.To4() == nil {
			continue
		}
		mac := strings.ToLower(fields[3])
		if mac == "" || mac == "00:00:00:00:00:00" {
			continue
		}
		leases = append(leases, map[string]any{
			"expires":   "0",
			"remaining": int64(0),
			"mac":       mac,
			"ip":        ip,
			"name":      "",
			"interface": fields[5],
			"state":     fields[2],
			"source":    source,
		})
	}
	return leases
}

func asString(value any) string {
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text)
	}
	if value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func parseInt64(value string) int64 {
	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil {
		return 0
	}
	return parsed
}
