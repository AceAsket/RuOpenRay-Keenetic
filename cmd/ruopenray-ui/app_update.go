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

func appLatestRelease() (map[string]any, error) {
	req, _ := http.NewRequest(http.MethodGet, "https://api.github.com/repos/"+appRepoFullName+"/releases?per_page=1", nil)
	req.Header.Set("accept", "application/vnd.github+json")
	req.Header.Set("user-agent", "RuOpenRay UI")
	resp, err := (&http.Client{Timeout: 12 * time.Second}).Do(req)
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
	return parseAppRelease(raw[0]), nil
}

func appRelease(version string) (map[string]any, error) {
	if version == "" || version == "latest" || version == "<nil>" {
		return appLatestRelease()
	}
	req, _ := http.NewRequest(http.MethodGet, appReleaseAPI(version), nil)
	req.Header.Set("accept", "application/vnd.github+json")
	req.Header.Set("user-agent", "RuOpenRay UI")
	resp, err := (&http.Client{Timeout: 12 * time.Second}).Do(req)
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
	release, err := appRelease(version)
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
	resp, err := (&http.Client{Timeout: 120 * time.Second}).Get(downloadURL)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "url": downloadURL, "release": release}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return map[string]any{"ok": false, "stderr": fmt.Sprintf("download HTTP %d", resp.StatusCode), "url": downloadURL, "release": release}
	}
	tmp := filepath.Join(os.TempDir(), fmt.Sprintf("ruopenray-ui-%d.new", time.Now().UnixNano()))
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "release": release}
	}
	size, copyErr := io.Copy(out, io.LimitReader(resp.Body, 64*1024*1024))
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
		"stdout": fmt.Sprintf("RuOpenRay UI обновлен до %s. Сервис будет перезапущен.", release["tag"]),
	}
}

func (s *serverState) restartAppServiceLater() map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "stdout": "dev-mode: перезапуск ruopenray-ui пропущен"}
	}
	if _, err := os.Stat("/etc/init.d/" + appServiceName); err != nil {
		return map[string]any{"ok": true, "stdout": "init-скрипт ruopenray-ui не найден; перезапустите сервис вручную"}
	}
	cmd := exec.Command("sh", "-c", "sleep 1; /etc/init.d/ruopenray-ui restart >/tmp/ruopenray-ui-update.log 2>&1")
	if err := cmd.Start(); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	return map[string]any{"ok": true, "stdout": "запланирован перезапуск ruopenray-ui", "pid": cmd.Process.Pid}
}
