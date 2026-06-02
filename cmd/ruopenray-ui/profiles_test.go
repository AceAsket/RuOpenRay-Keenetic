package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCleanProfileName(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "adds json extension", in: "default", want: "default.json"},
		{name: "cleans unsafe characters", in: "../My Profile!*", want: "My-Profile-.json"},
		{name: "empty fallback", in: "", want: "profile.json"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := cleanProfileName(tt.in); got != tt.want {
				t.Fatalf("cleanProfileName(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestProfileGetAndDeleteHandlers(t *testing.T) {
	dir := t.TempDir()
	profilesDir := filepath.Join(dir, "profiles")
	if err := os.MkdirAll(profilesDir, 0o755); err != nil {
		t.Fatalf("create profiles dir: %v", err)
	}
	state := &serverState{cfg: appConfig{DataDir: dir, ProfilesDir: profilesDir}}

	saveBody := []byte(`{"name":"custom","config":{"outbounds":[{"tag":"proxy"}]}}`)
	saveReq := httptest.NewRequest(http.MethodPost, "/api/profiles", bytes.NewReader(saveBody))
	saveRec := httptest.NewRecorder()
	state.saveProfile(saveRec, saveReq)
	if saveRec.Code != http.StatusOK {
		t.Fatalf("saveProfile status = %d, body %s", saveRec.Code, saveRec.Body.String())
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/profiles/get?name=custom", nil)
	getRec := httptest.NewRecorder()
	state.getProfile(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("getProfile status = %d, body %s", getRec.Code, getRec.Body.String())
	}
	var got struct {
		Name   string         `json:"name"`
		Config map[string]any `json:"config"`
	}
	if err := json.Unmarshal(getRec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode getProfile response: %v", err)
	}
	if got.Name != "custom" || got.Config["outbounds"] == nil {
		t.Fatalf("unexpected profile response: %#v", got)
	}

	deleteReq := httptest.NewRequest(http.MethodPost, "/api/profiles/delete", bytes.NewReader([]byte(`{"name":"custom"}`)))
	deleteRec := httptest.NewRecorder()
	state.deleteProfile(deleteRec, deleteReq)
	if deleteRec.Code != http.StatusOK {
		t.Fatalf("deleteProfile status = %d, body %s", deleteRec.Code, deleteRec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(profilesDir, "custom.json")); !os.IsNotExist(err) {
		t.Fatalf("profile file still exists after delete: %v", err)
	}
}

func TestActiveProfileMarkerSurvivesConfigDrift(t *testing.T) {
	dir := t.TempDir()
	profilesDir := filepath.Join(dir, "profiles")
	if err := os.MkdirAll(profilesDir, 0o755); err != nil {
		t.Fatalf("create profiles dir: %v", err)
	}
	active := filepath.Join(dir, "config.json")
	if err := os.WriteFile(active, []byte(`{"routing":{"rules":[{"outboundTag":"proxy"}]}}`), 0o600); err != nil {
		t.Fatalf("write active config: %v", err)
	}
	if err := os.WriteFile(filepath.Join(profilesDir, "default.json"), []byte(`{"routing":{"rules":[]}}`), 0o600); err != nil {
		t.Fatalf("write default profile: %v", err)
	}
	state := &serverState{cfg: appConfig{DataDir: dir, ProfilesDir: profilesDir, ActiveConfig: active}}
	if err := state.writeActiveProfileName("default"); err != nil {
		t.Fatalf("write active profile marker: %v", err)
	}

	profiles, err := state.listProfiles()
	if err != nil {
		t.Fatalf("listProfiles returned error: %v", err)
	}
	if len(profiles) != 1 || !profiles[0].Active || profiles[0].Name != "default" {
		t.Fatalf("profiles = %#v, want default active by marker", profiles)
	}
}

func TestSyncCurrentProfileUpdatesMarkedProfile(t *testing.T) {
	dir := t.TempDir()
	profilesDir := filepath.Join(dir, "profiles")
	if err := os.MkdirAll(profilesDir, 0o755); err != nil {
		t.Fatalf("create profiles dir: %v", err)
	}
	active := filepath.Join(dir, "config.json")
	state := &serverState{cfg: appConfig{DataDir: dir, ProfilesDir: profilesDir, ActiveConfig: active}}
	if _, err := state.saveProfileConfig("default", map[string]any{"outbounds": []any{}}); err != nil {
		t.Fatalf("save default profile: %v", err)
	}

	name, err := state.syncCurrentProfile(map[string]any{"outbounds": []any{map[string]any{"tag": "proxy"}}})
	if err != nil {
		t.Fatalf("syncCurrentProfile returned error: %v", err)
	}
	if name != "default" {
		t.Fatalf("syncCurrentProfile name = %q, want default", name)
	}
	body, err := os.ReadFile(filepath.Join(profilesDir, "default.json"))
	if err != nil {
		t.Fatalf("read default profile: %v", err)
	}
	if !bytes.Contains(body, []byte(`"proxy"`)) {
		t.Fatalf("default profile was not updated: %s", string(body))
	}
	if got := state.readActiveProfileName(); got != "default" {
		t.Fatalf("active profile marker = %q, want default", got)
	}
}

func TestOutboundTagFallback(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{in: "outbound:cloud one!", want: "cloud-one"},
		{in: "balancer:auto:ru", want: "auto:ru"},
		{in: "<nil>", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			if got := outboundTagFallback(tt.in); got != tt.want {
				t.Fatalf("outboundTagFallback(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestProfileNameFallback(t *testing.T) {
	if got := profileNameFallback("", " <nil> ", "subscription client"); got != "subscription client" {
		t.Fatalf("profileNameFallback skipped invalid values incorrectly: %q", got)
	}
	if got := profileNameFallback("", "undefined", "null"); got != "profile" {
		t.Fatalf("profileNameFallback empty fallback = %q, want profile", got)
	}
}

func TestProfileNameFromURL(t *testing.T) {
	tests := []struct {
		raw  string
		want string
	}{
		{raw: "https://example.com/sub/path.txt", want: "path"},
		{raw: "https://sub.example.com/", want: "sub"},
	}
	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			if got := profileNameFromURL(tt.raw); got != tt.want {
				t.Fatalf("profileNameFromURL(%q) = %q, want %q", tt.raw, got, tt.want)
			}
		})
	}
}

func TestSubscriptionLinksUsesBasicAuthFromURL(t *testing.T) {
	wantAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("user:secret"))
	gotAuth := ""
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		_, _ = w.Write([]byte("vless://client@example.com:443?security=reality#client"))
	}))
	defer server.Close()

	rawURL := "http://user:secret@" + strings.TrimPrefix(server.URL, "http://")
	links, err := subscriptionLinks(rawURL)
	if err != nil {
		t.Fatalf("subscriptionLinks returned error: %v", err)
	}
	if gotAuth != wantAuth {
		t.Fatalf("Authorization = %q, want %q", gotAuth, wantAuth)
	}
	if len(links) != 1 {
		t.Fatalf("links = %d, want 1", len(links))
	}
}

func TestListProfilesReturnsEmptyArray(t *testing.T) {
	dir := t.TempDir()
	profilesDir := filepath.Join(dir, "profiles")
	if err := os.MkdirAll(profilesDir, 0o755); err != nil {
		t.Fatalf("create profiles dir: %v", err)
	}
	active := filepath.Join(dir, "config.json")
	if err := os.WriteFile(active, []byte(`{"outbounds":[]}`), 0o600); err != nil {
		t.Fatalf("write active config: %v", err)
	}
	state := &serverState{cfg: appConfig{ProfilesDir: profilesDir, ActiveConfig: active}}
	profiles, err := state.listProfiles()
	if err != nil {
		t.Fatalf("listProfiles returned error: %v", err)
	}
	if profiles == nil {
		t.Fatal("listProfiles returned nil slice, want empty slice for JSON []")
	}
	if len(profiles) != 0 {
		t.Fatalf("listProfiles returned %d profiles, want 0", len(profiles))
	}
}
