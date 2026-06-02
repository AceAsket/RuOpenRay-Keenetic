package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

func ruOpenRayAssetName() string {
	switch runtime.GOARCH {
	case "amd64":
		return "ruopenray-ui-linux-amd64"
	case "arm64":
		return "ruopenray-ui-linux-arm64"
	case "arm":
		return "ruopenray-ui-linux-armv7"
	case "mipsle":
		return "ruopenray-ui-linux-mipsle-softfloat"
	case "mips":
		return "ruopenray-ui-linux-mips-softfloat"
	default:
		return "ruopenray-ui-linux-" + runtime.GOARCH
	}
}

func appReleaseAPI(version string) string {
	if version == "" || version == "latest" || version == "<nil>" {
		return "https://api.github.com/repos/" + appRepoFullName + "/releases/latest"
	}
	return "https://api.github.com/repos/" + appRepoFullName + "/releases/tags/" + url.PathEscape(version)
}

func (s *serverState) appLatestRelease() (map[string]any, error) {
	req, _ := http.NewRequest(http.MethodGet, "https://api.github.com/repos/"+appRepoFullName+"/releases?per_page=30", nil)
	req.Header.Set("accept", "application/vnd.github+json")
	req.Header.Set("user-agent", "RuOpenRay UI")
	client, _ := s.downloadHTTPClient(12 * time.Second)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		assetName := ruOpenRayAssetName()
		return map[string]any{"tag": "", "name": "релизов пока нет", "asset": assetName, "assetUrl": "", "assetSize": 0, "current": appVersion, "update": false}, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("GitHub releases HTTP %d", resp.StatusCode)
	}
	var raw []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		assetName := ruOpenRayAssetName()
		return map[string]any{"tag": "", "name": "релизов пока нет", "asset": assetName, "assetUrl": "", "assetSize": 0, "current": appVersion, "update": false}, nil
	}
	var best map[string]any
	for _, item := range raw {
		parsed := parseAppRelease(item)
		if strings.TrimSpace(fmt.Sprint(parsed["assetUrl"])) == "" || number(parsed["assetSize"], 0) < 1024*1024 {
			continue
		}
		if best == nil || newerAppRelease(parsed, best) {
			best = parsed
		}
	}
	if best != nil {
		return best, nil
	}
	for _, item := range raw {
		parsed := parseAppRelease(item)
		if strings.TrimSpace(fmt.Sprint(parsed["tag"])) == "" {
			continue
		}
		if best == nil || newerAppRelease(parsed, best) {
			best = parsed
		}
	}
	if best != nil {
		return best, nil
	}
	return parseAppRelease(raw[0]), nil
}

func (s *serverState) appRelease(version string) (map[string]any, error) {
	if version == "" || version == "latest" || version == "<nil>" {
		return s.appLatestRelease()
	}
	req, _ := http.NewRequest(http.MethodGet, appReleaseAPI(version), nil)
	req.Header.Set("accept", "application/vnd.github+json")
	req.Header.Set("user-agent", "RuOpenRay UI")
	client, _ := s.downloadHTTPClient(12 * time.Second)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("GitHub release HTTP %d", resp.StatusCode)
	}
	var raw map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}
	return parseAppRelease(raw), nil
}

func parseAppRelease(raw map[string]any) map[string]any {
	assetName := ruOpenRayAssetName()
	assetURL := ""
	assetSize := 0
	for _, item := range asArray(raw["assets"]) {
		asset, ok := item.(map[string]any)
		if !ok || fmt.Sprint(asset["name"]) != assetName {
			continue
		}
		assetURL = strings.TrimSpace(fmt.Sprint(asset["browser_download_url"]))
		assetSize = number(asset["size"], 0)
		break
	}
	tag := strings.TrimSpace(fmt.Sprint(raw["tag_name"]))
	return map[string]any{
		"tag":         tag,
		"name":        firstNonEmpty(fmt.Sprint(raw["name"]), tag),
		"publishedAt": raw["published_at"],
		"prerelease":  raw["prerelease"],
		"htmlUrl":     raw["html_url"],
		"asset":       assetName,
		"assetUrl":    assetURL,
		"assetSize":   assetSize,
		"current":     appVersion,
		"update":      tag != "" && tag != appVersion,
	}
}

func newerAppRelease(candidate map[string]any, current map[string]any) bool {
	candidateRank, candidateOK := appReleaseRank(fmt.Sprint(candidate["tag"]))
	currentRank, currentOK := appReleaseRank(fmt.Sprint(current["tag"]))
	if candidateOK && currentOK {
		for i := 0; i < len(candidateRank) && i < len(currentRank); i++ {
			if candidateRank[i] != currentRank[i] {
				return candidateRank[i] > currentRank[i]
			}
		}
		return len(candidateRank) > len(currentRank)
	}
	if candidateOK != currentOK {
		return candidateOK
	}
	return fmt.Sprint(candidate["publishedAt"]) > fmt.Sprint(current["publishedAt"])
}

func appReleaseRank(tag string) ([]int, bool) {
	tag = strings.TrimPrefix(strings.TrimSpace(tag), "v")
	parts := strings.Split(tag, "-keenetic.")
	if len(parts) != 2 {
		return nil, false
	}
	base := strings.Split(parts[0], ".")
	if len(base) == 0 {
		return nil, false
	}
	rank := make([]int, 0, len(base)+1)
	for _, part := range base {
		value, err := strconv.Atoi(part)
		if err != nil {
			return nil, false
		}
		rank = append(rank, value)
	}
	value, err := strconv.Atoi(parts[1])
	if err != nil {
		return nil, false
	}
	return append(rank, value), true
}

func replaceExecutableAcrossFilesystems(src string, dst string) error {
	if err := os.Chmod(src, 0o755); err != nil {
		return err
	}
	if err := os.Rename(src, dst); err == nil {
		return nil
	}
	sameDirTmp := filepath.Join(filepath.Dir(dst), "."+filepath.Base(dst)+"-"+time.Now().Format("20060102150405")+".new")
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(sameDirTmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(sameDirTmp)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(sameDirTmp)
		return closeErr
	}
	if err := os.Chmod(sameDirTmp, 0o755); err != nil {
		_ = os.Remove(sameDirTmp)
		return err
	}
	if err := os.Rename(sameDirTmp, dst); err != nil {
		_ = os.Remove(sameDirTmp)
		return err
	}
	_ = os.Remove(src)
	return nil
}

func (s *serverState) updateApp(version string, keepBackup bool) map[string]any {
	release, err := s.appRelease(version)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "version": appVersion, "arch": systemArchitecture("github-release")}
	}
	assetURL := strings.TrimSpace(fmt.Sprint(release["assetUrl"]))
	if assetURL == "" {
		return map[string]any{"ok": false, "stderr": fmt.Sprintf("для %s нет ассета %s", release["tag"], ruOpenRayAssetName()), "release": release}
	}
	exe, err := os.Executable()
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "release": release}
	}
	exe, _ = filepath.Abs(exe)
	downloadURL := s.mirrorURL(assetURL)
	tmp := filepath.Join(os.TempDir(), fmt.Sprintf("ruopenray-ui-%d.new", time.Now().UnixNano()))
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "release": release}
	}
	proxy := map[string]any{"enabled": false, "used": false}
	source := "github"
	var reader io.ReadCloser
	if offlinePath := s.offlineAssetPath(ruOpenRayAssetName()); offlinePath != "" {
		reader, err = os.Open(offlinePath)
		source = "offline"
		proxy = map[string]any{"enabled": true, "used": false, "offline": true, "path": offlinePath}
	} else {
		var resp *http.Response
		resp, proxy, err = s.downloadHTTPGet(downloadURL, 120*time.Second)
		if err != nil {
			_ = out.Close()
			_ = os.Remove(tmp)
			return map[string]any{"ok": false, "stderr": err.Error(), "url": downloadURL, "release": release, "downloadProxy": proxy}
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			_ = out.Close()
			_ = os.Remove(tmp)
			return map[string]any{"ok": false, "stderr": fmt.Sprintf("download HTTP %d", resp.StatusCode), "url": downloadURL, "release": release, "downloadProxy": proxy}
		}
		reader = resp.Body
	}
	if err != nil {
		_ = out.Close()
		_ = os.Remove(tmp)
		return map[string]any{"ok": false, "stderr": err.Error(), "release": release, "downloadProxy": proxy}
	}
	size, copyErr := io.Copy(out, io.LimitReader(reader, 64*1024*1024))
	if source == "offline" {
		_ = reader.Close()
	}
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(tmp)
		return map[string]any{"ok": false, "stderr": copyErr.Error(), "release": release}
	}
	if closeErr != nil {
		_ = os.Remove(tmp)
		return map[string]any{"ok": false, "stderr": closeErr.Error(), "release": release}
	}
	if size < 1024*1024 {
		_ = os.Remove(tmp)
		return map[string]any{"ok": false, "stderr": "скачанный бинарник слишком маленький", "size": size, "release": release}
	}
	backup := ""
	if keepBackup {
		_ = os.MkdirAll(s.cfg.BackupDir, 0o755)
		backup = filepath.Join(s.cfg.BackupDir, "ruopenray-ui-"+time.Now().Format("20060102-150405"))
		if body, err := os.ReadFile(exe); err == nil {
			_ = os.WriteFile(backup, body, 0o755)
		}
	}
	if err := replaceExecutableAcrossFilesystems(tmp, exe); err != nil {
		_ = os.Remove(tmp)
		return map[string]any{"ok": false, "stderr": err.Error(), "release": release, "target": exe}
	}
	restart := s.restartAppServiceLater()
	return map[string]any{
		"ok": true, "version": release["tag"], "previous": appVersion, "release": release,
		"backup": backup, "backupEnabled": keepBackup, "size": size, "target": exe, "restart": restart,
		"downloadProxy": proxy,
		"source":        source,
		"stdout":        fmt.Sprintf("RuOpenRay UI обновлен до %s. Сервис будет перезапущен.", release["tag"]),
	}
}

func (s *serverState) restartAppServiceLater() map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "stdout": "dev-mode: перезапуск ruopenray-ui пропущен"}
	}
	serviceScript := s.cfg.appServiceScript()
	if _, err := os.Stat(serviceScript); err != nil {
		return map[string]any{"ok": true, "stdout": "init-скрипт ruopenray-ui не найден; перезапустите сервис вручную"}
	}
	logPath := "/tmp/ruopenray-ui-update.log"
	if s.cfg.isKeenetic() {
		logPath = "/opt/tmp/ruopenray-ui-update.log"
	}
	cmd := exec.Command("sh", "-c", "sleep 1; "+singleQuote(serviceScript)+" restart >"+singleQuote(logPath)+" 2>&1")
	if err := cmd.Start(); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	return map[string]any{"ok": true, "stdout": "запланирован перезапуск ruopenray-ui", "pid": cmd.Process.Pid}
}
