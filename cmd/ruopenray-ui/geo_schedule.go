package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/AceAsket/RuOpenRay-Keenetic/internal/geodata"
)

func (s *serverState) geoSchedulePath() string {
	return filepath.Join(s.cfg.DataDir, "geo-schedule.json")
}

func (s *serverState) geoSchedule() map[string]any {
	defaults := map[string]any{
		"enabled": false, "interval": "weekly", "weekday": "0", "time": "04:20",
		"preset": "nidelon", "presets": []string{"nidelon"}, "customSourceIds": []string{}, "backup": false,
	}
	body, err := os.ReadFile(s.geoSchedulePath())
	if err != nil {
		return defaults
	}
	var saved map[string]any
	if json.Unmarshal(body, &saved) != nil {
		return defaults
	}
	for key, value := range defaults {
		if _, ok := saved[key]; !ok {
			saved[key] = value
		}
	}
	return saved
}

func (s *serverState) saveGeoSchedule(payload map[string]any) map[string]any {
	presets := stringList(payload["presets"])
	if len(presets) == 0 {
		if preset := strings.TrimSpace(fmt.Sprint(payload["preset"])); preset != "" && preset != "<nil>" {
			presets = append(presets, preset)
		}
	}
	if len(presets) == 0 {
		presets = []string{"loyalsoldier"}
	}
	hour, minute := geodata.CleanScheduleTime(fmt.Sprint(payload["time"]))
	weekday := geodata.CleanWeekday(fmt.Sprint(payload["weekday"]))
	schedule := map[string]any{
		"enabled": boolPayload(payload, "enabled", false), "interval": firstNonEmpty(fmt.Sprint(payload["interval"]), "weekly"),
		"weekday": fmt.Sprint(weekday), "time": fmt.Sprintf("%02d:%02d", hour, minute), "presets": presets,
		"preset": presets[0], "customSourceIds": stringList(payload["customSourceIds"]), "backup": boolPayload(payload, "backup", false),
		"geoipUrl": strings.TrimSpace(fmt.Sprint(payload["geoipUrl"])), "geositeUrl": strings.TrimSpace(fmt.Sprint(payload["geositeUrl"])),
	}
	body, _ := json.MarshalIndent(schedule, "", "  ")
	if err := os.WriteFile(s.geoSchedulePath(), body, 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "schedule": schedule}
	}
	cron := s.installGeoCron(schedule)
	return map[string]any{"ok": cron["ok"], "schedule": schedule, "cron": cron, "status": s.geoStatus(), "stdout": cron["stdout"], "stderr": cron["stderr"]}
}

func (s *serverState) installGeoCron(schedule map[string]any) map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "stdout": "dev-mode: расписание сохранено без установки cron"}
	}
	const marker = "# RuOpenRay geo update"
	rootCrontab := s.cfg.crontabPath()
	body, _ := os.ReadFile(rootCrontab)
	var lines []string
	for _, line := range strings.Split(string(body), "\n") {
		if strings.Contains(line, marker) || strings.TrimSpace(line) == "" {
			continue
		}
		lines = append(lines, line)
	}
	if schedule["enabled"] == true {
		hour, minute := geodata.CleanScheduleTime(fmt.Sprint(schedule["time"]))
		weekday := geodata.CleanWeekday(fmt.Sprint(schedule["weekday"]))
		dow := "*"
		if fmt.Sprint(schedule["interval"]) == "weekly" {
			dow = fmt.Sprint(weekday)
		}
		binary := os.Args[0]
		if !filepath.IsAbs(binary) {
			binary = s.cfg.appBinaryPath()
		}
		env := fmt.Sprintf("RUOPENRAY_PLATFORM=%s RUOPENRAY_DATA_DIR=%s RUOPENRAY_GEO_DIR=%s RUOPENRAY_BACKUP_DIR=%s RUOPENRAY_XRAY_SERVICE=%s", geodata.ShellQuote(s.cfg.Platform), geodata.ShellQuote(s.cfg.DataDir), geodata.ShellQuote(s.cfg.GeoDir), geodata.ShellQuote(s.cfg.BackupDir), geodata.ShellQuote(s.cfg.ServiceName))
		lines = append(lines, fmt.Sprintf("%d %d * * %s %s %s --geo-update-scheduled >/tmp/ruopenray-geo-update.log 2>&1 %s", minute, hour, dow, env, geodata.ShellQuote(binary), marker))
	}
	content := strings.Join(lines, "\n")
	if strings.TrimSpace(content) != "" {
		content += "\n"
	}
	_ = os.MkdirAll(filepath.Dir(rootCrontab), 0o755)
	if err := os.WriteFile(rootCrontab, []byte(content), 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	restart := exec.Command(s.cfg.cronServiceScript(), "restart").Run()
	if restart != nil {
		return map[string]any{"ok": true, "stdout": "cron-файл обновлен, но cron не удалось перезапустить: " + restart.Error()}
	}
	return map[string]any{"ok": true, "stdout": "Расписание geo обновлено"}
}

func (s *serverState) runScheduledGeoUpdate() map[string]any {
	schedule := s.geoSchedule()
	if schedule["enabled"] != true {
		return map[string]any{"ok": true, "stdout": "Расписание geo выключено"}
	}
	return s.updateGeo(schedule)
}
