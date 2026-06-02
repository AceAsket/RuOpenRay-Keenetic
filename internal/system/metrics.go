package system

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

func ParseUintField(value string) uint64 {
	n, _ := strconv.ParseUint(strings.TrimSpace(value), 10, 64)
	return n
}

func ReadCPUStat() (total uint64, idle uint64) {
	body, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0, 0
	}
	line := strings.SplitN(string(body), "\n", 2)[0]
	fields := strings.Fields(line)
	if len(fields) < 5 || fields[0] != "cpu" {
		return 0, 0
	}
	for _, field := range fields[1:] {
		total += ParseUintField(field)
	}
	idle = ParseUintField(fields[4])
	if len(fields) > 5 {
		idle += ParseUintField(fields[5])
	}
	return total, idle
}

func LoadAverage() map[string]any {
	body, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return map[string]any{}
	}
	fields := strings.Fields(string(body))
	load := map[string]any{}
	if len(fields) > 0 {
		load["load1"] = fields[0]
	}
	if len(fields) > 1 {
		load["load5"] = fields[1]
	}
	if len(fields) > 2 {
		load["load15"] = fields[2]
	}
	return load
}

func MemoryStats() map[string]any {
	body, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return map[string]any{}
	}
	values := map[string]uint64{}
	for _, line := range strings.Split(string(body), "\n") {
		parts := strings.Fields(line)
		if len(parts) >= 2 {
			values[strings.TrimSuffix(parts[0], ":")] = ParseUintField(parts[1]) * 1024
		}
	}
	total := values["MemTotal"]
	available := values["MemAvailable"]
	if available == 0 {
		available = values["MemFree"] + values["Buffers"] + values["Cached"]
	}
	used := uint64(0)
	percent := 0
	if total > available {
		used = total - available
	}
	if total > 0 {
		percent = int(float64(used)/float64(total)*100 + 0.5)
	}
	return map[string]any{"total": total, "available": available, "used": used, "usedPercent": percent}
}

func TCPStats() map[string]any {
	read := func(file string) (total int, established int) {
		body, err := os.ReadFile(file)
		if err != nil {
			return 0, 0
		}
		for index, line := range strings.Split(string(body), "\n") {
			fields := strings.Fields(line)
			if index == 0 || len(fields) < 4 {
				continue
			}
			total++
			if fields[3] == "01" {
				established++
			}
		}
		return total, established
	}
	t4, e4 := read("/proc/net/tcp")
	t6, e6 := read("/proc/net/tcp6")
	return map[string]any{"total": t4 + t6, "established": e4 + e6}
}

func ConntrackStats() map[string]any {
	file := "/proc/net/nf_conntrack"
	body, err := os.ReadFile(file)
	if err != nil {
		file = "/proc/net/ip_conntrack"
		body, err = os.ReadFile(file)
	}
	if err != nil {
		return map[string]any{"ok": false, "total": 0, "tcp": 0, "udp": 0, "path": ""}
	}
	total := 0
	tcp := 0
	udp := 0
	for _, line := range strings.Split(string(body), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		total++
		switch fields[2] {
		case "tcp":
			tcp++
		case "udp":
			udp++
		}
	}
	return map[string]any{"ok": true, "total": total, "tcp": tcp, "udp": udp, "path": file}
}

func RouterUptimeSeconds() float64 {
	body, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0
	}
	fields := strings.Fields(string(body))
	if len(fields) == 0 {
		return 0
	}
	value, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0
	}
	return value
}

func ProcessStartTicks(pid string) float64 {
	body, err := os.ReadFile(filepath.Join("/proc", pid, "stat"))
	if err != nil {
		return 0
	}
	line := string(body)
	end := strings.LastIndex(line, ")")
	if end < 0 || end+2 >= len(line) {
		return 0
	}
	fields := strings.Fields(line[end+2:])
	if len(fields) < 20 {
		return 0
	}
	value, err := strconv.ParseFloat(fields[19], 64)
	if err != nil {
		return 0
	}
	return value
}

func NumericProcDirs() ([]string, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, err
	}
	names := []string{}
	pattern := regexp.MustCompile(`^\d+$`)
	for _, entry := range entries {
		if entry.IsDir() && pattern.MatchString(entry.Name()) {
			names = append(names, entry.Name())
		}
	}
	return names, nil
}

func ProcComm(pid string) string {
	comm, err := os.ReadFile(filepath.Join("/proc", pid, "comm"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(comm))
}

func ProcCmdline(pid string) string {
	body, err := os.ReadFile(filepath.Join("/proc", pid, "cmdline"))
	if err != nil {
		return ""
	}
	parts := strings.Split(strings.TrimRight(string(body), "\x00"), "\x00")
	return strings.Join(parts, " ")
}

type NetDevStat struct {
	Name      string
	RxBytes   uint64
	TxBytes   uint64
	RxPackets uint64
	TxPackets uint64
}

func ReadNetDevStats() []NetDevStat {
	body, err := os.ReadFile("/proc/net/dev")
	if err != nil {
		return nil
	}
	items := []NetDevStat{}
	for _, line := range strings.Split(string(body), "\n") {
		parts := strings.Split(line, ":")
		if len(parts) != 2 {
			continue
		}
		name := strings.TrimSpace(parts[0])
		if name == "" || name == "lo" {
			continue
		}
		fields := strings.Fields(parts[1])
		if len(fields) >= 16 {
			items = append(items, NetDevStat{
				Name:      name,
				RxBytes:   ParseUintField(fields[0]),
				RxPackets: ParseUintField(fields[1]),
				TxBytes:   ParseUintField(fields[8]),
				TxPackets: ParseUintField(fields[9]),
			})
		}
	}
	return items
}
