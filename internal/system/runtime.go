package system

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Sampler struct {
	mu            sync.Mutex
	prevCPUTotal  uint64
	prevCPUIdle   uint64
	prevTrafficIf string
	prevTrafficRx uint64
	prevTrafficTx uint64
	prevTrafficAt time.Time
}

func NewSampler() *Sampler {
	return &Sampler{}
}

func (s *Sampler) CPUPercent() any {
	total, idle := ReadCPUStat()
	if total == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	prevTotal, prevIdle := s.prevCPUTotal, s.prevCPUIdle
	s.prevCPUTotal, s.prevCPUIdle = total, idle
	if prevTotal == 0 || total <= prevTotal || idle < prevIdle {
		return nil
	}
	totalDelta := total - prevTotal
	idleDelta := idle - prevIdle
	if totalDelta == 0 {
		return nil
	}
	used := float64(totalDelta-idleDelta) / float64(totalDelta) * 100
	return int(used + 0.5)
}

func ClockTicksPerSecond() float64 {
	output, err := exec.Command("getconf", "CLK_TCK").Output()
	if err == nil {
		value, parseErr := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
		if parseErr == nil && value > 0 {
			return value
		}
	}
	return 100
}

func ProcessUptimeSeconds(serviceName string) (float64, string) {
	if runtime.GOOS == "windows" {
		return 0, ""
	}
	pids, err := NumericProcDirs()
	if err != nil {
		return 0, ""
	}
	names := map[string]bool{"xray": true}
	if serviceName != "" {
		names[serviceName] = true
	}
	now := RouterUptimeSeconds()
	ticks := ClockTicksPerSecond()
	if now <= 0 || ticks <= 0 {
		return 0, ""
	}
	for _, pid := range pids {
		if !names[ProcComm(pid)] {
			continue
		}
		start := ProcessStartTicks(pid)
		if start <= 0 {
			continue
		}
		uptime := now - start/ticks
		if uptime > 0 {
			return uptime, pid
		}
	}
	return 0, ""
}

func TCPFastOpenStatus() map[string]any {
	body, err := os.ReadFile("/proc/sys/net/ipv4/tcp_fastopen")
	if err != nil {
		return map[string]any{"ok": false, "available": false, "enabled": false, "value": 0, "error": err.Error()}
	}
	value := intValue(strings.TrimSpace(string(body)), 0)
	return map[string]any{
		"ok":               true,
		"available":        true,
		"enabled":          value&1 == 1,
		"serverEnabled":    value&2 == 2,
		"value":            value,
		"path":             "/proc/sys/net/ipv4/tcp_fastopen",
		"persistentPath":   "/etc/sysctl.d/90-ruopenray-tcp-fastopen.conf",
		"recommendedValue": 3,
	}
}

func SetTCPFastOpen(enabled bool) map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "available": true, "enabled": enabled, "stdout": "dev-mode: TCP Fast Open будет настроен через sysctl на OpenWrt"}
	}
	value := "0"
	if enabled {
		value = "3"
	}
	if err := os.WriteFile("/proc/sys/net/ipv4/tcp_fastopen", []byte(value+"\n"), 0o644); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "status": TCPFastOpenStatus()}
	}
	persistentPath := "/etc/sysctl.d/90-ruopenray-tcp-fastopen.conf"
	if err := os.MkdirAll(filepath.Dir(persistentPath), 0o755); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "status": TCPFastOpenStatus()}
	}
	body := "net.ipv4.tcp_fastopen=" + value + "\n"
	if err := os.WriteFile(persistentPath, []byte(body), 0o644); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "status": TCPFastOpenStatus()}
	}
	status := TCPFastOpenStatus()
	status["ok"] = true
	status["stdout"] = "TCP Fast Open настроен в системе"
	return status
}

func DefaultRouteInterface() string {
	output, err := exec.Command("ip", "route", "show", "default").Output()
	if err != nil {
		return ""
	}
	fields := strings.Fields(string(output))
	for index, field := range fields {
		if field == "dev" && index+1 < len(fields) {
			return fields[index+1]
		}
	}
	return ""
}

func (s *Sampler) TrafficStats() map[string]any {
	items := ReadNetDevStats()
	if len(items) == 0 {
		return map[string]any{}
	}
	byName := map[string]NetDevStat{}
	for _, item := range items {
		byName[item.Name] = item
	}
	selectedName := DefaultRouteInterface()
	selected, ok := byName[selectedName]
	if !ok {
		for _, item := range items {
			if !strings.HasPrefix(item.Name, "br-") {
				selected = item
				selectedName = item.Name
				ok = true
				break
			}
		}
	}
	if !ok {
		selected = items[0]
		selectedName = selected.Name
	}
	now := time.Now()
	var rxRate, txRate float64
	s.mu.Lock()
	if s.prevTrafficIf == selectedName && !s.prevTrafficAt.IsZero() && selected.RxBytes >= s.prevTrafficRx && selected.TxBytes >= s.prevTrafficTx {
		elapsed := now.Sub(s.prevTrafficAt).Seconds()
		if elapsed > 0 {
			rxRate = float64(selected.RxBytes-s.prevTrafficRx) / elapsed
			txRate = float64(selected.TxBytes-s.prevTrafficTx) / elapsed
		}
	}
	s.prevTrafficIf, s.prevTrafficRx, s.prevTrafficTx, s.prevTrafficAt = selectedName, selected.RxBytes, selected.TxBytes, now
	s.mu.Unlock()
	interfaces := []map[string]any{}
	for _, item := range items {
		interfaces = append(interfaces, map[string]any{
			"name":      item.Name,
			"rxBytes":   item.RxBytes,
			"txBytes":   item.TxBytes,
			"rxPackets": item.RxPackets,
			"txPackets": item.TxPackets,
			"selected":  item.Name == selectedName,
		})
	}
	return map[string]any{
		"interface":  selectedName,
		"rxBytes":    selected.RxBytes,
		"txBytes":    selected.TxBytes,
		"rxRate":     rxRate,
		"txRate":     txRate,
		"interfaces": interfaces,
	}
}

func (s *Sampler) Metrics() map[string]any {
	cpu := LoadAverage()
	cpu["percent"] = s.CPUPercent()
	return map[string]any{
		"cpu":       cpu,
		"memory":    MemoryStats(),
		"tcp":       TCPStats(),
		"conntrack": ConntrackStats(),
		"disk":      SystemDiskInfo(),
		"traffic":   s.TrafficStats(),
		"uptime":    RouterUptimeSeconds(),
	}
}

func SystemDiskInfo() map[string]any {
	if _, err := os.Stat("/overlay"); err == nil {
		info := DiskInfo("/overlay")
		info["label"] = "overlay"
		return info
	}
	info := DiskInfo("/")
	info["label"] = "/"
	return info
}

func DiskInfo(path string) map[string]any {
	target := path
	if _, err := os.Stat(target); err != nil {
		target = filepath.Dir(target)
	}
	output, err := exec.Command("df", "-Pk", target).Output()
	if err != nil {
		return map[string]any{"ok": false, "path": path, "error": err.Error()}
	}
	fields := strings.Fields(string(output))
	if len(fields) < 12 {
		return map[string]any{"ok": false, "path": path, "error": "не удалось разобрать df"}
	}
	total := int64Value(fields[len(fields)-5]) * 1024
	used := int64Value(fields[len(fields)-4]) * 1024
	free := int64Value(fields[len(fields)-3]) * 1024
	return map[string]any{"ok": true, "path": path, "total": total, "used": used, "free": free, "usedPercent": fields[len(fields)-2]}
}

func intValue(value any, fallback int) int {
	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(v))
		if err == nil {
			return parsed
		}
	}
	return fallback
}

func int64Value(value string) int64 {
	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil {
		return 0
	}
	return parsed
}
