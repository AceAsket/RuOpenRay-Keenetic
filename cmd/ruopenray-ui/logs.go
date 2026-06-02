package main

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/AceAsket/RuOpenRay-Keenetic/internal/logview"
)

func (s *serverState) readLogs(query url.Values) string {
	key := query.Encode()
	now := time.Now()
	s.metricsMu.Lock()
	if key == s.logCacheKey && now.Sub(s.logCacheAt) < 5*time.Second {
		text := s.logCacheText
		s.metricsMu.Unlock()
		return text
	}
	s.metricsMu.Unlock()

	text := s.readLogsUncached(query)
	s.metricsMu.Lock()
	s.logCacheKey = key
	s.logCacheText = text
	s.logCacheAt = time.Now()
	s.metricsMu.Unlock()
	return text
}

func (s *serverState) readLogsUncached(query url.Values) string {
	kind := firstNonEmpty(query.Get("kind"), "error")
	search := strings.ToLower(strings.TrimSpace(query.Get("q")))
	level := strings.ToLower(strings.TrimSpace(query.Get("level")))
	sortOrder := strings.ToLower(strings.TrimSpace(firstNonEmpty(query.Get("sort"), "asc")))
	limit := number(firstNonEmpty(query.Get("lines"), "240"), 240)
	if limit < 20 {
		limit = 20
	}
	if limit > 2000 {
		limit = 2000
	}
	maxLines := limit * 4
	if maxLines < 320 {
		maxLines = 320
	}
	if search != "" {
		maxLines = limit * 8
	}
	if maxLines > 3000 {
		maxLines = 3000
	}
	paths := []string{}
	var blocks []string
	if runtime.GOOS != "windows" && (kind == "system" || kind == "all") {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		output, err := exec.CommandContext(ctx, "logread", "-e", "xray").Output()
		cancel()
		if err == nil && len(output) > 0 {
			if kind == "system" {
				return filterLogLines(string(output), search, level, sortOrder, limit)
			}
			blocks = append(blocks, logview.LastLines(string(output), maxLines))
		}
	}
	if kind == "access" || kind == "all" {
		settings := s.loggingSettings()
		paths = append(paths, s.normalizeManagedLogPath(fmt.Sprint(settings["accessPath"]), s.defaultAccessLogPath()), s.defaultAccessLogPath(), legacyAccessLogPath, filepath.Join(s.cfg.DataDir, "access.log"))
		paths = append(paths, xrayDeletedLogFDPaths("access.log")...)
	}
	if kind == "error" || kind == "all" || kind == "system" {
		settings := s.loggingSettings()
		paths = append(paths, s.normalizeManagedLogPath(fmt.Sprint(settings["errorPath"]), s.defaultErrorLogPath()), s.defaultErrorLogPath(), legacyErrorLogPath, filepath.Join(s.cfg.DataDir, "error.log"))
		paths = append(paths, xrayDeletedLogFDPaths("error.log")...)
	}
	seen := map[string]bool{}
	for _, path := range paths {
		if seen[path] {
			continue
		}
		seen[path] = true
		body, err := logview.TailFile(path, maxLines)
		if err == nil && strings.TrimSpace(body) != "" {
			blocks = append(blocks, body)
		}
	}
	if len(blocks) == 0 {
		return emptyLogMessage(kind)
	}
	return filterLogLines(strings.Join(blocks, "\n"), search, level, sortOrder, limit)
}

func emptyLogMessage(kind string) string {
	switch kind {
	case "access":
		return "Access-лог Xray пока пуст. Откройте сайт через LAN-клиент или проверьте, что access-логирование включено."
	case "error":
		return "Error-лог Xray пока пуст. Ошибок запуска или работы сейчас нет."
	case "system":
		return "Системный лог Xray пока пуст. Проверьте, запущен ли сервис Xray."
	default:
		return "Live-Xray лог пока пуст. Откройте сайт через LAN-клиент или включите access/error-логирование Xray."
	}
}

func readLogTailLines(path string, maxLines int) (string, error) {
	return logview.TailFile(path, maxLines)
}

func xrayDeletedLogFDPaths(name string) []string {
	if runtime.GOOS == "windows" {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	output, err := exec.CommandContext(ctx, "pidof", "xray").Output()
	cancel()
	if err != nil {
		return nil
	}
	paths := []string{}
	for _, pid := range strings.Fields(string(output)) {
		fdDir := filepath.Join("/proc", pid, "fd")
		entries, err := os.ReadDir(fdDir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			fdPath := filepath.Join(fdDir, entry.Name())
			target, err := os.Readlink(fdPath)
			if err != nil {
				continue
			}
			if strings.Contains(target, name) && strings.Contains(target, "(deleted)") {
				paths = append(paths, fdPath)
			}
		}
	}
	return paths
}

func lastLines(text string, maxLines int) string {
	return logview.LastLines(text, maxLines)
}

func filterLogLines(content, search, level, sortOrder string, limit int) string {
	return logview.FilterLines(content, logview.FilterOptions{
		Search:       search,
		Level:        level,
		Sort:         sortOrder,
		Limit:        limit,
		EmptyMessage: "По выбранным фильтрам строки не найдены.",
	})
}

func parseLogLineTime(line string) int64 {
	return logview.ParseLineTime(line)
}
