package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	rsystem "github.com/AceAsket/RuOpenRay-Keenetic/internal/system"
)

func geoFileInfo(path string) map[string]any {
	info, err := os.Stat(path)
	if err != nil {
		return map[string]any{"exists": false, "path": path}
	}
	return map[string]any{"exists": true, "path": path, "size": info.Size(), "modifiedAt": info.ModTime().Format(time.RFC3339)}
}

func (s *serverState) geoStatus() map[string]any {
	extras := []map[string]any{}
	for _, preset := range s.geoPresets() {
		if target := strings.TrimSpace(fmt.Sprint(preset["target"])); target != "" && target != "<nil>" {
			extras = append(extras, map[string]any{"id": preset["id"], "name": preset["name"], "file": geoFileInfo(filepath.Join(s.cfg.GeoDir, target)), "ruleHint": preset["ruleHint"]})
		}
	}
	geoip := geoFileInfo(filepath.Join(s.cfg.GeoDir, "geoip.dat"))
	geosite := geoFileInfo(filepath.Join(s.cfg.GeoDir, "geosite.dat"))
	currentDatBytes := numberAny(geoip["size"]) + numberAny(geosite["size"])
	return map[string]any{
		"ok": true, "dir": s.cfg.GeoDir, "disk": rsystem.DiskInfo(s.cfg.GeoDir), "presets": s.visibleGeoPresets(), "presetOverrides": s.geoPresetOverrides(), "extras": extras, "files": s.geoInstalledFiles(), "customSources": s.geoCustomSources(), "userLists": s.geoUserLists(),
		"geoip": geoip, "geosite": geosite, "schedule": s.geoSchedule(),
		"audit": s.geoAudit(),
		"storage": map[string]any{
			"currentDatBytes": currentDatBytes,
			"backupBytes":     dirSizeOrZero(s.cfg.BackupDir),
			"compactPreset":   "nidelon",
			"compactEstimate": 8 * 1024 * 1024,
			"fullEstimate":    32 * 1024 * 1024,
		},
	}
}

func (s *serverState) geoInstalledFiles() []map[string]any {
	entries, err := os.ReadDir(s.cfg.GeoDir)
	if err != nil {
		return []map[string]any{}
	}
	files := []map[string]any{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".dat") {
			continue
		}
		info := geoFileInfo(filepath.Join(s.cfg.GeoDir, entry.Name()))
		info["name"] = entry.Name()
		if entry.Name() == "geoip.dat" || entry.Name() == "geosite.dat" {
			info["role"] = "base"
		} else {
			info["role"] = "extra"
		}
		files = append(files, info)
	}
	sort.Slice(files, func(i, j int) bool {
		return fmt.Sprint(files[i]["name"]) < fmt.Sprint(files[j]["name"])
	})
	return files
}
