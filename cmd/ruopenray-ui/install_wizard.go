package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

func (s *serverState) installPlan() map[string]any {
	manager := "не найден"
	if commandExists("apk") {
		manager = "apk"
	} else if commandExists("opkg") {
		manager = "opkg"
	}
	tproxyModules := tproxyModuleStatus(manager)
	coreVersion := runTimeout(5*time.Second, "xray", "version")
	geo := s.geoStatus()
	geoip := mapValue(geo["geoip"])
	geosite := mapValue(geo["geosite"])
	system := s.systemMetrics()
	disk := mapValue(system["disk"])
	free := numberAny(disk["free"])
	xrayInstalled := coreVersion["ok"] == true
	geoInstalled := geoip["exists"] == true && geosite["exists"] == true
	panelSize := fileSizeOrZero(os.Args[0])
	xraySize := fileSizeOrZero("/usr/bin/xray")
	geoCurrent := numberAny(geoip["size"]) + numberAny(geosite["size"])
	backupCurrent := dirSizeOrZero(s.cfg.BackupDir)
	xrayNeeded := int64(30 * 1024 * 1024)
	if xrayInstalled {
		xrayNeeded = 0
	}
	leanGeoNeeded := int64(8 * 1024 * 1024)
	fullGeoNeeded := int64(32 * 1024 * 1024)
	if geoInstalled {
		leanGeoNeeded = 0
		fullGeoNeeded = 0
	}
	leanRequired := xrayNeeded + leanGeoNeeded + 2*1024*1024
	fullRequired := xrayNeeded + fullGeoNeeded + 2*1024*1024
	storage := map[string]any{
		"panelSize":       panelSize,
		"xraySize":        xraySize,
		"geoCurrent":      geoCurrent,
		"backupCurrent":   backupCurrent,
		"leanRequired":    leanRequired,
		"fullRequired":    fullRequired,
		"leanOk":          free == 0 || free >= leanRequired,
		"fullOk":          free == 0 || free >= fullRequired,
		"recommendedGeo":  "Nidelon",
		"recommendedMode": "Экономный режим: без резервных копий, компактный geosite/geoip, удаление лишних dat",
	}
	steps := []map[string]any{
		{"id": "manager", "title": "Пакетный менеджер", "ok": manager == "apk" || manager == "opkg", "detail": manager},
		{"id": "arch", "title": "Архитектура", "ok": true, "detail": fmt.Sprint(systemArchitecture("github-release")["uname"]) + " / " + xrayAssetName()},
		{"id": "space", "title": "Свободное место", "ok": storage["leanOk"], "detail": fmt.Sprintf("%s свободно · нужно от %s", byteCount(free), byteCount(leanRequired))},
		{"id": "xray", "title": "Xray-core", "ok": coreVersion["ok"] == true, "detail": firstLine(fmt.Sprint(coreVersion["stdout"]), "не найден")},
		{"id": "geo", "title": "Geo-файлы", "ok": geoip["exists"] == true && geosite["exists"] == true, "detail": fmt.Sprintf("geoip.dat: %v · geosite.dat: %v", geoip["exists"], geosite["exists"])},
		{"id": "tproxy", "title": "TPROXY-модули", "ok": tproxyModules["ok"], "detail": tproxyModules["detail"]},
		{"id": "nand", "title": "Экономия места", "ok": storage["leanOk"], "detail": fmt.Sprintf("экономный режим: %s, полный geo: %s", byteCount(leanRequired), byteCount(fullRequired))},
		{"id": "service", "title": "Сервис", "ok": true, "detail": "/etc/init.d/" + s.cfg.ServiceName},
	}
	return map[string]any{
		"ok":             true,
		"packageManager": manager,
		"arch":           systemArchitecture(manager),
		"core":           coreVersion,
		"geo":            geo,
		"tproxyModules":  tproxyModules,
		"disk":           disk,
		"storage":        storage,
		"steps":          steps,
		"installable":    (manager == "apk" || manager == "opkg") && runtime.GOOS != "windows",
	}
}

func fileSizeOrZero(path string) int64 {
	info, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return info.Size()
}

func dirSizeOrZero(path string) int64 {
	var total int64
	_ = filepath.WalkDir(path, func(item string, entry os.DirEntry, err error) error {
		if err != nil || entry == nil || entry.IsDir() {
			return nil
		}
		if info, err := entry.Info(); err == nil {
			total += info.Size()
		}
		return nil
	})
	return total
}
