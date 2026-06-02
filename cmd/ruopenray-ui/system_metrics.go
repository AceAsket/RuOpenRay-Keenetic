package main

import (
	"context"
	"fmt"
	"net/http"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"time"

	rsystem "github.com/AceAsket/RuOpenRay-Keenetic/internal/system"
	rxraystats "github.com/AceAsket/RuOpenRay-Keenetic/internal/xraystats"
)

func (s *serverState) status(w http.ResponseWriter) {
	cfg, err := s.readActiveConfig()
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	version := s.cachedXrayVersion()
	service := s.cachedXrayServiceStatus()
	profiles, _ := s.listProfiles()
	writeJSON(w, 200, map[string]any{
		"app": map[string]any{
			"version":  appVersion,
			"asset":    ruOpenRayAssetName(),
			"arch":     systemArchitecture("github-release"),
			"platform": s.cfg.Platform,
		},
		"service": service,
		"core": map[string]any{
			"available": version["ok"],
			"version":   firstLine(version["stdout"].(string), "xray не найден"),
			"detail":    version["stderr"],
		},
		"config": map[string]any{
			"path":         s.cfg.ActiveConfig,
			"inbounds":     lenArray(cfg["inbounds"]),
			"outbounds":    lenArray(cfg["outbounds"]),
			"routingRules": lenArray(getNested(cfg, "routing", "rules")),
		},
		"profiles":  len(profiles),
		"system":    s.systemMetrics(),
		"xrayStats": s.xrayTrafficStats(cfg, false),
		"serverChecks": map[string]any{
			"results":                s.readOutboundCheckResults(),
			"history":                s.readOutboundCheckHistory(),
			"historySettings":        s.readOutboundCheckHistorySettings(),
			"subscriptionCandidates": s.readSubscriptionCandidateCheckResults(),
		},
		"uptime": time.Since(s.started).Seconds(),
		"now":    time.Now().Format(time.RFC3339),
	})
}

func (s *serverState) cachedXrayVersion() map[string]any {
	now := time.Now()
	s.metricsMu.Lock()
	if s.coreVersionCache != nil && now.Sub(s.coreVersionAt) < time.Minute {
		cached := s.coreVersionCache
		s.metricsMu.Unlock()
		return cached
	}
	s.metricsMu.Unlock()
	version := run("xray", "version")
	s.metricsMu.Lock()
	s.coreVersionCache = version
	s.coreVersionAt = now
	s.metricsMu.Unlock()
	return version
}

func (s *serverState) cachedXrayServiceStatus() map[string]any {
	now := time.Now()
	s.metricsMu.Lock()
	if s.serviceCache != nil && now.Sub(s.serviceAt) < 2*time.Second {
		cached := s.serviceCache
		s.metricsMu.Unlock()
		return cached
	}
	s.metricsMu.Unlock()
	service := s.xrayServiceStatus()
	s.metricsMu.Lock()
	s.serviceCache = service
	s.serviceAt = now
	s.metricsMu.Unlock()
	return service
}

func (s *serverState) xrayServiceStatus() map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"running": true, "detail": "dev-mode: имитация сервиса"}
	}
	serviceScript := s.cfg.serviceScript(s.cfg.ServiceName)
	result := run(serviceScript, "status")
	text := result["stdout"].(string) + " " + result["stderr"].(string)
	normalized := strings.ToLower(text)
	managed := result["ok"].(bool) && !strings.Contains(normalized, "no instances") && regexp.MustCompile(`(?i)running|active`).MatchString(text)
	uptime, pid := rsystem.ProcessUptimeSeconds(s.cfg.coreProcessName())
	processRunning := uptime > 0
	running := managed || processRunning
	detail := strings.TrimSpace(text)
	service := map[string]any{"running": running, "managed": managed, "external": processRunning && !managed, "detail": detail, "script": serviceScript}
	if processRunning {
		service["uptime"] = uptime
		service["pid"] = pid
		cmdline := rsystem.ProcCmdline(pid)
		owner := xrayProcessOwner(cmdline)
		service["owner"] = owner
		if !managed {
			service["detail"] = externalXrayDetail(detail, owner, cmdline)
		}
	}
	return service
}

func xrayProcessOwner(cmdline string) string {
	normalized := strings.ToLower(cmdline)
	switch {
	case strings.Contains(normalized, "/etc/v2raya/") || strings.Contains(normalized, "v2raya"):
		return "v2rayA"
	case strings.Contains(normalized, "ruopenray"):
		return "RuOpenRay"
	default:
		return "xray"
	}
}

func externalXrayDetail(detail, owner, cmdline string) string {
	msg := "Обнаружен живой процесс xray"
	if owner != "" && owner != "xray" {
		msg += ", запущенный через " + owner
	}
	if strings.TrimSpace(cmdline) != "" {
		msg += ": " + strings.TrimSpace(cmdline)
	}
	if strings.TrimSpace(detail) == "" {
		return msg
	}
	return strings.TrimSpace(detail) + "\n" + msg
}

func (s *serverState) saveXrayStatsSettings(enabled bool) map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	rxraystats.EnsureConfig(cfg, enabled)
	test := s.validateConfig(cfg)
	analysis := s.analyzeConfig(cfg)
	if test["ok"] != true {
		return map[string]any{"ok": false, "test": test, "analysis": analysis, "stderr": "Конфигурация Xray Stats не прошла проверку"}
	}
	backup, err := s.backupActive("config-before-xray-stats")
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "test": test, "analysis": analysis}
	}
	if err := s.writeActiveConfig(cfg); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "backup": backup, "test": test, "analysis": analysis}
	}
	s.metricsMu.Lock()
	s.prevXrayStats = nil
	s.prevXrayStatsAt = time.Time{}
	s.metricsMu.Unlock()
	restart := s.serviceAction("restart")
	return map[string]any{"ok": restart["ok"], "enabled": enabled, "settings": rxraystats.APIInfo(cfg), "backup": backup, "test": test, "analysis": analysis, "restart": restart}
}

func (s *serverState) queryXrayStats(server string, reset bool) map[string]any {
	args := []string{"api", "statsquery", "--server=" + server, "-timeout", "3", "-pattern", "outbound"}
	if reset {
		args = append(args, "-reset")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, s.xrayBinary(), args...)
	cmd.Env = s.xrayEnv()
	out, err := cmd.CombinedOutput()
	stdout := strings.TrimSpace(string(out))
	result := map[string]any{"ok": err == nil, "stdout": stdout, "stderr": "", "message": ""}
	if ctx.Err() == context.DeadlineExceeded {
		result["ok"] = false
		result["stderr"] = "xray api statsquery превысил лимит времени"
		return result
	}
	if err != nil {
		result["stderr"] = strings.TrimSpace(stdout + "\n" + err.Error())
		result["message"] = err.Error()
	}
	return result
}

func (s *serverState) xrayTrafficStats(cfg map[string]any, reset bool) map[string]any {
	info := rxraystats.APIInfo(cfg)
	if info["enabled"] != true {
		return map[string]any{"ok": true, "enabled": false, "settings": info, "outbounds": []any{}, "groups": map[string]any{}}
	}
	if !reset {
		now := time.Now()
		s.metricsMu.Lock()
		if s.xrayStatsCache != nil && now.Sub(s.xrayStatsAt) < 15*time.Second {
			cached := s.xrayStatsCache
			s.metricsMu.Unlock()
			return cached
		}
		s.metricsMu.Unlock()
	}
	server := fmt.Sprint(info["server"])
	query := s.queryXrayStats(server, reset)
	if query["ok"] != true {
		return map[string]any{"ok": false, "enabled": true, "settings": info, "outbounds": []any{}, "groups": map[string]any{}, "stderr": query["stderr"]}
	}
	counters := rxraystats.ParseOutput(fmt.Sprint(query["stdout"]))
	now := time.Now()
	prev := map[string]uint64{}
	elapsed := 0.0
	s.metricsMu.Lock()
	if reset {
		s.prevXrayStats = nil
		s.prevXrayStatsAt = time.Time{}
		s.xrayStatsCache = nil
		s.xrayStatsAt = time.Time{}
	} else {
		for key, value := range s.prevXrayStats {
			prev[key] = value
		}
		if !s.prevXrayStatsAt.IsZero() {
			elapsed = now.Sub(s.prevXrayStatsAt).Seconds()
		}
	}
	s.prevXrayStats = counters
	s.prevXrayStatsAt = now
	s.metricsMu.Unlock()

	result := rxraystats.TrafficResult(counters, prev, elapsed, rxraystats.OutboundProtocols(cfg), now)
	result["ok"] = true
	result["enabled"] = true
	result["reset"] = reset
	result["settings"] = info
	result["server"] = server
	if !reset {
		s.metricsMu.Lock()
		s.xrayStatsCache = result
		s.xrayStatsAt = now
		s.metricsMu.Unlock()
	}
	return result
}

func (s *serverState) systemSamplerInstance() *rsystem.Sampler {
	s.metricsMu.Lock()
	defer s.metricsMu.Unlock()
	if s.systemSampler == nil {
		s.systemSampler = rsystem.NewSampler()
	}
	return s.systemSampler
}

func (s *serverState) systemMetrics() map[string]any {
	metrics := s.systemSamplerInstance().Metrics()
	metrics["disk"] = s.appDiskInfo()
	return metrics
}

func (s *serverState) appDiskInfo() map[string]any {
	info := rsystem.DiskInfo(s.cfg.DataDir)
	info["label"] = s.cfg.DataDir
	return info
}
