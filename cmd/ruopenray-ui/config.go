package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	rsystem "github.com/AceAsket/RuOpenRay-Keenetic/internal/system"
)

type appConfig struct {
	DataDir      string
	ProfilesDir  string
	BackupDir    string
	ActiveConfig string
	ServiceName  string
	GeoDir       string
	Host         string
	Port         string
	Password     string
}

type serverState struct {
	cfg              appConfig
	sessionsMu       sync.RWMutex
	sessions         map[string]bool
	started          time.Time
	systemSampler    *rsystem.Sampler
	metricsMu        sync.Mutex
	prevXrayStats    map[string]uint64
	prevXrayStatsAt  time.Time
	coreVersionCache map[string]any
	coreVersionAt    time.Time
	serviceCache     map[string]any
	serviceAt        time.Time
	xrayStatsCache   map[string]any
	xrayStatsAt      time.Time
	logCacheKey      string
	logCacheText     string
	logCacheAt       time.Time
	fallbackMu       sync.Mutex
	fallbackProgress map[string]any
}

func (s *serverState) addSession(token string) {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()
	if s.sessions == nil {
		s.sessions = map[string]bool{}
	}
	s.sessions[token] = true
}

func (s *serverState) hasSession(token string) bool {
	s.sessionsMu.RLock()
	defer s.sessionsMu.RUnlock()
	return s.sessions != nil && s.sessions[token]
}

func (s *serverState) clearSessions() {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()
	s.sessions = map[string]bool{}
}

func (s *serverState) sessionCount() int {
	s.sessionsMu.RLock()
	defer s.sessionsMu.RUnlock()
	return len(s.sessions)
}

func getenv(names []string, fallback string) string {
	for _, name := range names {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return fallback
}

func loadAppConfig() appConfig {
	cfg := appConfig{
		DataDir:      getenv([]string{"RUOPENRAY_DATA_DIR", "OPENRAY_DATA_DIR"}, "data"),
		ServiceName:  getenv([]string{"RUOPENRAY_XRAY_SERVICE", "OPENRAY_XRAY_SERVICE"}, "xray"),
		GeoDir:       getenv([]string{"RUOPENRAY_GEO_DIR", "OPENRAY_GEO_DIR"}, ""),
		Host:         getenv([]string{"RUOPENRAY_HOST", "OPENRAY_HOST"}, "127.0.0.1"),
		Port:         getenv([]string{"RUOPENRAY_PORT", "OPENRAY_PORT"}, "9090"),
		Password:     getenv([]string{"RUOPENRAY_PASSWORD", "RUOPENRAY_TOKEN", "OPENRAY_PASSWORD", "OPENRAY_TOKEN"}, "admin"),
		ActiveConfig: getenv([]string{"RUOPENRAY_ACTIVE_CONFIG", "OPENRAY_ACTIVE_CONFIG"}, ""),
		ProfilesDir:  getenv([]string{"RUOPENRAY_PROFILES_DIR", "OPENRAY_PROFILES_DIR"}, ""),
		BackupDir:    getenv([]string{"RUOPENRAY_BACKUP_DIR", "OPENRAY_BACKUP_DIR"}, ""),
	}
	if cfg.ActiveConfig == "" {
		cfg.ActiveConfig = filepath.Join(cfg.DataDir, "config.json")
	}
	if cfg.ProfilesDir == "" {
		cfg.ProfilesDir = filepath.Join(cfg.DataDir, "profiles")
	}
	if cfg.BackupDir == "" {
		cfg.BackupDir = filepath.Join(cfg.DataDir, "backups")
	}
	if cfg.GeoDir == "" {
		cfg.GeoDir = defaultGeoDir()
	}
	return cfg
}

func defaultGeoDir() string {
	for _, candidate := range []string{"/usr/share/xray", "/usr/local/share/xray"} {
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate
		}
	}
	return "/usr/share/xray"
}

func (s *serverState) ensureData() error {
	if err := os.MkdirAll(s.cfg.ProfilesDir, 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(s.cfg.BackupDir, 0o755); err != nil {
		return err
	}
	if _, err := os.Stat(s.cfg.ActiveConfig); err == nil {
		return s.prepareActiveLogFiles()
	}
	if err := os.MkdirAll(filepath.Dir(s.cfg.ActiveConfig), 0o755); err != nil {
		return err
	}
	body, _ := json.MarshalIndent(defaultConfig(), "", "  ")
	if err := os.WriteFile(s.cfg.ActiveConfig, body, 0o600); err != nil {
		return err
	}
	if err := s.prepareActiveLogFiles(); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(s.cfg.ProfilesDir, "default.json"), body, 0o600); err != nil {
		return err
	}
	return s.writeActiveProfileName("default")
}

func defaultConfig() map[string]any {
	return map[string]any{
		"log": map[string]any{"loglevel": "warning"},
		"inbounds": []any{map[string]any{
			"tag": "socks-in", "port": 10808, "listen": "127.0.0.1", "protocol": "socks",
			"settings": map[string]any{"udp": true},
		}},
		"outbounds": []any{
			map[string]any{"tag": "direct", "protocol": "freedom"},
			map[string]any{"tag": "block", "protocol": "blackhole"},
		},
		"routing": map[string]any{"domainStrategy": "AsIs", "rules": []any{}},
	}
}
