package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/AceAsket/RuOpenRay-Keenetic/internal/geodata"
)

func (s *serverState) updateGeo(payload map[string]any) map[string]any {
	geoipURL := strings.TrimSpace(fmt.Sprint(payload["geoipUrl"]))
	geositeURL := strings.TrimSpace(fmt.Sprint(payload["geositeUrl"]))
	backup := boolPayload(payload, "backup", false)
	selected := stringList(payload["presets"])
	if len(selected) == 0 {
		if presetID := strings.TrimSpace(fmt.Sprint(payload["preset"])); presetID != "" && presetID != "<nil>" {
			selected = append(selected, presetID)
		}
	}
	if err := os.MkdirAll(s.cfg.GeoDir, 0o755); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	updates := []map[string]any{}
	baseCount := 0
	for _, presetID := range selected {
		if presetID == "custom" {
			continue
		}
		found := false
		for _, preset := range s.geoPresets() {
			if fmt.Sprint(preset["id"]) != presetID {
				continue
			}
			found = true
			if installable, ok := preset["installable"].(bool); ok && !installable {
				return map[string]any{"ok": false, "stderr": "Этот источник справочный и не устанавливается в Xray автоматически"}
			}
			mode := fmt.Sprint(preset["mode"])
			if mode == "extra-geosite" {
				target := strings.TrimSpace(fmt.Sprint(preset["target"]))
				url := strings.TrimSpace(fmt.Sprint(preset["geositeUrl"]))
				if target == "" || target == "<nil>" || url == "" || url == "<nil>" {
					return map[string]any{"ok": false, "stderr": "Для дополнительного geosite-файла не задана ссылка или имя файла"}
				}
				updates = append(updates, s.downloadGeoFile(target, url, backup))
				continue
			}
			if mode == "separate" {
				target := geodata.CleanTarget(fmt.Sprint(preset["target"]))
				geoipTarget, geositeTarget := separateGeoTargets(target)
				geoipURL := strings.TrimSpace(fmt.Sprint(preset["geoipUrl"]))
				geositeURL := strings.TrimSpace(fmt.Sprint(preset["geositeUrl"]))
				if geoipTarget == "" || geositeTarget == "" {
					return map[string]any{"ok": false, "stderr": "Для отдельной установки geodata задайте короткое имя файлов"}
				}
				if geoipURL == "" || geositeURL == "" || geoipURL == "<nil>" || geositeURL == "<nil>" {
					return map[string]any{"ok": false, "stderr": "Для отдельной установки geodata нужны ссылки на geoip.dat и geosite.dat"}
				}
				updates = append(updates, s.downloadGeoFile(geoipTarget, geoipURL, backup))
				updates = append(updates, s.downloadGeoFile(geositeTarget, geositeURL, backup))
				continue
			}
			baseCount++
			if baseCount > 1 {
				return map[string]any{"ok": false, "stderr": "Выберите только один базовый источник geoip.dat/geosite.dat. Дополнительные DAT можно ставить вместе с ним."}
			}
			if mode == "geoip-only" {
				url := strings.TrimSpace(fmt.Sprint(preset["geoipUrl"]))
				if url == "" || url == "<nil>" {
					return map[string]any{"ok": false, "stderr": "Для источника geoip.dat не задана ссылка"}
				}
				updates = append(updates, s.downloadGeoFile("geoip.dat", url, backup))
				continue
			}
			updates = append(updates, s.downloadGeoFile("geoip.dat", fmt.Sprint(preset["geoipUrl"]), backup))
			updates = append(updates, s.downloadGeoFile("geosite.dat", fmt.Sprint(preset["geositeUrl"]), backup))
		}
		if !found {
			return map[string]any{"ok": false, "stderr": "Неизвестный geo-источник: " + presetID}
		}
	}
	customIDs := stringList(payload["customSourceIds"])
	if len(customIDs) > 0 {
		sources := s.geoCustomSources()
		for _, sourceID := range customIDs {
			found := false
			for _, source := range sources {
				if fmt.Sprint(source["id"]) != sourceID {
					continue
				}
				found = true
				if source["enabled"] == false {
					return map[string]any{"ok": false, "stderr": "Источник geodata выключен: " + sourceID}
				}
				sourceKind := fmt.Sprint(source["kind"])
				if sourceKind == "extra" {
					target := geodata.CleanTarget(fmt.Sprint(source["target"]))
					rawURL := strings.TrimSpace(fmt.Sprint(source["url"]))
					if target == "" || rawURL == "" || rawURL == "<nil>" {
						return map[string]any{"ok": false, "stderr": "Для дополнительного dat-источника не задан URL или имя файла: " + sourceID}
					}
					updates = append(updates, s.downloadGeoFile(target, rawURL, backup))
					continue
				}
				if sourceKind == "separate" {
					target := geodata.CleanTarget(fmt.Sprint(source["target"]))
					geoipTarget, geositeTarget := separateGeoTargets(target)
					geoipURL := strings.TrimSpace(fmt.Sprint(source["geoipUrl"]))
					geositeURL := strings.TrimSpace(fmt.Sprint(source["geositeUrl"]))
					if geoipTarget == "" || geositeTarget == "" {
						return map[string]any{"ok": false, "stderr": "Для отдельного geodata-источника задайте короткое имя файлов: " + sourceID}
					}
					if geoipURL == "" || geositeURL == "" || geoipURL == "<nil>" || geositeURL == "<nil>" {
						return map[string]any{"ok": false, "stderr": "Для отдельного geodata-источника нужны ссылки на geoip.dat и geosite.dat: " + sourceID}
					}
					updates = append(updates, s.downloadGeoFile(geoipTarget, geoipURL, backup))
					updates = append(updates, s.downloadGeoFile(geositeTarget, geositeURL, backup))
					continue
				}
				baseCount++
				if baseCount > 1 {
					return map[string]any{"ok": false, "stderr": "Выберите только один базовый источник geoip.dat/geosite.dat. Дополнительные DAT можно ставить вместе с ним."}
				}
				geoipURL := strings.TrimSpace(fmt.Sprint(source["geoipUrl"]))
				geositeURL := strings.TrimSpace(fmt.Sprint(source["geositeUrl"]))
				if geoipURL == "" || geositeURL == "" || geoipURL == "<nil>" || geositeURL == "<nil>" {
					return map[string]any{"ok": false, "stderr": "Для базового geodata-источника не заданы обе ссылки: " + sourceID}
				}
				updates = append(updates, s.downloadGeoFile("geoip.dat", geoipURL, backup))
				updates = append(updates, s.downloadGeoFile("geosite.dat", geositeURL, backup))
			}
			if !found {
				return map[string]any{"ok": false, "stderr": "Неизвестный пользовательский geodata-источник: " + sourceID}
			}
		}
	}
	if (len(selected) == 0 && len(customIDs) == 0) || containsString(selected, "custom") {
		if geoipURL == "" || geositeURL == "" || geoipURL == "<nil>" || geositeURL == "<nil>" {
			return map[string]any{"ok": false, "stderr": "Укажите ссылки на geoip.dat и geosite.dat"}
		}
		updates = append(updates, s.downloadGeoFile("geoip.dat", geoipURL, backup))
		updates = append(updates, s.downloadGeoFile("geosite.dat", geositeURL, backup))
	}
	ok := len(updates) > 0
	for _, update := range updates {
		ok = ok && update["ok"] == true
	}
	restart := map[string]any{"ok": true, "stdout": ""}
	if ok {
		restart = s.serviceAction("restart")
		ok = restart["ok"].(bool)
	}
	items := []map[string]any{}
	for _, update := range updates {
		items = append(items, update)
	}
	items = append(items, restart)
	status := s.geoStatus()
	audit := s.geoAudit()
	var checked map[string]any
	if len(updates) > 0 {
		checked = s.checkGeoAudit()
	}
	if checked != nil {
		if checkedAudit, ok := checked["audit"].(map[string]any); ok {
			audit = checkedAudit
		}
		if checkedStatus, ok := checked["status"].(map[string]any); ok {
			status = checkedStatus
		} else {
			status["audit"] = audit
		}
	} else {
		status["audit"] = audit
	}
	stdout := concatCommandOutput(items...)
	if checked != nil {
		if checkedStdout := strings.TrimSpace(fmt.Sprint(checked["stdout"])); checkedStdout != "" && checkedStdout != "<nil>" {
			stdout = strings.TrimSpace(stdout + "\n\n" + checkedStdout)
		}
	}
	stderr := ""
	if !ok {
		stderr = geoUpdateError(updates, restart)
		if stderr == "" {
			stderr = stdout
		}
	}
	return map[string]any{"ok": ok, "backup": backup, "updates": updates, "restart": restart, "status": status, "audit": audit, "stdout": stdout, "stderr": stderr}
}

func (s *serverState) updateGeoLegacy(payload map[string]any) map[string]any {
	geoipURL := strings.TrimSpace(fmt.Sprint(payload["geoipUrl"]))
	geositeURL := strings.TrimSpace(fmt.Sprint(payload["geositeUrl"]))
	mode := "custom"
	target := ""
	if presetID := strings.TrimSpace(fmt.Sprint(payload["preset"])); presetID != "" && presetID != "<nil>" {
		for _, preset := range s.geoPresets() {
			if fmt.Sprint(preset["id"]) == presetID {
				if installable, ok := preset["installable"].(bool); ok && !installable {
					return map[string]any{"ok": false, "stderr": "Этот источник добавлен как справочный и не устанавливается в Xray автоматически"}
				}
				mode = fmt.Sprint(preset["mode"])
				target = strings.TrimSpace(fmt.Sprint(preset["target"]))
				geoipURL = fmt.Sprint(preset["geoipUrl"])
				geositeURL = fmt.Sprint(preset["geositeUrl"])
			}
		}
	}
	if mode == "extra-geosite" {
		if geositeURL == "" || geositeURL == "<nil>" || target == "" || target == "<nil>" {
			return map[string]any{"ok": false, "stderr": "Для дополнительного geosite-файла не задана ссылка или имя файла"}
		}
		if err := os.MkdirAll(s.cfg.GeoDir, 0o755); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
		geosite := s.downloadGeoFile(target, geositeURL)
		ok := geosite["ok"].(bool)
		restart := map[string]any{"ok": true, "stdout": ""}
		if ok {
			restart = s.serviceAction("restart")
			ok = restart["ok"].(bool)
		}
		return map[string]any{"ok": ok, "geosite": geosite, "restart": restart, "status": s.geoStatus(), "stdout": concatCommandOutput(geosite, restart)}
	}
	if mode == "geoip-only" {
		if geoipURL == "" || geoipURL == "<nil>" {
			return map[string]any{"ok": false, "stderr": "Для источника geoip.dat не задана ссылка"}
		}
		if err := os.MkdirAll(s.cfg.GeoDir, 0o755); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
		geoip := s.downloadGeoFile("geoip.dat", geoipURL)
		ok := geoip["ok"].(bool)
		restart := map[string]any{"ok": true, "stdout": ""}
		if ok {
			restart = s.serviceAction("restart")
			ok = restart["ok"].(bool)
		}
		return map[string]any{"ok": ok, "geoip": geoip, "restart": restart, "status": s.geoStatus(), "stdout": concatCommandOutput(geoip, restart)}
	}
	if geoipURL == "" || geositeURL == "" || geoipURL == "<nil>" || geositeURL == "<nil>" {
		return map[string]any{"ok": false, "stderr": "Укажите ссылки на geoip.dat и geosite.dat"}
	}
	if err := os.MkdirAll(s.cfg.GeoDir, 0o755); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	geoip := s.downloadGeoFile("geoip.dat", geoipURL)
	geosite := s.downloadGeoFile("geosite.dat", geositeURL)
	ok := geoip["ok"].(bool) && geosite["ok"].(bool)
	restart := map[string]any{"ok": true, "stdout": ""}
	if ok {
		restart = s.serviceAction("restart")
		ok = restart["ok"].(bool)
	}
	return map[string]any{"ok": ok, "geoip": geoip, "geosite": geosite, "restart": restart, "status": s.geoStatus(), "stdout": concatCommandOutput(geoip, geosite, restart)}
}

func (s *serverState) cleanupGeoBackups() map[string]any {
	entries, err := os.ReadDir(s.cfg.BackupDir)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	prefixes := []string{"geoip.dat-", "geosite.dat-"}
	for _, preset := range s.geoPresets() {
		if target := strings.TrimSpace(fmt.Sprint(preset["target"])); target != "" && target != "<nil>" {
			prefixes = append(prefixes, target+"-")
		}
	}
	for _, source := range s.geoCustomSources() {
		target := geodata.CleanTarget(fmt.Sprint(source["target"]))
		if fmt.Sprint(source["kind"]) == "separate" {
			geoipTarget, geositeTarget := separateGeoTargets(target)
			if geoipTarget != "" {
				prefixes = append(prefixes, geoipTarget+"-")
			}
			if geositeTarget != "" {
				prefixes = append(prefixes, geositeTarget+"-")
			}
			continue
		}
		if target != "" {
			prefixes = append(prefixes, target+"-")
		}
	}
	deleted := 0
	var freed int64
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		matched := false
		for _, prefix := range prefixes {
			if strings.HasPrefix(name, prefix) {
				matched = true
				break
			}
		}
		if !matched {
			continue
		}
		path := filepath.Join(s.cfg.BackupDir, name)
		info, err := entry.Info()
		if err == nil {
			freed += info.Size()
		}
		if err := os.Remove(path); err == nil {
			deleted++
		}
	}
	return map[string]any{"ok": true, "deleted": deleted, "freed": freed, "status": s.geoStatus(), "stdout": fmt.Sprintf("Удалено резервных копий geo: %d, освобождено %.1f MB", deleted, float64(freed)/1024/1024)}
}

func (s *serverState) deleteGeoFiles(payload map[string]any) map[string]any {
	files := stringList(payload["files"])
	if file := strings.TrimSpace(fmt.Sprint(payload["file"])); file != "" && file != "<nil>" {
		files = append(files, file)
	}
	if len(files) == 0 {
		return map[string]any{"ok": false, "stderr": "Выберите dat-файл для удаления", "status": s.geoStatus()}
	}
	deleted := []map[string]any{}
	errors := []string{}
	var freed int64
	for _, raw := range files {
		name := geodata.CleanFileName(raw)
		if name == "" {
			errors = append(errors, fmt.Sprintf("Некорректное имя файла: %s", raw))
			continue
		}
		target := filepath.Join(s.cfg.GeoDir, name)
		info, err := os.Stat(target)
		if err != nil {
			errors = append(errors, fmt.Sprintf("%s: %s", name, err.Error()))
			continue
		}
		if err := os.Remove(target); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %s", name, err.Error()))
			continue
		}
		freed += info.Size()
		deleted = append(deleted, map[string]any{"name": name, "size": info.Size()})
	}
	ok := len(errors) == 0
	stdout := fmt.Sprintf("Удалено dat-файлов: %d, освобождено %.1f MB. Xray не перезапускался автоматически.", len(deleted), float64(freed)/1024/1024)
	return map[string]any{"ok": ok, "deleted": deleted, "errors": errors, "freed": freed, "status": s.geoStatus(), "stdout": stdout, "stderr": strings.Join(errors, "\n")}
}

func separateGeoTargets(target string) (string, string) {
	clean := geodata.CleanTarget(target)
	base := strings.TrimSuffix(clean, ".dat")
	if base == "" {
		return "", ""
	}
	return base + "-geoip.dat", base + "-geosite.dat"
}

func (s *serverState) downloadGeoFile(name string, rawURL string, keepBackup ...bool) map[string]any {
	downloadURL := s.mirrorURL(rawURL)
	resp, resolver, err := s.downloadGeoResponse(downloadURL)
	if err != nil {
		return map[string]any{"ok": false, "file": name, "stderr": err.Error(), "url": downloadURL, "sourceUrl": rawURL}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return map[string]any{"ok": false, "file": name, "stderr": fmt.Sprintf("download HTTP %d", resp.StatusCode), "url": downloadURL, "sourceUrl": rawURL}
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return map[string]any{"ok": false, "file": name, "stderr": err.Error(), "url": downloadURL, "sourceUrl": rawURL}
	}
	if len(body) < 1024 {
		return map[string]any{"ok": false, "file": name, "stderr": "файл слишком маленький, похоже на ошибку загрузки", "url": downloadURL, "sourceUrl": rawURL}
	}
	target := filepath.Join(s.cfg.GeoDir, name)
	backup := len(keepBackup) == 0 || keepBackup[0]
	if backup {
		if err := os.MkdirAll(s.cfg.BackupDir, 0o755); err != nil {
			return map[string]any{"ok": false, "file": name, "stderr": err.Error(), "url": downloadURL, "sourceUrl": rawURL}
		}
	}
	if backup {
		current, err := os.ReadFile(target)
		if err == nil && len(current) > 0 {
			backup := filepath.Join(s.cfg.BackupDir, name+"-"+time.Now().Format("20060102-150405"))
			_ = os.WriteFile(backup, current, 0o644)
		}
	}
	if err := os.WriteFile(target, body, 0o644); err != nil {
		return map[string]any{"ok": false, "file": name, "stderr": err.Error(), "url": downloadURL, "sourceUrl": rawURL}
	}
	result := map[string]any{"ok": true, "file": name, "stdout": fmt.Sprintf("%s обновлен: %s", name, byteCount(int64(len(body)))), "url": downloadURL, "sourceUrl": rawURL, "size": len(body)}
	if resolver != "" {
		result["resolver"] = resolver
		result["stdout"] = fmt.Sprintf("%s\nиспользован резервный DNS: %s", result["stdout"], resolver)
	}
	return result
}

func geoUpdateError(updates []map[string]any, restart map[string]any) string {
	var failed []string
	dnsProblem := false
	for _, update := range updates {
		if update == nil || update["ok"] == true {
			continue
		}
		file := strings.TrimSpace(fmt.Sprint(update["file"]))
		if file == "" || file == "<nil>" {
			file = "geo-файл"
		}
		message := strings.TrimSpace(fmt.Sprint(update["stderr"]))
		if message == "" || message == "<nil>" {
			message = strings.TrimSpace(fmt.Sprint(update["message"]))
		}
		if message == "" || message == "<nil>" {
			message = "неизвестная ошибка скачивания"
		}
		lower := strings.ToLower(message)
		if strings.Contains(lower, "lookup ") && (strings.Contains(lower, ":53") || strings.Contains(lower, "server misbehaving") || strings.Contains(lower, "i/o timeout")) {
			dnsProblem = true
		}
		failed = append(failed, fmt.Sprintf("%s: %s", file, message))
	}
	if restart != nil && restart["ok"] == false {
		message := strings.TrimSpace(fmt.Sprint(restart["stderr"]))
		if message != "" && message != "<nil>" {
			failed = append(failed, "перезапуск Xray: "+message)
		}
	}
	if len(failed) == 0 {
		return ""
	}
	prefix := "Geo-файлы не обновились."
	if dnsProblem {
		prefix = "Geo-файлы не обновились: роутер не смог получить DNS-ответ для адреса загрузки. Проверьте DNS на самом OpenWrt или временно укажите рабочий системный DNS."
	}
	return prefix + "\n" + strings.Join(failed, "\n")
}

func (s *serverState) downloadGeoResponse(downloadURL string) (*http.Response, string, error) {
	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Get(downloadURL)
	if err == nil || !looksLikeDNSFailure(err.Error()) {
		return resp, "", err
	}
	firstErr := err
	for _, dnsServer := range geoFallbackDNSServers() {
		fallback := &http.Client{
			Timeout: 90 * time.Second,
			Transport: &http.Transport{
				Proxy:       http.ProxyFromEnvironment,
				DialContext: geoResolverDialContext(dnsServer),
			},
		}
		resp, err := fallback.Get(downloadURL)
		if err == nil {
			return resp, dnsServer, nil
		}
	}
	return nil, "", firstErr
}

func looksLikeDNSFailure(message string) bool {
	lower := strings.ToLower(message)
	return strings.Contains(lower, "lookup ") ||
		strings.Contains(lower, "no such host") ||
		strings.Contains(lower, "server misbehaving") ||
		strings.Contains(lower, ":53: read udp") ||
		strings.Contains(lower, ":53: i/o timeout")
}

func geoFallbackDNSServers() []string {
	paths := []string{"/tmp/resolv.conf.d/resolv.conf.auto", "/etc/resolv.conf"}
	seen := map[string]bool{}
	servers := []string{}
	for _, path := range paths {
		body, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(body), "\n") {
			parts := strings.Fields(line)
			if len(parts) < 2 || parts[0] != "nameserver" {
				continue
			}
			server := strings.Trim(parts[1], "[]")
			if server == "" || server == "127.0.0.1" || server == "::1" || server == "0.0.0.0" || seen[server] {
				continue
			}
			seen[server] = true
			servers = append(servers, server)
		}
	}
	return servers
}

func geoResolverDialContext(dnsServer string) func(context.Context, string, string) (net.Conn, error) {
	resolver := &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, _, _ string) (net.Conn, error) {
			dialer := net.Dialer{Timeout: 5 * time.Second}
			return dialer.DialContext(ctx, "udp", net.JoinHostPort(dnsServer, "53"))
		},
	}
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		ips, err := resolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, err
		}
		var lastErr error
		for _, ip := range ips {
			dialer := net.Dialer{Timeout: 15 * time.Second}
			conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.IP.String(), port))
			if err == nil {
				return conn, nil
			}
			lastErr = err
		}
		if lastErr != nil {
			return nil, lastErr
		}
		return nil, fmt.Errorf("DNS %s не вернул IP для %s", dnsServer, host)
	}
}
