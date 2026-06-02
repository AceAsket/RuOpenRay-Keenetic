package main

import (
	"os"
	"os/exec"
	"strings"
	"time"
)

func (s *serverState) diagnostics() map[string]any {
	cfg, cfgErr := s.readActiveConfig()
	var test map[string]any
	var analysis map[string]any
	if cfgErr == nil {
		test = s.validateConfig(cfg)
		analysis = s.analyzeConfig(cfg)
	}
	return map[string]any{
		"ok": true,
		"app": map[string]any{
			"version": appVersion,
			"asset":   ruOpenRayAssetName(),
			"binary":  os.Args[0],
		},
		"openwrt": map[string]any{
			"release": firstLine(readFileString("/etc/openwrt_release"), ""),
			"manager": firstNonEmpty(commandName("apk"), commandName("opkg"), "не найден"),
		},
		"service": map[string]any{
			"ruopenray": runTimeout(5*time.Second, "/etc/init.d/ruopenray-ui", "status"),
			"xray":      runTimeout(5*time.Second, "/etc/init.d/"+s.cfg.ServiceName, "status"),
		},
		"paths": map[string]any{
			"dataDir":      s.cfg.DataDir,
			"backupDir":    s.cfg.BackupDir,
			"geoDir":       s.cfg.GeoDir,
			"activeConfig": s.cfg.ActiveConfig,
		},
		"system":   s.systemMetrics(),
		"core":     runTimeout(5*time.Second, "xray", "version"),
		"config":   map[string]any{"readError": errString(cfgErr), "test": test, "analysis": analysis},
		"geo":      s.geoStatus(),
		"firewall": map[string]any{"nft": runTimeout(5*time.Second, "nft", "list", "ruleset"), "iptables": runTimeout(5*time.Second, "iptables-save")},
		"now":      time.Now().Format(time.RFC3339),
	}
}

func readFileString(path string) string {
	body, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(body))
}

func commandName(name string) string {
	if commandExists(name) {
		return name
	}
	return ""
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func commandExists(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}
