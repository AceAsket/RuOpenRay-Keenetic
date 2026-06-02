package main

import (
	"bytes"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/AceAsket/RuOpenRay-Keenetic/internal/domainmon"
)

func (s *serverState) domainMonitor(w http.ResponseWriter, r *http.Request) {
	limit := number(firstNonEmpty(r.URL.Query().Get("limit"), "1000"), 1000)
	if limit < 100 {
		limit = 100
	}
	if limit > 4000 {
		limit = 4000
	}
	leases := dhcpLeases(s.cfg.DataDir)
	devices := map[string]string{}
	knownDevices := []domainmon.Device{}
	for _, lease := range leases {
		ip := strings.TrimSpace(fmt.Sprint(lease["ip"]))
		name := strings.TrimSpace(fmt.Sprint(lease["name"]))
		if ip != "" && name != "" && name != "<nil>" {
			devices[ip] = name
		}
		if ip != "" {
			knownDevices = append(knownDevices, domainmon.Device{IP: ip, Name: firstNonEmpty(name, ip)})
		}
	}
	status := s.domainMonitorRuntime()
	var events []domainmon.Event
	source := "stopped"
	sourcePath := ""
	if status.Running {
		events, source, sourcePath = s.domainMonitorEvents(devices, limit)
	}
	if events == nil {
		events = []domainmon.Event{}
	}
	sort.SliceStable(events, func(i, j int) bool {
		if events[i].Timestamp == events[j].Timestamp {
			return i < j
		}
		return events[i].Timestamp > events[j].Timestamp
	})
	aggregates := domainmon.AggregateDomainEvents(events)
	stats := domainmon.Stats(events, aggregates)
	writeJSON(w, 200, map[string]any{
		"ok":         true,
		"source":     source,
		"sourcePath": sourcePath,
		"running":    status.Running,
		"enabled":    status.Enabled,
		"external":   status.External,
		"service":    status.Service,
		"available":  status.Available,
		"hint":       status.Hint,
		"dnsmasq":    s.dnsmasqMonitorInfo(),
		"updatedAt":  time.Now().Format(time.RFC3339),
		"events":     events,
		"domains":    aggregates,
		"devices":    domainmon.AggregateDevicesWithKnown(events, knownDevices),
		"stats":      stats,
	})
}

func (s *serverState) domainMonitorEvents(devices map[string]string, limit int) ([]domainmon.Event, string, string) {
	content, path := s.monitorLogContent()
	events := domainmon.ParseXrayDomainLines(content, devices)
	dnsmasqContent, dnsmasqPath := s.dnsmasqLogContent()
	dnsmasqEvents := domainmon.ParseDnsmasqLines(dnsmasqContent, devices)
	if len(dnsmasqEvents) > 0 {
		events = append(events, dnsmasqEvents...)
		if path != "" {
			path += ", "
		}
		path += dnsmasqPath
		return domainmon.TrimEvents(events, limit), "xray-access+dnsmasq", path
	}
	return domainmon.TrimEvents(events, limit), "xray-access", path
}

type domainMonitorRuntime struct {
	Running   bool   `json:"running"`
	Enabled   bool   `json:"enabled"`
	External  bool   `json:"external"`
	Available bool   `json:"available"`
	Service   string `json:"service"`
	Hint      string `json:"hint"`
}

func (s *serverState) domainMonitorStatePath() string {
	return filepath.Join(s.cfg.DataDir, "domain-monitor.enabled")
}

func (s *serverState) domainMonitorEnabled() bool {
	body, err := os.ReadFile(s.domainMonitorStatePath())
	if err != nil {
		return true
	}
	return strings.TrimSpace(string(body)) != "0"
}

func (s *serverState) setDomainMonitorEnabled(enabled bool) error {
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return err
	}
	value := "0"
	if enabled {
		value = "1"
	}
	return os.WriteFile(s.domainMonitorStatePath(), []byte(value+"\n"), 0o600)
}

func (s *serverState) domainMonitorRuntime() domainMonitorRuntime {
	enabled := s.domainMonitorEnabled()
	hint := "Режим наблюдения: RuOpenRay читает access/error/DNS-логи Xray и logread роутера."
	return domainMonitorRuntime{
		Running: enabled, Enabled: enabled, External: false, Available: true, Service: "", Hint: hint,
	}
}

func (s *serverState) controlDomainMonitor(payload map[string]any) map[string]any {
	action := strings.ToLower(strings.TrimSpace(fmt.Sprint(payload["action"])))
	result := map[string]any{"ok": true, "stdout": ""}
	switch action {
	case "start":
		if err := s.setDomainMonitorEnabled(true); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "status": s.domainMonitorRuntime()}
		}
		result["stdout"] = "SNI-монитор включен"
	case "stop":
		if err := s.setDomainMonitorEnabled(false); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "status": s.domainMonitorRuntime()}
		}
		result["stdout"] = "SNI-монитор остановлен"
	case "clear":
		return s.clearDomainMonitorLogs()
	case "dnsmasq-logqueries":
		return s.setDnsmasqLogqueries(boolPayload(payload, "enabled", false))
	default:
		return map[string]any{"ok": false, "stderr": "Неизвестное действие монитора", "status": s.domainMonitorRuntime()}
	}
	result["status"] = s.domainMonitorRuntime()
	return result
}

func (s *serverState) setDnsmasqLogqueries(enabled bool) map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": false, "stderr": "Настройка dnsmasq доступна только на роутере", "status": s.domainMonitorRuntime(), "dnsmasq": s.dnsmasqMonitorInfo()}
	}
	if !commandExists("uci") {
		return map[string]any{"ok": false, "stderr": "uci не найден: RuOpenRay не может изменить настройки dnsmasq", "status": s.domainMonitorRuntime(), "dnsmasq": s.dnsmasqMonitorInfo()}
	}
	value := "0"
	if enabled {
		value = "1"
	}
	steps := []map[string]any{
		runTimeout(8*time.Second, "uci", "set", "dhcp.@dnsmasq[0].logqueries="+value),
		runTimeout(8*time.Second, "uci", "commit", "dhcp"),
	}
	if _, err := os.Stat("/etc/init.d/dnsmasq"); err == nil {
		steps = append(steps, runTimeout(12*time.Second, "/etc/init.d/dnsmasq", "restart"))
	} else if commandExists("service") {
		steps = append(steps, runTimeout(12*time.Second, "service", "dnsmasq", "restart"))
	}
	ok := true
	for _, step := range steps {
		if step["ok"] != true {
			ok = false
			break
		}
	}
	stdout := "dnsmasq parser выключен: новые DNS-запросы dnsmasq больше не будут писаться в logread"
	if enabled {
		stdout = "dnsmasq parser включен: RuOpenRay будет читать query[] из logread и привязывать DNS к LAN-устройствам"
	}
	return map[string]any{
		"ok":      ok,
		"stdout":  stdout,
		"stderr":  concatCommandOutput(steps...),
		"steps":   steps,
		"status":  s.domainMonitorRuntime(),
		"dnsmasq": s.dnsmasqMonitorInfo(),
	}
}

func (s *serverState) clearDomainMonitorLogs() map[string]any {
	return map[string]any{
		"ok": true, "deleted": 0, "freed": int64(0), "status": s.domainMonitorRuntime(),
		"stdout": "Монитор доменов читает текущие логи Xray и logread. Файлы не очищались; для очистки используйте Настройки -> Логи.",
	}
}

func (s *serverState) monitorLogContent() (string, string) {
	var blocks []string
	var sourcePaths []string
	paths := []string{
		s.defaultAccessLogPath(),
		legacyAccessLogPath,
		filepath.Join(s.cfg.DataDir, "access.log"),
		s.defaultErrorLogPath(),
		legacyErrorLogPath,
		filepath.Join(s.cfg.DataDir, "error.log"),
	}
	if settings := s.loggingSettings(); settings != nil {
		paths = append(paths, cleanLogPath(fmt.Sprint(settings["accessPath"]), ""))
		paths = append(paths, cleanLogPath(fmt.Sprint(settings["errorPath"]), ""))
	}
	if cfg, err := s.readActiveConfig(); err == nil {
		if logConfig, ok := cfg["log"].(map[string]any); ok {
			paths = append(paths, cleanLogPath(fmt.Sprint(logConfig["access"]), ""))
			paths = append(paths, cleanLogPath(fmt.Sprint(logConfig["error"]), ""))
		}
	}
	seenPaths := map[string]bool{}
	for _, path := range paths {
		if path == "" || seenPaths[path] {
			continue
		}
		seenPaths[path] = true
		body, err := os.ReadFile(path)
		if err == nil && len(bytes.TrimSpace(body)) > 0 {
			blocks = append(blocks, string(body))
			sourcePaths = append(sourcePaths, path)
		}
	}
	if runtime.GOOS != "windows" {
		if output, err := exec.Command("logread", "-e", "xray").Output(); err == nil && len(output) > 0 {
			blocks = append(blocks, string(output))
			sourcePaths = append(sourcePaths, "logread:xray")
		}
	}
	return strings.Join(blocks, "\n"), strings.Join(sourcePaths, ", ")
}

func (s *serverState) dnsmasqLogContent() (string, string) {
	if runtime.GOOS == "windows" {
		return "", ""
	}
	output, err := exec.Command("logread", "-e", "dnsmasq").Output()
	if err != nil || len(bytes.TrimSpace(output)) == 0 {
		return "", ""
	}
	return string(output), "logread:dnsmasq"
}

func (s *serverState) dnsmasqMonitorInfo() map[string]any {
	logqueries := strings.TrimSpace(fmt.Sprint(run("uci", "-q", "get", "dhcp.@dnsmasq[0].logqueries")["stdout"])) == "1"
	return map[string]any{
		"logqueries": logqueries,
		"source":     "logread:dnsmasq",
		"hint":       "Если включить logqueries в dnsmasq, RuOpenRay сможет парсить строки query[...] и привязывать DNS-домены к IP LAN-клиента.",
	}
}
