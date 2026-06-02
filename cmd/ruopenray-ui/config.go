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
	Platform     string
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
	platform := normalizePlatform(getenv([]string{"RUOPENRAY_PLATFORM", "OPENRAY_PLATFORM"}, detectPlatform()))
	cfg := appConfig{
		Platform:     platform,
		DataDir:      getenv([]string{"RUOPENRAY_DATA_DIR", "OPENRAY_DATA_DIR"}, defaultDataDir(platform)),
		ServiceName:  getenv([]string{"RUOPENRAY_XRAY_SERVICE", "OPENRAY_XRAY_SERVICE"}, defaultXrayService(platform)),
		GeoDir:       getenv([]string{"RUOPENRAY_GEO_DIR", "OPENRAY_GEO_DIR"}, ""),
		Host:         getenv([]string{"RUOPENRAY_HOST", "OPENRAY_HOST"}, defaultHost(platform)),
		Port:         getenv([]string{"RUOPENRAY_PORT", "OPENRAY_PORT"}, "9090"),
		Password:     getenv([]string{"RUOPENRAY_PASSWORD", "RUOPENRAY_TOKEN", "OPENRAY_PASSWORD", "OPENRAY_TOKEN"}, "admin"),
		ActiveConfig: getenv([]string{"RUOPENRAY_ACTIVE_CONFIG", "OPENRAY_ACTIVE_CONFIG"}, ""),
		ProfilesDir:  getenv([]string{"RUOPENRAY_PROFILES_DIR", "OPENRAY_PROFILES_DIR"}, ""),
		BackupDir:    getenv([]string{"RUOPENRAY_BACKUP_DIR", "OPENRAY_BACKUP_DIR"}, ""),
	}
	if cfg.ActiveConfig == "" {
		cfg.ActiveConfig = defaultActiveConfig(platform, cfg.DataDir)
	}
	if cfg.ProfilesDir == "" {
		cfg.ProfilesDir = filepath.Join(cfg.DataDir, "profiles")
	}
	if cfg.BackupDir == "" {
		cfg.BackupDir = filepath.Join(cfg.DataDir, "backups")
	}
	if cfg.GeoDir == "" {
		cfg.GeoDir = defaultGeoDir(platform)
	}
	return cfg
}

func normalizePlatform(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "keenetic", "entware":
		return "keenetic"
	case "openwrt":
		return "openwrt"
	default:
		return "generic"
	}
}

func detectPlatform() string {
	if _, err := os.Stat("/etc/openwrt_release"); err == nil {
		return "openwrt"
	}
	if _, err := os.Stat("/opt/etc/ndm"); err == nil {
		return "keenetic"
	}
	if _, err := os.Stat("/opt/etc/init.d"); err == nil && commandExists("opkg") {
		return "keenetic"
	}
	return "generic"
}

func defaultHost(platform string) string {
	if platform == "keenetic" || platform == "openwrt" {
		return "0.0.0.0"
	}
	return "127.0.0.1"
}

func defaultDataDir(platform string) string {
	if platform == "keenetic" {
		return "/opt/etc/ruopenray-ui"
	}
	if platform == "openwrt" {
		return "/etc/ruopenray-ui"
	}
	return "data"
}

func defaultActiveConfig(platform, dataDir string) string {
	if platform == "keenetic" {
		return "/opt/etc/xray/configs/99_ruopenray.json"
	}
	return filepath.Join(dataDir, "config.json")
}

func defaultXrayService(platform string) string {
	if platform == "keenetic" {
		return "S99ruopenray-xray"
	}
	return "xray"
}

func defaultGeoDir(platform string) string {
	candidates := []string{"/usr/share/xray", "/usr/local/share/xray"}
	if platform == "keenetic" {
		candidates = []string{"/opt/etc/xray/dat", "/opt/share/xray", "/opt/usr/share/xray"}
	}
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate
		}
	}
	if platform == "keenetic" {
		return "/opt/etc/xray/dat"
	}
	return "/usr/share/xray"
}

func (cfg appConfig) isKeenetic() bool {
	return cfg.Platform == "keenetic"
}

func (cfg appConfig) serviceScript(name string) string {
	if filepath.IsAbs(name) {
		return name
	}
	if cfg.isKeenetic() {
		return filepath.Join("/opt/etc/init.d", name)
	}
	return filepath.Join("/etc/init.d", name)
}

func (cfg appConfig) appServiceScript() string {
	if cfg.isKeenetic() {
		return "/opt/etc/init.d/S99ruopenray-ui"
	}
	return "/etc/init.d/ruopenray-ui"
}

func (cfg appConfig) xrayBinaryPath() string {
	if cfg.isKeenetic() {
		return "/opt/sbin/xray"
	}
	return "/usr/bin/xray"
}

func (cfg appConfig) appBinaryPath() string {
	if cfg.isKeenetic() {
		return "/opt/sbin/ruopenray-ui"
	}
	return "/usr/bin/ruopenray-ui"
}

func (cfg appConfig) crontabPath() string {
	if cfg.isKeenetic() {
		return "/opt/var/spool/cron/crontabs/root"
	}
	return "/etc/crontabs/root"
}

func (cfg appConfig) cronServiceScript() string {
	if cfg.isKeenetic() {
		return "/opt/etc/init.d/S05crond"
	}
	return "/etc/init.d/cron"
}

func (cfg appConfig) coreProcessName() string {
	return "xray"
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
