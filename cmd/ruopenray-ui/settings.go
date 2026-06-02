package main

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

func (s *serverState) changePassword(payload map[string]any) map[string]any {
	current := fmt.Sprint(payload["currentPassword"])
	next := strings.TrimSpace(fmt.Sprint(payload["newPassword"]))
	confirm := strings.TrimSpace(fmt.Sprint(payload["confirmPassword"]))
	if subtle.ConstantTimeCompare([]byte(current), []byte(s.cfg.Password)) != 1 {
		return map[string]any{"ok": false, "stderr": "Текущий пароль не подошел"}
	}
	if len(next) < 8 {
		return map[string]any{"ok": false, "stderr": "Новый пароль должен быть не короче 8 символов"}
	}
	if next != confirm {
		return map[string]any{"ok": false, "stderr": "Пароли не совпадают"}
	}

	steps := []map[string]any{}
	persisted := false
	if runtime.GOOS != "windows" && commandExists("uci") {
		set := run("uci", "set", "ruopenray-ui.main.password="+next)
		commit := run("uci", "commit", "ruopenray-ui")
		steps = append(steps, set, commit)
		persisted = set["ok"] == true && commit["ok"] == true
	} else if runtime.GOOS == "windows" {
		persisted = true
	}
	if runtime.GOOS != "windows" && !persisted {
		return map[string]any{"ok": false, "stderr": "Не удалось сохранить пароль в UCI", "steps": steps}
	}

	s.cfg.Password = next
	s.clearSessions()
	return map[string]any{
		"ok":        true,
		"persisted": persisted,
		"steps":     steps,
		"stdout":    "Пароль панели изменен. Войдите заново.",
	}
}

const (
	legacyAccessLogPath       = "/var/log/xray/access.log"
	legacyErrorLogPath        = "/var/log/xray/error.log"
	debugLogMaintenanceEvery  = time.Minute
	infoLogMaintenanceEvery   = 5 * time.Minute
	normalLogMaintenanceEvery = 15 * time.Minute
)

func (s *serverState) defaultAccessLogPath() string {
	return filepath.Join(s.cfg.DataDir, "logs", "access.log")
}

func (s *serverState) defaultErrorLogPath() string {
	return filepath.Join(s.cfg.DataDir, "logs", "error.log")
}

func (s *serverState) loggingSettingsPath() string {
	return filepath.Join(s.cfg.DataDir, "logging-settings.json")
}

func defaultLoggingSettings() map[string]any {
	return map[string]any{
		"maxSizeMb":      2,
		"rotateCopies":   1,
		"clearOnRestart": false,
	}
}

func (s *serverState) readLoggingRuntimeSettings() map[string]any {
	settings := defaultLoggingSettings()
	body, err := os.ReadFile(s.loggingSettingsPath())
	if err != nil {
		return settings
	}
	var saved map[string]any
	if json.Unmarshal(body, &saved) != nil {
		return settings
	}
	for key, value := range saved {
		settings[key] = value
	}
	return settings
}

func (s *serverState) writeLoggingRuntimeSettings(settings map[string]any) error {
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return err
	}
	body, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.loggingSettingsPath(), body, 0o600)
}

func (s *serverState) serviceSettingsPath() string {
	return filepath.Join(s.cfg.DataDir, "service-settings.json")
}

func defaultServiceSettings() map[string]any {
	return map[string]any{
		"startupDelaySec": 0,
		"applyDelaySec":   0,
		"goMemLimit":      "48MiB",
		"goGC":            60,
		"downloadMirror":  "direct",
		"mirrorPrefix":    "",
	}
}

func (s *serverState) readServiceRuntimeSettings() map[string]any {
	settings := defaultServiceSettings()
	body, err := os.ReadFile(s.serviceSettingsPath())
	if err != nil {
		if runtime.GOOS != "windows" && commandExists("uci") {
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.start_delay")["stdout"]), ""); value != "" {
				settings["startupDelaySec"] = number(value, 0)
			}
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.apply_delay")["stdout"]), ""); value != "" {
				settings["applyDelaySec"] = number(value, 0)
			}
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.go_memlimit")["stdout"]), ""); value != "" {
				settings["goMemLimit"] = value
			}
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.go_gc")["stdout"]), ""); value != "" {
				settings["goGC"] = number(value, 60)
			}
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.download_mirror")["stdout"]), ""); value != "" {
				settings["downloadMirror"] = value
			}
			if value := firstLine(fmt.Sprint(run("uci", "-q", "get", "ruopenray-ui.main.mirror_prefix")["stdout"]), ""); value != "" {
				settings["mirrorPrefix"] = value
			}
		}
		return settings
	}
	var saved map[string]any
	if json.Unmarshal(body, &saved) != nil {
		return settings
	}
	for key, value := range saved {
		settings[key] = value
	}
	return settings
}

func (s *serverState) writeServiceRuntimeSettings(settings map[string]any) error {
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return err
	}
	body, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.serviceSettingsPath(), body, 0o600)
}

func clampSeconds(value any, fallback int, max int) int {
	out := number(value, fallback)
	if out < 0 {
		return 0
	}
	if out > max {
		return max
	}
	return out
}

func cleanMirrorPrefix(value any) string {
	raw := strings.TrimSpace(fmt.Sprint(value))
	if raw == "" || raw == "<nil>" {
		return ""
	}
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		return ""
	}
	return raw
}

func cleanGoMemLimit(value any) string {
	raw := strings.TrimSpace(fmt.Sprint(value))
	if raw == "" || raw == "<nil>" {
		return "48MiB"
	}
	matched, _ := regexp.MatchString(`^\d+(?:MiB|GiB|MB|GB|B)?$`, raw)
	if !matched {
		return "48MiB"
	}
	return raw
}

func (s *serverState) serviceSettings() map[string]any {
	settings := s.readServiceRuntimeSettings()
	startupDelay := clampSeconds(settings["startupDelaySec"], 0, 180)
	applyDelay := clampSeconds(settings["applyDelaySec"], 0, 60)
	goMemLimit := cleanGoMemLimit(settings["goMemLimit"])
	goGC := number(settings["goGC"], 60)
	if goGC < 20 {
		goGC = 20
	}
	if goGC > 200 {
		goGC = 200
	}
	mirror := strings.ToLower(strings.TrimSpace(fmt.Sprint(settings["downloadMirror"])))
	prefix := cleanMirrorPrefix(settings["mirrorPrefix"])
	if mirror != "custom" {
		mirror = "direct"
		prefix = ""
	}
	return map[string]any{
		"ok":              true,
		"startupDelaySec": startupDelay,
		"applyDelaySec":   applyDelay,
		"goMemLimit":      goMemLimit,
		"goGC":            goGC,
		"downloadMirror":  mirror,
		"mirrorPrefix":    prefix,
		"uci": map[string]any{
			"available": runtime.GOOS != "windows" && commandExists("uci"),
			"package":   "ruopenray-ui",
		},
	}
}

func (s *serverState) saveServiceSettings(payload map[string]any) map[string]any {
	settings := s.serviceSettings()
	settings["startupDelaySec"] = clampSeconds(payload["startupDelaySec"], number(settings["startupDelaySec"], 0), 180)
	settings["applyDelaySec"] = clampSeconds(payload["applyDelaySec"], number(settings["applyDelaySec"], 0), 60)
	settings["goMemLimit"] = cleanGoMemLimit(payload["goMemLimit"])
	goGC := number(payload["goGC"], number(settings["goGC"], 60))
	if goGC < 20 {
		goGC = 20
	}
	if goGC > 200 {
		goGC = 200
	}
	settings["goGC"] = goGC
	mirror := strings.ToLower(strings.TrimSpace(fmt.Sprint(payload["downloadMirror"])))
	prefix := cleanMirrorPrefix(payload["mirrorPrefix"])
	if mirror != "custom" || prefix == "" {
		mirror = "direct"
		prefix = ""
	}
	settings["downloadMirror"] = mirror
	settings["mirrorPrefix"] = prefix
	delete(settings, "uci")

	if err := s.writeServiceRuntimeSettings(settings); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "settings": s.serviceSettings()}
	}

	steps := []map[string]any{}
	persisted := false
	if runtime.GOOS != "windows" && commandExists("uci") {
		steps = append(steps, run("uci", "set", fmt.Sprintf("ruopenray-ui.main.start_delay=%d", settings["startupDelaySec"])))
		steps = append(steps, run("uci", "set", fmt.Sprintf("ruopenray-ui.main.apply_delay=%d", settings["applyDelaySec"])))
		steps = append(steps, run("uci", "set", "ruopenray-ui.main.go_memlimit="+fmt.Sprint(settings["goMemLimit"])))
		steps = append(steps, run("uci", "set", fmt.Sprintf("ruopenray-ui.main.go_gc=%d", settings["goGC"])))
		steps = append(steps, run("uci", "set", "ruopenray-ui.main.download_mirror="+fmt.Sprint(settings["downloadMirror"])))
		steps = append(steps, run("uci", "set", "ruopenray-ui.main.mirror_prefix="+fmt.Sprint(settings["mirrorPrefix"])))
		steps = append(steps, run("uci", "commit", "ruopenray-ui"))
		persisted = true
		for _, step := range steps {
			persisted = persisted && step["ok"] == true
		}
	}
	return map[string]any{
		"ok":        true,
		"settings":  s.serviceSettings(),
		"persisted": persisted,
		"steps":     steps,
		"stdout":    "Настройки сервиса сохранены",
	}
}

func (s *serverState) applyDelay() time.Duration {
	settings := s.serviceSettings()
	seconds := number(settings["applyDelaySec"], 0)
	if seconds <= 0 {
		return 0
	}
	if seconds > 60 {
		seconds = 60
	}
	return time.Duration(seconds) * time.Second
}

func (s *serverState) waitBeforeXrayAction(action string) map[string]any {
	if action != "start" && action != "restart" {
		return nil
	}
	delay := s.applyDelay()
	if delay <= 0 {
		return nil
	}
	time.Sleep(delay)
	return map[string]any{"ok": true, "stdout": fmt.Sprintf("Задержка перед %s: %s", action, delay)}
}

func (s *serverState) mirrorURL(rawURL string) string {
	settings := s.serviceSettings()
	if fmt.Sprint(settings["downloadMirror"]) != "custom" {
		return rawURL
	}
	prefix := strings.TrimSpace(fmt.Sprint(settings["mirrorPrefix"]))
	if prefix == "" {
		return rawURL
	}
	if strings.Contains(prefix, "{url}") {
		return strings.ReplaceAll(prefix, "{url}", url.QueryEscape(rawURL))
	}
	if strings.HasSuffix(prefix, "/") {
		return prefix + rawURL
	}
	return prefix + rawURL
}

func validLogLevel(value string) string {
	level := strings.ToLower(strings.TrimSpace(value))
	switch level {
	case "none", "error", "warning", "info", "debug":
		return level
	default:
		return "warning"
	}
}

func cleanLogPath(value string, fallback string) string {
	clean := strings.TrimSpace(value)
	if clean == "" || clean == "<nil>" {
		return fallback
	}
	clean = filepath.Clean(clean)
	if runtime.GOOS != "windows" && !strings.HasPrefix(clean, "/") {
		return fallback
	}
	return clean
}

func isVolatileLogPath(path string) bool {
	clean := filepath.Clean(strings.TrimSpace(path))
	clean = filepath.ToSlash(clean)
	return clean == "/tmp" || strings.HasPrefix(clean, "/tmp/") || clean == "/var" || strings.HasPrefix(clean, "/var/")
}

func (s *serverState) normalizeManagedLogPath(value string, fallback string) string {
	path := cleanLogPath(value, fallback)
	if isVolatileLogPath(path) {
		return fallback
	}
	return path
}

func ensureLogFileDir(path string) error {
	path = strings.TrimSpace(path)
	if path == "" || path == "<nil>" {
		return nil
	}
	return os.MkdirAll(filepath.Dir(path), 0o755)
}

func (s *serverState) prepareActiveLogFiles() error {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return err
	}
	changed, err := s.prepareConfigLogFiles(cfg)
	if err != nil {
		return err
	}
	if changed {
		return s.writeActiveConfigRaw(cfg)
	}
	return nil
}

func (s *serverState) prepareConfigLogFiles(cfg map[string]any) (bool, error) {
	logConfig, _ := cfg["log"].(map[string]any)
	if logConfig == nil {
		return false, nil
	}
	changed := false
	for key, fallback := range map[string]string{
		"access": s.defaultAccessLogPath(),
		"error":  s.defaultErrorLogPath(),
	} {
		raw := strings.TrimSpace(fmt.Sprint(logConfig[key]))
		if raw == "" || raw == "<nil>" {
			continue
		}
		path := s.normalizeManagedLogPath(raw, fallback)
		if path != raw {
			logConfig[key] = path
			changed = true
		}
		if err := ensureLogFileDir(path); err != nil {
			return changed, err
		}
	}
	return changed, nil
}

func intSetting(settings map[string]any, key string, fallback int) int {
	if value, ok := settings[key]; ok {
		return number(value, fallback)
	}
	return fallback
}

func fileSize(path string) int64 {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return 0
	}
	return info.Size()
}

func (s *serverState) loggingSettings() map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	logConfig, _ := cfg["log"].(map[string]any)
	if logConfig == nil {
		logConfig = map[string]any{}
	}
	runtimeSettings := s.readLoggingRuntimeSettings()
	accessRaw := strings.TrimSpace(fmt.Sprint(logConfig["access"]))
	errorRaw := strings.TrimSpace(fmt.Sprint(logConfig["error"]))
	accessPath := s.normalizeManagedLogPath(accessRaw, s.defaultAccessLogPath())
	errorPath := s.normalizeManagedLogPath(errorRaw, s.defaultErrorLogPath())
	configLevel := validLogLevel(fmt.Sprint(logConfig["loglevel"]))
	level := configLevel
	if savedLevel, ok := runtimeSettings["level"]; ok {
		level = validLogLevel(fmt.Sprint(savedLevel))
	}
	return map[string]any{
		"ok":               true,
		"level":            level,
		"appliedLevel":     configLevel,
		"levelPending":     level != configLevel,
		"accessLog":        accessRaw != "" && accessRaw != "<nil>",
		"accessPath":       accessPath,
		"accessSize":       fileSize(accessPath),
		"errorLog":         errorRaw != "" && errorRaw != "<nil>",
		"errorPath":        errorPath,
		"errorSize":        fileSize(errorPath),
		"dnsLog":           boolPayload(logConfig, "dnsLog", false),
		"maxSizeMb":        intSetting(runtimeSettings, "maxSizeMb", 2),
		"rotateCopies":     intSetting(runtimeSettings, "rotateCopies", 1),
		"clearOnRestart":   boolPayload(runtimeSettings, "clearOnRestart", false),
		"maintenanceEvery": logMaintenanceLabel(configLevel),
	}
}

func (s *serverState) saveLoggingSettings(payload map[string]any) map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	logConfig, _ := cfg["log"].(map[string]any)
	if logConfig == nil {
		logConfig = map[string]any{}
	}
	level := validLogLevel(fmt.Sprint(payload["level"]))
	accessPath := s.normalizeManagedLogPath(fmt.Sprint(payload["accessPath"]), s.defaultAccessLogPath())
	errorPath := s.normalizeManagedLogPath(fmt.Sprint(payload["errorPath"]), s.defaultErrorLogPath())
	accessLog := boolPayload(payload, "accessLog", false)
	errorLog := boolPayload(payload, "errorLog", false)
	logConfig["loglevel"] = level
	if accessLog {
		logConfig["access"] = accessPath
		if err := ensureLogFileDir(accessPath); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
	} else {
		delete(logConfig, "access")
	}
	if errorLog {
		logConfig["error"] = errorPath
		if err := ensureLogFileDir(errorPath); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
	} else {
		delete(logConfig, "error")
	}
	logConfig["dnsLog"] = boolPayload(payload, "dnsLog", false)
	cfg["log"] = logConfig

	runtimeSettings := s.readLoggingRuntimeSettings()
	maxSizeMb := number(payload["maxSizeMb"], intSetting(runtimeSettings, "maxSizeMb", 2))
	if maxSizeMb < 1 {
		maxSizeMb = 1
	}
	if maxSizeMb > 200 {
		maxSizeMb = 200
	}
	rotateCopies := number(payload["rotateCopies"], intSetting(runtimeSettings, "rotateCopies", 1))
	if rotateCopies < 0 {
		rotateCopies = 0
	}
	if rotateCopies > 5 {
		rotateCopies = 5
	}
	runtimeSettings["level"] = level
	runtimeSettings["maxSizeMb"] = maxSizeMb
	runtimeSettings["rotateCopies"] = rotateCopies
	runtimeSettings["clearOnRestart"] = boolPayload(payload, "clearOnRestart", false)

	test := s.validateConfig(cfg)
	if test["ok"] != true {
		return map[string]any{"ok": false, "stderr": "Конфигурация Xray не прошла проверку", "test": test, "settings": s.loggingSettings()}
	}
	backup, backupErr := s.backupActive("logging-before-apply")
	if backupErr != nil {
		return map[string]any{"ok": false, "stderr": backupErr.Error(), "test": test}
	}
	if err := s.writeActiveConfig(cfg); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "test": test, "backup": backup}
	}
	if err := s.writeLoggingRuntimeSettings(runtimeSettings); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "test": test, "backup": backup}
	}
	maintenance := s.maintainLogFiles(false)
	var restart map[string]any
	stdout := "Логирование сохранено и применено через перезапуск Xray"
	if boolPayload(payload, "restart", true) {
		restart = s.serviceAction("restart")
	} else {
		stdout = "Логирование сохранено в конфигурацию Xray. Работающий Xray применит его после перезапуска."
		restart = map[string]any{"ok": true, "stdout": "Xray не перезапускался"}
	}
	return map[string]any{"ok": restart["ok"], "test": test, "backup": backup, "restart": restart, "maintenance": maintenance, "settings": s.loggingSettings(), "stdout": stdout}
}

func (s *serverState) configuredLogPaths() []string {
	settings := s.loggingSettings()
	paths := []string{
		s.normalizeManagedLogPath(fmt.Sprint(settings["accessPath"]), s.defaultAccessLogPath()),
		s.normalizeManagedLogPath(fmt.Sprint(settings["errorPath"]), s.defaultErrorLogPath()),
		s.defaultAccessLogPath(),
		s.defaultErrorLogPath(),
		legacyAccessLogPath,
		legacyErrorLogPath,
		filepath.Join(s.cfg.DataDir, "access.log"),
		filepath.Join(s.cfg.DataDir, "error.log"),
	}
	seen := map[string]bool{}
	unique := []string{}
	for _, item := range paths {
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		unique = append(unique, item)
	}
	return unique
}

func (s *serverState) clearLogFiles() map[string]any {
	cleared := []map[string]any{}
	errors := []string{}
	for _, path := range s.configuredLogPaths() {
		info, err := os.Stat(path)
		if err == nil && !info.IsDir() {
			if err := os.Truncate(path, 0); err != nil {
				errors = append(errors, fmt.Sprintf("%s: %s", path, err.Error()))
			} else {
				cleared = append(cleared, map[string]any{"path": path, "previousSize": info.Size()})
			}
		}
		for _, rotated := range rotatedLogPaths(path, 5) {
			info, err := os.Stat(rotated)
			if err != nil || info.IsDir() {
				continue
			}
			if err := os.Remove(rotated); err != nil {
				errors = append(errors, fmt.Sprintf("%s: %s", rotated, err.Error()))
				continue
			}
			cleared = append(cleared, map[string]any{"path": rotated, "previousSize": info.Size(), "removed": true})
		}
	}
	deletedFds, deletedFDErrors := s.truncateDeletedXrayLogFDs()
	cleared = append(cleared, deletedFds...)
	errors = append(errors, deletedFDErrors...)
	return map[string]any{
		"ok":       len(errors) == 0,
		"cleared":  cleared,
		"errors":   errors,
		"settings": s.loggingSettings(),
		"stdout":   fmt.Sprintf("Очищено файлов логов: %d", len(cleared)),
		"stderr":   strings.Join(errors, "\n"),
	}
}

func (s *serverState) startLogMaintenance() {
	go func() {
		ticker := time.NewTicker(debugLogMaintenanceEvery)
		defer ticker.Stop()
		s.maintainLogFiles(false)
		last := time.Now()
		for range ticker.C {
			settings := s.loggingSettings()
			interval := normalLogMaintenanceEvery
			switch settings["appliedLevel"] {
			case "debug":
				interval = debugLogMaintenanceEvery
			case "info":
				interval = infoLogMaintenanceEvery
			}
			if time.Since(last)+time.Second < interval {
				continue
			}
			s.maintainLogFiles(false)
			last = time.Now()
		}
	}()
}

func logMaintenanceLabel(level string) string {
	if level == "debug" {
		return "1 мин"
	}
	if level == "info" {
		return "5 мин"
	}
	return "15 мин"
}

func (s *serverState) maintainLogFiles(restart bool) map[string]any {
	if err := s.prepareActiveLogFiles(); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	settings := s.loggingSettings()
	if settings["ok"] != true {
		return map[string]any{"ok": false, "stderr": fmt.Sprint(settings["error"])}
	}
	if restart && boolPayload(settings, "clearOnRestart", false) {
		result := s.clearLogFiles()
		result["action"] = "clear"
		return result
	}
	maxSizeMb := number(settings["maxSizeMb"], 2)
	rotateCopies := number(settings["rotateCopies"], 1)
	if maxSizeMb <= 0 || rotateCopies <= 0 {
		deletedFds, deletedFDErrors := s.truncateDeletedXrayLogFDs()
		return map[string]any{"ok": len(deletedFDErrors) == 0, "rotated": []any{}, "deletedFds": deletedFds, "errors": deletedFDErrors, "stderr": strings.Join(deletedFDErrors, "\n")}
	}
	maxBytes := int64(maxSizeMb) * 1024 * 1024
	rotated := []map[string]any{}
	errors := []string{}
	for _, path := range s.configuredLogPaths() {
		info, err := os.Stat(path)
		if err != nil || info.IsDir() || info.Size() <= maxBytes {
			continue
		}
		if err := rotateLogFile(path, rotateCopies, maxBytes); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %s", path, err.Error()))
			continue
		}
		rotated = append(rotated, map[string]any{"path": path, "previousSize": info.Size()})
		if err := maintainRotatedLogCopies(path, rotateCopies, maxBytes); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %s", path, err.Error()))
		}
	}
	for _, path := range s.configuredLogPaths() {
		if err := maintainRotatedLogCopies(path, rotateCopies, maxBytes); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %s", path, err.Error()))
		}
	}
	deletedFds, deletedFDErrors := s.truncateDeletedXrayLogFDs()
	errors = append(errors, deletedFDErrors...)
	return map[string]any{"ok": len(errors) == 0, "rotated": rotated, "deletedFds": deletedFds, "errors": errors, "stderr": strings.Join(errors, "\n")}
}

func (s *serverState) truncateDeletedXrayLogFDs() ([]map[string]any, []string) {
	cleared := []map[string]any{}
	errors := []string{}
	seen := map[string]bool{}
	for _, name := range []string{"access.log", "error.log"} {
		for _, fdPath := range xrayDeletedLogFDPaths(name) {
			if seen[fdPath] {
				continue
			}
			seen[fdPath] = true
			info, err := os.Stat(fdPath)
			if err != nil || info.IsDir() {
				if err != nil && !os.IsNotExist(err) {
					errors = append(errors, fmt.Sprintf("%s: %s", fdPath, err.Error()))
				}
				continue
			}
			if err := os.Truncate(fdPath, 0); err != nil {
				errors = append(errors, fmt.Sprintf("%s: %s", fdPath, err.Error()))
				continue
			}
			cleared = append(cleared, map[string]any{"path": fdPath, "previousSize": info.Size(), "deletedFd": true})
		}
	}
	return cleared, errors
}

func rotateLogFile(logPath string, copies int, maxBytes int64) error {
	if err := os.MkdirAll(filepath.Dir(logPath), 0o755); err != nil {
		return err
	}
	if copies < 1 {
		return os.Truncate(logPath, 0)
	}
	_ = os.Remove(fmt.Sprintf("%s.%d", logPath, copies))
	_ = os.Remove(fmt.Sprintf("%s.%d.gz", logPath, copies))
	for i := copies - 1; i >= 1; i-- {
		fromPlain := fmt.Sprintf("%s.%d", logPath, i)
		toPlain := fmt.Sprintf("%s.%d", logPath, i+1)
		fromGzip := fromPlain + ".gz"
		toGzip := toPlain + ".gz"
		if fileExists(fromGzip) {
			_ = os.Rename(fromGzip, toGzip)
			continue
		}
		_ = os.Rename(fromPlain, toPlain)
	}
	if err := copyLogFileTail(logPath, logPath+".1", maxBytes); err != nil {
		return err
	}
	if err := os.Truncate(logPath, 0); err != nil {
		return err
	}
	compressLogIfPossible(logPath + ".1")
	return nil
}

func copyLogFileTail(src string, dst string, maxBytes int64) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	info, err := in.Stat()
	if err != nil {
		return err
	}
	if maxBytes > 0 && info.Size() > maxBytes {
		if _, err := in.Seek(-maxBytes, io.SeekEnd); err != nil {
			return err
		}
	}
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func maintainRotatedLogCopies(logPath string, copies int, maxBytes int64) error {
	var firstErr error
	for _, path := range rotatedLogPaths(logPath, copies) {
		if !strings.HasSuffix(path, ".gz") && fileExists(path) {
			if maxBytes > 0 {
				if err := trimFileTail(path, maxBytes); err != nil && firstErr == nil {
					firstErr = err
				}
			}
			compressLogIfPossible(path)
		}
	}
	for _, path := range rotatedLogPaths(logPath, 10) {
		index := rotatedLogIndex(logPath, path)
		if index <= copies {
			continue
		}
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func rotatedLogPaths(logPath string, copies int) []string {
	paths := []string{}
	if copies < 1 {
		return paths
	}
	for i := 1; i <= copies; i++ {
		plain := fmt.Sprintf("%s.%d", logPath, i)
		paths = append(paths, plain, plain+".gz")
	}
	return paths
}

func rotatedLogIndex(logPath string, path string) int {
	rest := strings.TrimPrefix(path, logPath+".")
	rest = strings.TrimSuffix(rest, ".gz")
	return number(rest, 0)
}

func compressLogIfPossible(path string) {
	if !commandExists("gzip") || !fileExists(path) {
		return
	}
	result := run("gzip", "-f", path)
	if result["ok"] != true {
		return
	}
}

func trimFileTail(path string, maxBytes int64) error {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() || info.Size() <= maxBytes {
		return err
	}
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	if _, err := file.Seek(-maxBytes, io.SeekEnd); err != nil {
		return err
	}
	data, err := io.ReadAll(file)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
