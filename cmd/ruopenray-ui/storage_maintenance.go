package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var extDatReferencePattern = regexp.MustCompile(`(?i)ext:\s*"?([^":\s]+\.dat):`)

type storagePathStats struct {
	Size  int64
	Count int
}

func (s *serverState) storageReport() map[string]any {
	cfg, _ := s.readActiveConfig()
	usedDat := referencedDatFiles(cfg)
	unusedDat := s.unusedGeoDatFiles(usedDat)
	geoBaseSize, geoBaseCount := s.geoDatStats(false)
	geoExtraSize, geoExtraCount := s.geoDatStats(true)
	packageCache := packageCacheStats()
	backups := pathStats(s.cfg.BackupDir)
	offline := multiPathStats(s.offlineInstallDirs())
	logs := s.logFilesStats()
	appBinary := currentExecutableInfo()
	binaryBackups := appBinaryBackupStats()
	data := pathStats(s.cfg.DataDir)

	return map[string]any{
		"ok":        true,
		"disk":      s.appDiskInfo(),
		"usedDat":   sortedKeys(usedDat),
		"unusedDat": unusedDat,
		"paths": map[string]any{
			"dataDir":   s.cfg.DataDir,
			"backupDir": s.cfg.BackupDir,
			"offline":   s.offlineInstallDirs(),
			"geoDir":    s.cfg.GeoDir,
			"logsDir":   filepath.Join(s.cfg.DataDir, "logs"),
		},
		"items": map[string]any{
			"data": map[string]any{
				"label": "Данные RuOpenRay",
				"path":  s.cfg.DataDir,
				"size":  data.Size,
				"count": data.Count,
			},
			"backups": map[string]any{
				"label": "Резервные копии",
				"path":  s.cfg.BackupDir,
				"size":  backups.Size,
				"count": backups.Count,
			},
			"logs": map[string]any{
				"label": "Логи",
				"path":  filepath.Join(s.cfg.DataDir, "logs"),
				"size":  logs.Size,
				"count": logs.Count,
			},
			"geoBase": map[string]any{
				"label": "Стандартные DAT",
				"path":  s.cfg.GeoDir,
				"size":  geoBaseSize,
				"count": geoBaseCount,
			},
			"geoExtra": map[string]any{
				"label": "Дополнительные DAT",
				"path":  s.cfg.GeoDir,
				"size":  geoExtraSize,
				"count": geoExtraCount,
			},
			"packageCache": map[string]any{
				"label": "Кэш пакетов",
				"path":  strings.Join(packageCachePaths(), ", "),
				"size":  packageCache.Size,
				"count": packageCache.Count,
			},
			"offlineAssets": map[string]any{
				"label": "Offline assets",
				"path":  strings.Join(s.offlineInstallDirs(), ", "),
				"size":  offline.Size,
				"count": offline.Count,
			},
			"binaryBackups": map[string]any{
				"label": "Legacy binary backups",
				"path":  appBinaryBackupDir(),
				"size":  binaryBackups.Size,
				"count": binaryBackups.Count,
			},
			"appBinary": appBinary,
		},
	}
}

func (s *serverState) cleanupStorage(payload map[string]any) map[string]any {
	target := strings.TrimSpace(fmt.Sprint(payload["target"]))
	if target == "" {
		target = "all"
	}
	diskBefore := s.appDiskInfo()
	result := map[string]any{
		"ok":           true,
		"target":       target,
		"deleted":      0,
		"removedBytes": int64(0),
		"freed":        int64(0),
		"errors":       []string{},
		"steps":        []map[string]any{},
	}
	addStep := func(name string, step storageCleanupResult) {
		result["deleted"] = numberAny(result["deleted"]) + int64(step.Deleted)
		result["removedBytes"] = numberAny(result["removedBytes"]) + step.Freed
		if len(step.Errors) > 0 {
			result["ok"] = false
			result["errors"] = appendStringSlice(result["errors"], step.Errors...)
		}
		result["steps"] = append(result["steps"].([]map[string]any), map[string]any{
			"name":         name,
			"deleted":      step.Deleted,
			"removedBytes": step.Freed,
			"freed":        step.Freed,
			"errors":       step.Errors,
		})
	}

	switch target {
	case "old-backups":
		addStep("old-backups", cleanupDirectoryContentsKeepNewest(s.cfg.BackupDir, 1, true))
	case "backups":
		addStep("backups", cleanupDirectoryContents(s.cfg.BackupDir, true))
	case "package-cache":
		addStep("package-cache", cleanupPackageCache())
	case "unused-dat":
		cfg, _ := s.readActiveConfig()
		addStep("unused-dat", s.cleanupUnusedGeoDat(referencedDatFiles(cfg)))
	case "binary-backups":
		addStep("binary-backups", cleanupAppBinaryBackups())
	case "all":
		addStep("backups", cleanupDirectoryContents(s.cfg.BackupDir, true))
		addStep("binary-backups", cleanupAppBinaryBackups())
		addStep("package-cache", cleanupPackageCache())
		cfg, _ := s.readActiveConfig()
		addStep("unused-dat", s.cleanupUnusedGeoDat(referencedDatFiles(cfg)))
	default:
		result["ok"] = false
		result["errors"] = []string{"неизвестная цель очистки"}
	}
	diskAfter := s.appDiskInfo()
	beforeFree, beforeOK := diskFreeBytes(diskBefore)
	afterFree, afterOK := diskFreeBytes(diskAfter)
	result["diskBefore"] = diskBefore
	result["diskAfter"] = diskAfter
	result["freeKnown"] = beforeOK && afterOK
	if beforeOK {
		result["freeBefore"] = beforeFree
	}
	if afterOK {
		result["freeAfter"] = afterFree
	}
	if beforeOK && afterOK {
		result["freeDelta"] = afterFree - beforeFree
		result["freed"] = afterFree - beforeFree
	} else {
		result["freeDelta"] = int64(0)
		result["freed"] = int64(0)
	}
	result["report"] = s.storageReport()
	return result
}

type storageCleanupResult struct {
	Deleted int
	Freed   int64
	Errors  []string
}

func referencedDatFiles(value any) map[string]bool {
	refs := map[string]bool{
		"geoip.dat":   true,
		"geosite.dat": true,
	}
	var walk func(any)
	walk = func(item any) {
		switch typed := item.(type) {
		case map[string]any:
			for _, child := range typed {
				walk(child)
			}
		case []any:
			for _, child := range typed {
				walk(child)
			}
		case string:
			for _, match := range extDatReferencePattern.FindAllStringSubmatch(typed, -1) {
				if len(match) > 1 {
					refs[strings.ToLower(filepath.Base(match[1]))] = true
				}
			}
		}
	}
	walk(value)
	return refs
}

func (s *serverState) unusedGeoDatFiles(used map[string]bool) []map[string]any {
	files := []map[string]any{}
	for _, file := range s.geoInstalledFiles() {
		name := strings.TrimSpace(fmt.Sprint(file["name"]))
		if name == "" || !strings.HasSuffix(strings.ToLower(name), ".dat") {
			continue
		}
		if file["role"] == "base" || used[strings.ToLower(name)] {
			continue
		}
		files = append(files, file)
	}
	return files
}

func (s *serverState) cleanupUnusedGeoDat(used map[string]bool) storageCleanupResult {
	files := s.unusedGeoDatFiles(used)
	result := storageCleanupResult{}
	for _, file := range files {
		name := strings.TrimSpace(fmt.Sprint(file["name"]))
		path := filepath.Join(s.cfg.GeoDir, filepath.Base(name))
		size := numberAny(file["size"])
		if err := os.Remove(path); err != nil {
			if !os.IsNotExist(err) {
				result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", name, err))
			}
			continue
		}
		result.Deleted++
		result.Freed += size
	}
	return result
}

func (s *serverState) geoDatStats(extra bool) (int64, int) {
	var size int64
	var count int
	for _, file := range s.geoInstalledFiles() {
		role := fmt.Sprint(file["role"])
		if extra && role != "extra" {
			continue
		}
		if !extra && role != "base" {
			continue
		}
		size += numberAny(file["size"])
		count++
	}
	return size, count
}

func (s *serverState) logFilesStats() storagePathStats {
	stats := storagePathStats{}
	seen := map[string]bool{}
	for _, path := range s.configuredLogPaths() {
		for _, candidate := range append([]string{path}, rotatedLogPaths(path, 10)...) {
			clean, err := filepath.Abs(candidate)
			if err != nil || seen[clean] {
				continue
			}
			seen[clean] = true
			info, err := os.Stat(clean)
			if err != nil || info.IsDir() {
				continue
			}
			stats.Size += info.Size()
			stats.Count++
		}
	}
	return stats
}

func pathStats(path string) storagePathStats {
	stats := storagePathStats{}
	if strings.TrimSpace(path) == "" {
		return stats
	}
	_ = filepath.WalkDir(path, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		info, statErr := entry.Info()
		if statErr != nil {
			return nil
		}
		stats.Size += info.Size()
		stats.Count++
		return nil
	})
	return stats
}

func multiPathStats(paths []string) storagePathStats {
	stats := storagePathStats{}
	seen := map[string]bool{}
	for _, path := range paths {
		clean, err := filepath.Abs(path)
		if err != nil || seen[clean] {
			continue
		}
		seen[clean] = true
		item := pathStats(clean)
		stats.Size += item.Size
		stats.Count += item.Count
	}
	return stats
}

func currentExecutableInfo() map[string]any {
	path, err := os.Executable()
	if err != nil {
		return map[string]any{"label": "Бинарник панели", "size": int64(0), "count": 0}
	}
	info, err := os.Stat(path)
	size := int64(0)
	if err == nil && !info.IsDir() {
		size = info.Size()
	}
	return map[string]any{"label": "Бинарник панели", "path": path, "size": size, "count": 1}
}

func appBinaryBackupDir() string {
	path, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Dir(path)
}

func appBinaryBackupPaths() []string {
	dir := appBinaryBackupDir()
	if dir == "" {
		return nil
	}
	names := []string{}
	patterns := []string{
		filepath.Join(dir, "ruopenray-ui.backup-*"),
		filepath.Join(dir, "ruopenray-ui.prev"),
	}
	for _, pattern := range patterns {
		matches, err := filepath.Glob(pattern)
		if err == nil {
			names = append(names, matches...)
		}
	}
	sort.Strings(names)
	return names
}

func appBinaryBackupStats() storagePathStats {
	stats := storagePathStats{}
	for _, path := range appBinaryBackupPaths() {
		info, err := os.Stat(path)
		if err != nil || info.IsDir() {
			continue
		}
		stats.Size += info.Size()
		stats.Count++
	}
	return stats
}

func cleanupAppBinaryBackups() storageCleanupResult {
	result := storageCleanupResult{}
	for _, path := range appBinaryBackupPaths() {
		info, err := os.Stat(path)
		if err != nil {
			if !os.IsNotExist(err) {
				result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", path, err))
			}
			continue
		}
		if info.IsDir() {
			continue
		}
		if err := os.Remove(path); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", path, err))
			continue
		}
		result.Deleted++
		result.Freed += info.Size()
	}
	return result
}

func packageCachePaths() []string {
	return []string{
		"/var/cache/apk",
		"/tmp/apk-cache",
		"/tmp/opkg-lists",
		"/var/opkg-lists",
		"/var/lib/opkg/lists",
		"/opt/var/opkg-lists",
		"/opt/var/cache/opkg",
	}
}

func packageCacheStats() storagePathStats {
	stats := storagePathStats{}
	for _, path := range packageCachePaths() {
		item := pathStats(path)
		stats.Size += item.Size
		stats.Count += item.Count
	}
	return stats
}

func cleanupPackageCache() storageCleanupResult {
	result := storageCleanupResult{}
	for _, path := range packageCachePaths() {
		step := cleanupDirectoryContents(path, false)
		result.Deleted += step.Deleted
		result.Freed += step.Freed
		result.Errors = append(result.Errors, step.Errors...)
	}
	return result
}

func cleanupDirectoryContents(path string, requireExisting bool) storageCleanupResult {
	result := storageCleanupResult{}
	clean, err := filepath.Abs(path)
	if err != nil || unsafeCleanupDir(clean) {
		result.Errors = append(result.Errors, fmt.Sprintf("%s: небезопасный путь", path))
		return result
	}
	entries, err := os.ReadDir(clean)
	if err != nil {
		if os.IsNotExist(err) && !requireExisting {
			return result
		}
		result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", path, err))
		return result
	}
	for _, entry := range entries {
		target := filepath.Join(clean, entry.Name())
		size := pathStats(target).Size
		if !entry.IsDir() {
			if info, statErr := entry.Info(); statErr == nil {
				size = info.Size()
			}
		}
		if err := os.RemoveAll(target); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", target, err))
			continue
		}
		result.Deleted++
		result.Freed += size
	}
	return result
}

func cleanupDirectoryContentsKeepNewest(path string, keep int, requireExisting bool) storageCleanupResult {
	result := storageCleanupResult{}
	clean, err := filepath.Abs(path)
	if err != nil || unsafeCleanupDir(clean) {
		result.Errors = append(result.Errors, fmt.Sprintf("%s: небезопасный путь", path))
		return result
	}
	entries, err := os.ReadDir(clean)
	if err != nil {
		if os.IsNotExist(err) && !requireExisting {
			return result
		}
		result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", path, err))
		return result
	}
	type cleanupEntry struct {
		path    string
		modTime int64
		size    int64
	}
	items := []cleanupEntry{}
	for _, entry := range entries {
		target := filepath.Join(clean, entry.Name())
		info, statErr := entry.Info()
		if statErr != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", target, statErr))
			continue
		}
		size := info.Size()
		if entry.IsDir() {
			size = pathStats(target).Size
		}
		items = append(items, cleanupEntry{path: target, modTime: info.ModTime().UnixNano(), size: size})
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].modTime == items[j].modTime {
			return items[i].path > items[j].path
		}
		return items[i].modTime > items[j].modTime
	})
	if keep < 0 {
		keep = 0
	}
	for index, item := range items {
		if index < keep {
			continue
		}
		if err := os.RemoveAll(item.path); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", item.path, err))
			continue
		}
		result.Deleted++
		result.Freed += item.size
	}
	return result
}

func unsafeCleanupDir(path string) bool {
	path = filepath.Clean(path)
	return path == "." || path == string(os.PathSeparator) || path == filepath.Clean(os.TempDir()) || len(path) < 4
}

func sortedKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func appendStringSlice(value any, items ...string) []string {
	out, _ := value.([]string)
	return append(out, items...)
}

func diskFreeBytes(info map[string]any) (int64, bool) {
	if info == nil || info["ok"] == false {
		return 0, false
	}
	free := numberAny(info["free"])
	return free, free > 0
}
