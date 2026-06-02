package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

var xrayCoreReleasesCache = struct {
	sync.Mutex
	loadedAt time.Time
	items    []map[string]any
}{
	items: []map[string]any{},
}

func xrayCoreReleases() ([]map[string]any, error) {
	xrayCoreReleasesCache.Lock()
	if len(xrayCoreReleasesCache.items) > 0 && time.Since(xrayCoreReleasesCache.loadedAt) < 10*time.Minute {
		cached := append([]map[string]any(nil), xrayCoreReleasesCache.items...)
		xrayCoreReleasesCache.Unlock()
		return cached, nil
	}
	xrayCoreReleasesCache.Unlock()

	req, _ := http.NewRequest(http.MethodGet, "https://api.github.com/repos/XTLS/Xray-core/releases?per_page=50", nil)
	req.Header.Set("accept", "application/vnd.github+json")
	req.Header.Set("user-agent", "RuOpenRay UI")
	resp, err := (&http.Client{Timeout: 12 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("GitHub releases HTTP %d", resp.StatusCode)
	}
	var raw []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}
	releases := []map[string]any{}
	assetName := xrayAssetName()
	for _, item := range raw {
		tag := fmt.Sprint(item["tag_name"])
		assets := asArray(item["assets"])
		assetURL := ""
		for _, asset := range assets {
			if obj, ok := asset.(map[string]any); ok && fmt.Sprint(obj["name"]) == assetName {
				assetURL = fmt.Sprint(obj["browser_download_url"])
				break
			}
		}
		releases = append(releases, map[string]any{
			"tag": tag, "name": firstNonEmpty(fmt.Sprint(item["name"]), tag),
			"publishedAt": item["published_at"], "asset": assetName, "assetUrl": assetURL,
			"prerelease": item["prerelease"],
		})
	}
	xrayCoreReleasesCache.Lock()
	xrayCoreReleasesCache.items = append([]map[string]any(nil), releases...)
	xrayCoreReleasesCache.loadedAt = time.Now()
	xrayCoreReleasesCache.Unlock()
	return releases, nil
}

func xrayAssetName() string {
	switch runtime.GOARCH {
	case "amd64":
		return "Xray-linux-64.zip"
	case "386":
		return "Xray-linux-32.zip"
	case "arm64":
		return "Xray-linux-arm64-v8a.zip"
	case "arm":
		return "Xray-linux-arm32-v7a.zip"
	case "mipsle":
		return "Xray-linux-mips32le.zip"
	case "mips":
		return "Xray-linux-mips32.zip"
	case "mips64le":
		return "Xray-linux-mips64le.zip"
	case "mips64":
		return "Xray-linux-mips64.zip"
	default:
		return "Xray-linux-" + runtime.GOARCH + ".zip"
	}
}

func packageArchitecture(manager string) string {
	switch manager {
	case "apk":
		out := runTimeout(5*time.Second, "apk", "--print-arch")
		return firstLine(fmt.Sprint(out["stdout"]), "")
	case "opkg":
		out := runTimeout(5*time.Second, "opkg", "print-architecture")
		selected := ""
		for _, line := range strings.Split(fmt.Sprint(out["stdout"]), "\n") {
			fields := strings.Fields(line)
			if len(fields) >= 2 && fields[0] == "arch" && fields[1] != "all" && fields[1] != "noarch" {
				selected = fields[1]
			}
		}
		return selected
	default:
		return ""
	}
}

func tproxyModuleStatus(manager string) map[string]any {
	required := []string{"kmod-nf-tproxy", "kmod-nft-tproxy", "kmod-nft-socket"}
	if runtime.GOOS == "windows" {
		return map[string]any{
			"ok":        true,
			"required":  required,
			"installed": []string{},
			"missing":   []string{},
			"detail":    "проверяется на OpenWrt",
		}
	}
	installed := []string{}
	missing := []string{}
	for _, pkg := range required {
		ok := false
		switch manager {
		case "apk":
			ok = runTimeout(5*time.Second, "apk", "info", "-e", pkg)["ok"] == true
		case "opkg":
			ok = runTimeout(5*time.Second, "opkg", "status", pkg)["ok"] == true
		}
		if ok {
			installed = append(installed, pkg)
		} else {
			missing = append(missing, pkg)
		}
	}
	detail := "установлены: " + strings.Join(installed, ", ")
	if len(installed) == 0 {
		detail = "не установлены"
	}
	if len(missing) > 0 {
		detail = "не хватает: " + strings.Join(missing, ", ")
	}
	return map[string]any{
		"ok":        len(missing) == 0,
		"required":  required,
		"installed": installed,
		"missing":   missing,
		"detail":    detail,
	}
}

func systemArchitecture(manager string) map[string]any {
	uname := runTimeout(5*time.Second, "uname", "-m")
	return map[string]any{
		"goos":           runtime.GOOS,
		"goarch":         runtime.GOARCH,
		"uname":          firstLine(fmt.Sprint(uname["stdout"]), runtime.GOARCH),
		"packageManager": manager,
		"packageArch":    packageArchitecture(manager),
		"githubAsset":    xrayAssetName(),
	}
}

func findReleaseAsset(version string) (string, string, error) {
	releases, err := xrayCoreReleases()
	if err != nil {
		return "", "", err
	}
	for _, release := range releases {
		if fmt.Sprint(release["tag"]) == version {
			url := strings.TrimSpace(fmt.Sprint(release["assetUrl"]))
			if url == "" {
				return "", "", fmt.Errorf("для %s нет ассета %s", version, xrayAssetName())
			}
			return url, fmt.Sprint(release["asset"]), nil
		}
	}
	return "", "", fmt.Errorf("релиз %s не найден среди последних 10", version)
}

func (s *serverState) installCoreRelease(version string, keepBackup bool) map[string]any {
	arch := systemArchitecture("github-release")
	assetURL, assetName, err := findReleaseAsset(version)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "arch": arch}
	}
	downloadURL := s.mirrorURL(assetURL)
	resp, err := (&http.Client{Timeout: 90 * time.Second}).Get(downloadURL)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "arch": arch, "url": downloadURL}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return map[string]any{"ok": false, "stderr": fmt.Sprintf("download HTTP %d", resp.StatusCode), "arch": arch, "url": downloadURL}
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "arch": arch}
	}
	reader, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "arch": arch}
	}
	var binary []byte
	for _, file := range reader.File {
		if filepath.Base(file.Name) != "xray" {
			continue
		}
		rc, err := file.Open()
		if err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "arch": arch}
		}
		binary, err = io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "arch": arch}
		}
		break
	}
	if len(binary) == 0 {
		return map[string]any{"ok": false, "stderr": "в архиве не найден бинарник xray"}
	}
	target := "/usr/bin/xray"
	current, _ := os.ReadFile(target)
	backup := ""
	if keepBackup && len(current) > 0 {
		_ = os.MkdirAll(s.cfg.BackupDir, 0o755)
		backup = filepath.Join(s.cfg.BackupDir, "xray-"+time.Now().Format("20060102-150405"))
	}
	_ = os.Remove(target)
	if err := os.WriteFile(target, binary, 0o755); err != nil {
		if len(current) > 0 {
			_ = os.WriteFile(target, current, 0o755)
		}
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	if len(current) > 0 && backup != "" {
		_ = os.WriteFile(backup, current, 0o755)
	}
	return map[string]any{"ok": true, "stdout": fmt.Sprintf("Установлен %s из %s", version, assetName), "backup": backup, "backupEnabled": keepBackup, "url": downloadURL}
}

func (s *serverState) updateCore(version string, keepBackup bool) map[string]any {
	before := firstLine(fmt.Sprint(run("xray", "version")["stdout"]), "xray не найден")
	if version != "" && version != "<nil>" {
		stop := s.serviceAction("stop")
		install := s.installCoreRelease(version, keepBackup)
		after := firstLine(fmt.Sprint(run("xray", "version")["stdout"]), "xray не найден")
		restart := s.serviceAction("restart")
		ok := install["ok"].(bool) && restart["ok"].(bool)
		return map[string]any{
			"ok": ok, "packageManager": "github-release", "version": version,
			"before": before, "after": after, "stop": stop, "install": install, "restart": restart,
			"arch":   systemArchitecture("github-release"),
			"stdout": concatCommandOutput(stop, install, restart),
		}
	}
	if runtime.GOOS == "windows" {
		return map[string]any{
			"ok":             true,
			"packageManager": "dev-mode",
			"before":         before,
			"after":          before,
			"stdout":         "dev-mode: на OpenWrt будет выполнено обновление пакета xray-core",
		}
	}

	var manager string
	var update map[string]any
	var install map[string]any
	switch {
	case commandExists("apk"):
		manager = "apk"
		update = runTimeout(90*time.Second, "apk", "update")
		install = runTimeout(180*time.Second, "apk", "add", "--upgrade", "xray-core", "kmod-nf-tproxy", "kmod-nft-tproxy", "kmod-nft-socket")
	case commandExists("opkg"):
		manager = "opkg"
		update = runTimeout(90*time.Second, "opkg", "update")
		install = runTimeout(180*time.Second, "opkg", "install", "xray-core", "kmod-nf-tproxy", "kmod-nft-tproxy", "kmod-nft-socket")
	default:
		return map[string]any{"ok": false, "stderr": "Не найден пакетный менеджер apk или opkg"}
	}

	after := firstLine(fmt.Sprint(run("xray", "version")["stdout"]), "xray не найден")
	enable := s.enableXrayServiceConfig()
	arch := systemArchitecture(manager)
	restart := s.serviceAction("restart")
	ok := update["ok"].(bool) && install["ok"].(bool) && enable["ok"].(bool) && restart["ok"].(bool)
	return map[string]any{
		"ok":             ok,
		"packageManager": manager,
		"arch":           arch,
		"before":         before,
		"after":          after,
		"update":         update,
		"install":        install,
		"enable":         enable,
		"restart":        restart,
		"stdout":         concatCommandOutput(update, install, enable, restart),
	}
}
