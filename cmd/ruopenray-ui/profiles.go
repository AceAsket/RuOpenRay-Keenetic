package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	rproxy "github.com/AceAsket/RuOpenRay-Keenetic/internal/proxy"
)

type profileInfo struct {
	Name      string `json:"name"`
	File      string `json:"file"`
	Size      int64  `json:"size"`
	UpdatedAt string `json:"updatedAt"`
	Active    bool   `json:"active"`
}

func (s *serverState) activeProfilePath() string {
	return filepath.Join(s.cfg.DataDir, "active-profile")
}

func (s *serverState) normalizeProfileID(name string) string {
	return strings.TrimSuffix(cleanProfileName(name), ".json")
}

func (s *serverState) readActiveProfileName() string {
	body, err := os.ReadFile(s.activeProfilePath())
	if err != nil {
		return ""
	}
	name := s.normalizeProfileID(string(body))
	if name == "" || name == "profile" {
		return ""
	}
	if _, err := os.Stat(s.profilePath(name)); err != nil {
		return ""
	}
	return name
}

func (s *serverState) writeActiveProfileName(name string) error {
	clean := s.normalizeProfileID(name)
	if clean == "" || clean == "profile" {
		clean = "default"
	}
	if err := os.MkdirAll(s.cfg.DataDir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(s.activeProfilePath(), []byte(clean+"\n"), 0o600)
}

func (s *serverState) listProfiles() ([]profileInfo, error) {
	activeBody, _ := os.ReadFile(s.cfg.ActiveConfig)
	activeName := s.readActiveProfileName()
	entries, err := os.ReadDir(s.cfg.ProfilesDir)
	if err != nil {
		return nil, err
	}
	profiles := []profileInfo{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		path := filepath.Join(s.cfg.ProfilesDir, entry.Name())
		info, err := entry.Info()
		if err != nil {
			continue
		}
		body, _ := os.ReadFile(path)
		name := strings.TrimSuffix(entry.Name(), ".json")
		active := name == activeName
		if activeName == "" {
			active = bytes.Equal(bytes.TrimSpace(body), bytes.TrimSpace(activeBody))
		}
		profiles = append(profiles, profileInfo{
			Name: name, File: entry.Name(), Size: info.Size(),
			UpdatedAt: info.ModTime().Format(time.RFC3339), Active: active,
		})
	}
	sort.Slice(profiles, func(i, j int) bool {
		if profiles[i].Active != profiles[j].Active {
			return profiles[i].Active
		}
		return profiles[i].Name < profiles[j].Name
	})
	return profiles, nil
}

func cleanProfileName(name string) string {
	re := regexp.MustCompile(`[^a-zA-Z0-9._-]+`)
	base := filepath.Base(strings.TrimSpace(name))
	if base == "." {
		base = ""
	}
	clean := re.ReplaceAllString(base, "-")
	if clean == "" {
		clean = "profile"
	}
	if !strings.HasSuffix(clean, ".json") {
		clean += ".json"
	}
	return clean
}

func profileNameFallback(values ...string) string {
	for _, value := range values {
		clean := strings.TrimSpace(value)
		if clean != "" && clean != "<nil>" && clean != "undefined" && clean != "null" {
			return clean
		}
	}
	return "profile"
}

func outboundTagFallback(value string) string {
	clean := strings.TrimSpace(value)
	if clean == "" || clean == "<nil>" || clean == "undefined" || clean == "null" {
		return ""
	}
	clean = strings.TrimPrefix(clean, "outbound:")
	clean = strings.TrimPrefix(clean, "balancer:")
	clean = regexp.MustCompile(`[^A-Za-z0-9._:-]+`).ReplaceAllString(clean, "-")
	clean = strings.Trim(clean, "-_.:")
	if len(clean) > 96 {
		clean = clean[:96]
	}
	return clean
}

func profileNameFromURL(rawURL string) string {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return ""
	}
	base := path.Base(parsed.Path)
	if base != "." && base != "/" {
		base = strings.TrimSuffix(base, path.Ext(base))
		if strings.TrimSpace(base) != "" {
			return base
		}
	}
	host := strings.TrimPrefix(parsed.Hostname(), "www.")
	if host == "" {
		return ""
	}
	return strings.Split(host, ".")[0]
}

func (s *serverState) profilePath(name string) string {
	return filepath.Join(s.cfg.ProfilesDir, cleanProfileName(name))
}

func (s *serverState) currentProfileName() string {
	if name := s.readActiveProfileName(); name != "" {
		return name
	}
	activeBody, _ := os.ReadFile(s.cfg.ActiveConfig)
	if entries, err := os.ReadDir(s.cfg.ProfilesDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
				continue
			}
			body, err := os.ReadFile(filepath.Join(s.cfg.ProfilesDir, entry.Name()))
			if err == nil && bytes.Equal(bytes.TrimSpace(body), bytes.TrimSpace(activeBody)) {
				return strings.TrimSuffix(entry.Name(), ".json")
			}
		}
	}
	return "default"
}

func (s *serverState) saveProfileConfig(name string, cfg map[string]any) (string, error) {
	body, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return "", err
	}
	path := s.profilePath(name)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(path, body, 0o600); err != nil {
		return "", err
	}
	return strings.TrimSuffix(filepath.Base(path), ".json"), nil
}

func (s *serverState) syncCurrentProfile(cfg map[string]any) (string, error) {
	name := s.currentProfileName()
	savedName, err := s.saveProfileConfig(name, cfg)
	if err != nil {
		return "", err
	}
	if err := s.writeActiveProfileName(savedName); err != nil {
		return "", err
	}
	return savedName, nil
}

func (s *serverState) saveProfile(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	name := fmt.Sprint(payload["name"])
	cfg, ok := payload["config"].(map[string]any)
	if !ok {
		cfg, _ = s.readActiveConfig()
	}
	savedName, err := s.saveProfileConfig(name, cfg)
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "profile": savedName})
}

func (s *serverState) getProfile(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	body, err := os.ReadFile(s.profilePath(name))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "profile not found"})
		return
	}
	var cfg any
	if err := json.Unmarshal(body, &cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{
		"ok":      true,
		"name":    strings.TrimSuffix(cleanProfileName(name), ".json"),
		"config":  cfg,
		"updated": time.Now().Format(time.RFC3339),
	})
}

func (s *serverState) deleteProfile(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	name := fmt.Sprint(payload["name"])
	path := s.profilePath(name)
	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "profile not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "profile": strings.TrimSuffix(filepath.Base(path), ".json")})
}

func (s *serverState) activateProfile(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	body, err := os.ReadFile(s.profilePath(fmt.Sprint(payload["name"])))
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	err = os.WriteFile(s.cfg.ActiveConfig, body, 0o600)
	if err == nil {
		err = s.writeActiveProfileName(fmt.Sprint(payload["name"]))
	}
	respond(w, map[string]any{"ok": true, "active": s.normalizeProfileID(fmt.Sprint(payload["name"]))}, err)
}

func (s *serverState) importLink(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	outbound, err := rproxy.ParseShareLink(fmt.Sprint(payload["link"]))
	if err != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if tag := outboundTagFallback(fmt.Sprint(payload["outboundTag"])); tag != "" {
		outbound["tag"] = tag
	}
	cfg, _ := s.readActiveConfig()
	outbounds := removeOutboundByTag(asArray(cfg["outbounds"]), fmt.Sprint(outbound["tag"]))
	cfg["outbounds"] = append([]any{outbound}, outbounds...)
	name := profileNameFallback(fmt.Sprint(payload["profileName"]), fmt.Sprint(outbound["tag"]), "server")
	body, _ := json.MarshalIndent(cfg, "", "  ")
	path := s.profilePath(name)
	if err := os.WriteFile(path, body, 0o600); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "outbound": outbound, "profile": strings.TrimSuffix(filepath.Base(path), ".json")})
}

func subscriptionLinks(rawURL string) ([]string, error) {
	rawURL = strings.TrimSpace(rawURL)
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	user := parsed.User
	if user != nil {
		parsed.User = nil
	}
	req, err := http.NewRequest(http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, err
	}
	if user != nil {
		username := user.Username()
		password, _ := user.Password()
		req.SetBasicAuth(username, password)
	}
	client := &http.Client{Timeout: 12 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("subscription HTTP %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	return rproxy.DecodeSubscription(string(body)), nil
}

func (s *serverState) importPreview(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	if rawURL := strings.TrimSpace(fmt.Sprint(payload["url"])); rawURL != "" && rawURL != "<nil>" {
		links, err := subscriptionLinks(rawURL)
		if err != nil {
			writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		var items []map[string]any
		var outbounds []map[string]any
		for _, link := range links {
			outbound, err := rproxy.ParseShareLink(link)
			if err == nil {
				items = append(items, rproxy.OutboundSummary(outbound))
				outbounds = append(outbounds, outbound)
			}
		}
		writeJSON(w, 200, map[string]any{"ok": true, "source": "subscription", "links": len(links), "items": items, "outbounds": outbounds})
		return
	}
	outbound, err := rproxy.ParseShareLink(fmt.Sprint(payload["link"]))
	if err != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if tag := outboundTagFallback(fmt.Sprint(payload["outboundTag"])); tag != "" {
		outbound["tag"] = tag
	}
	writeJSON(w, 200, map[string]any{"ok": true, "source": "link", "links": 1, "items": []any{rproxy.OutboundSummary(outbound)}, "outbound": outbound})
}

func (s *serverState) importSubscription(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	links, err := subscriptionLinks(fmt.Sprint(payload["url"]))
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	cfg, _ := s.readActiveConfig()
	outbounds := asArray(cfg["outbounds"])
	var imported []map[string]any
	for _, link := range links {
		outbound, err := rproxy.ParseShareLink(link)
		if err != nil {
			continue
		}
		outbounds = removeOutboundByTag(outbounds, fmt.Sprint(outbound["tag"]))
		outbounds = append([]any{outbound}, outbounds...)
		imported = append(imported, rproxy.OutboundSummary(outbound))
	}
	if len(imported) == 0 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "В подписке не найдены поддерживаемые ссылки"})
		return
	}
	cfg["outbounds"] = outbounds
	name := profileNameFallback(fmt.Sprint(payload["profileName"]), fmt.Sprint(imported[0]["tag"]), profileNameFromURL(fmt.Sprint(payload["url"])), "subscription")
	body, _ := json.MarshalIndent(cfg, "", "  ")
	path := s.profilePath(name)
	if err := os.WriteFile(path, body, 0o600); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "profile": strings.TrimSuffix(filepath.Base(path), ".json"), "imported": imported})
}

func asArray(value any) []any {
	items, _ := value.([]any)
	return items
}

func removeOutboundByTag(items []any, tag string) []any {
	var result []any
	for _, item := range items {
		object, ok := item.(map[string]any)
		if !ok || fmt.Sprint(object["tag"]) != tag {
			result = append(result, item)
		}
	}
	return result
}
