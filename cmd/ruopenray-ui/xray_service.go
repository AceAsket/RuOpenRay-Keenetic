package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

func (s *serverState) readActiveConfig() (map[string]any, error) {
	body, err := os.ReadFile(s.cfg.ActiveConfig)
	if err != nil {
		return nil, err
	}
	var cfg map[string]any
	err = json.Unmarshal(body, &cfg)
	return cfg, err
}

func (s *serverState) writeActiveConfig(cfg map[string]any) error {
	normalizeCatchAllRoutingRules(cfg)
	ensureFragmentOutboundsInConfig(cfg)
	if _, err := s.prepareConfigLogFiles(cfg); err != nil {
		return err
	}
	return s.writeActiveConfigRaw(cfg)
}

func (s *serverState) writeActiveConfigRaw(cfg map[string]any) error {
	normalizeCatchAllRoutingRules(cfg)
	ensureFragmentOutboundsInConfig(cfg)
	if err := os.MkdirAll(filepath.Dir(s.cfg.ActiveConfig), 0o755); err != nil {
		return err
	}
	body, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.cfg.ActiveConfig, body, 0o600)
}

func (s *serverState) xrayEnv() []string {
	env := os.Environ()
	if strings.TrimSpace(s.cfg.GeoDir) != "" {
		env = append(env, "XRAY_LOCATION_ASSET="+s.cfg.GeoDir, "V2RAY_LOCATION_ASSET="+s.cfg.GeoDir)
	}
	return env
}

func (s *serverState) runXray(args ...string) map[string]any {
	cmd := exec.Command("xray", args...)
	cmd.Env = s.xrayEnv()
	out, err := cmd.CombinedOutput()
	stdout := strings.TrimSpace(string(out))
	result := map[string]any{"ok": err == nil, "code": 0, "stdout": stdout, "stderr": "", "message": ""}
	if err != nil {
		result["message"] = err.Error()
		result["stderr"] = err.Error()
	}
	return result
}

func (s *serverState) serviceAction(action string) map[string]any {
	switch action {
	case "start", "stop", "restart", "enable", "disable":
	default:
		return map[string]any{"ok": false, "stderr": "Неподдерживаемое действие сервиса"}
	}
	var logMaintenance map[string]any
	var xrayEnable map[string]any
	var dnsPortGuard map[string]any
	if action == "start" || action == "restart" {
		logMaintenance = s.maintainLogFiles(true)
		if s.cfg.ServiceName == "xray" {
			dnsPortGuard = s.guardXrayDNSPortBeforeStart()
			if dnsPortGuard["ok"] == false {
				return map[string]any{
					"ok":             false,
					"stderr":         firstNonEmpty(fmt.Sprint(dnsPortGuard["stderr"]), fmt.Sprint(dnsPortGuard["message"])),
					"message":        firstNonEmpty(fmt.Sprint(dnsPortGuard["message"]), fmt.Sprint(dnsPortGuard["stderr"])),
					"logMaintenance": logMaintenance,
					"dnsPortGuard":   dnsPortGuard,
				}
			}
			xrayEnable = s.enableXrayServiceConfig()
		}
	}
	delay := s.waitBeforeXrayAction(action)
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "stdout": "dev-mode: был бы выполнен сервис " + s.cfg.ServiceName + " " + action, "logMaintenance": logMaintenance, "delay": delay}
	}
	result := run("/etc/init.d/"+s.cfg.ServiceName, action)
	if logMaintenance != nil {
		result["logMaintenance"] = logMaintenance
	}
	if xrayEnable != nil {
		result["xrayEnable"] = xrayEnable
		result["stdout"] = concatCommandOutput(xrayEnable, result)
	}
	if dnsPortGuard != nil {
		result["dnsPortGuard"] = dnsPortGuard
		result["stdout"] = concatCommandOutput(dnsPortGuard, result)
	}
	if delay != nil {
		result["delay"] = delay
		result["stdout"] = concatCommandOutput(delay, result)
	}
	return result
}

func (s *serverState) enableXrayServiceConfig() map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "stdout": "dev-mode: enable xray service config"}
	}
	steps := []map[string]any{}
	if commandExists("uci") {
		steps = append(steps, run("uci", "set", "xray.enabled=xray"))
		steps = append(steps, run("uci", "set", "xray.config=xray"))
		steps = append(steps, run("uci", "set", "xray.enabled.enabled=1"))
		if strings.TrimSpace(s.cfg.ActiveConfig) != "" {
			steps = append(steps, run("uci", "set", "xray.config.conffiles="+s.cfg.ActiveConfig))
			deleteConfdir := run("uci", "-q", "delete", "xray.config.confdir")
			// Missing confdir is the desired state. OpenWrt uci returns 1 when
			// deleting a non-existing option, so keep the operation quiet.
			if deleteConfdir["ok"] != true {
				deleteConfdir["ok"] = true
				deleteConfdir["stderr"] = ""
				deleteConfdir["message"] = ""
			}
			steps = append(steps, deleteConfdir)
		}
		if strings.TrimSpace(s.cfg.GeoDir) != "" {
			steps = append(steps, run("uci", "set", "xray.config.datadir="+s.cfg.GeoDir))
		}
		steps = append(steps, run("uci", "set", "xray.config.format=json"))
		steps = append(steps, run("uci", "commit", "xray"))
	}
	if _, err := os.Stat("/etc/init.d/xray"); err == nil {
		steps = append(steps, run("/etc/init.d/xray", "enable"))
	}
	ok := true
	for _, step := range steps {
		if value, _ := step["ok"].(bool); !value {
			ok = false
		}
	}
	return map[string]any{"ok": ok, "steps": steps, "stdout": concatCommandOutput(steps...)}
}

func (s *serverState) applyConfig(w http.ResponseWriter, r *http.Request) {
	payload, err := readJSON(w, r)
	if err != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if cfg, ok := payload["config"].(map[string]any); ok {
		test := s.validateConfigWithGeoAudit(cfg)
		analysis, _ := test["analysis"].(map[string]any)
		if analysis == nil {
			analysis = s.analyzeConfig(cfg)
		}
		if test["ok"] != true {
			writeJSON(w, 422, map[string]any{"ok": false, "test": test, "analysis": analysis})
			return
		}
		backup, err := s.backupActive("config-before-apply")
		if err != nil {
			writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error(), "test": test, "analysis": analysis})
			return
		}
		if err := s.writeActiveConfig(cfg); err != nil {
			writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error(), "backup": backup, "test": test, "analysis": analysis})
			return
		}
		profileName, err := s.syncCurrentProfile(cfg)
		if err != nil {
			writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error(), "backup": backup, "test": test, "analysis": analysis})
			return
		}
		restart := s.serviceAction("restart")
		_ = s.clearConfigDraft()
		writeJSON(w, 200, map[string]any{"ok": restart["ok"], "test": test, "analysis": analysis, "restart": restart, "backup": backup, "profile": profileName})
		return
	}
	test := s.validateConfig(nil)
	if test["ok"] != true {
		writeJSON(w, 422, map[string]any{"ok": false, "test": test})
		return
	}
	restart := s.serviceAction("restart")
	_ = s.clearConfigDraft()
	writeJSON(w, 200, map[string]any{"ok": restart["ok"], "test": test, "restart": restart})
}

func (s *serverState) backupActive(prefixes ...string) (string, error) {
	prefix := "config"
	if len(prefixes) > 0 && strings.TrimSpace(prefixes[0]) != "" {
		prefix = strings.TrimSpace(prefixes[0])
	}
	stamp := strings.NewReplacer(":", "-", ".", "-").Replace(time.Now().Format(time.RFC3339Nano))
	path := filepath.Join(s.cfg.BackupDir, prefix+"-"+stamp+".json")
	body, err := os.ReadFile(s.cfg.ActiveConfig)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(s.cfg.BackupDir, 0o755); err != nil {
		return "", err
	}
	return path, os.WriteFile(path, body, 0o600)
}

func (s *serverState) latestBackup() (map[string]any, error) {
	entries, err := os.ReadDir(s.cfg.BackupDir)
	if err != nil {
		return nil, err
	}
	var latestPath string
	var latestInfo os.FileInfo
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if latestInfo == nil || info.ModTime().After(latestInfo.ModTime()) {
			latestInfo = info
			latestPath = filepath.Join(s.cfg.BackupDir, entry.Name())
		}
	}
	if latestInfo == nil {
		return nil, fmt.Errorf("резервные копии конфигурации пока не найдены")
	}
	return map[string]any{"path": latestPath, "name": filepath.Base(latestPath), "size": latestInfo.Size(), "modifiedAt": latestInfo.ModTime().Format(time.RFC3339)}, nil
}

func (s *serverState) restoreBackup(rawPath string) map[string]any {
	backupPath := rawPath
	if backupPath == "" || backupPath == "<nil>" {
		latest, err := s.latestBackup()
		if err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
		backupPath = fmt.Sprint(latest["path"])
	}
	if !filepath.IsAbs(backupPath) {
		backupPath = filepath.Join(s.cfg.BackupDir, filepath.Base(backupPath))
	}
	cleanBackupDir, _ := filepath.Abs(s.cfg.BackupDir)
	cleanBackupPath, _ := filepath.Abs(backupPath)
	if !strings.HasPrefix(cleanBackupPath, cleanBackupDir+string(os.PathSeparator)) {
		return map[string]any{"ok": false, "stderr": "можно восстановить только файл из backup-каталога"}
	}
	body, err := os.ReadFile(cleanBackupPath)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	var cfg map[string]any
	if err := json.Unmarshal(body, &cfg); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	test := s.validateConfig(cfg)
	analysis := s.analyzeConfig(cfg)
	if test["ok"] != true {
		return map[string]any{"ok": false, "test": test, "analysis": analysis, "stderr": "backup не прошел xray -test"}
	}
	before, _ := s.backupActive("config-before-restore")
	if err := s.writeActiveConfig(cfg); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "backup": before}
	}
	restart := s.serviceAction("restart")
	return map[string]any{"ok": restart["ok"], "path": cleanBackupPath, "backup": before, "test": test, "analysis": analysis, "restart": restart}
}
