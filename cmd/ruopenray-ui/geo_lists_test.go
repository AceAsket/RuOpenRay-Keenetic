package main

import (
	"path/filepath"
	"testing"
)

func TestNormalizeGeoUserListDomains(t *testing.T) {
	list := normalizeGeoUserList(geoUserList{
		Name:   "Media",
		Kind:   "domain",
		Target: "proxy",
		Items: []string{
			"example.com",
			"domain(telegram.org) -> proxy",
			"geosite:youtube",
			"regexp:.*\\.example\\.org",
			"https://skip.example/path",
			"example.com",
		},
		Enabled: true,
	}, 0)

	if list.ID != "media" {
		t.Fatalf("unexpected id: %s", list.ID)
	}
	want := []string{"domain:example.com", "domain:telegram.org", "geosite:youtube", "regexp:.*\\.example\\.org"}
	if len(list.Items) != len(want) {
		t.Fatalf("items = %#v, warnings = %#v", list.Items, list.Warnings)
	}
	for i := range want {
		if list.Items[i] != want[i] {
			t.Fatalf("item %d = %q, want %q", i, list.Items[i], want[i])
		}
	}
	if len(list.Warnings) != 1 {
		t.Fatalf("expected one warning, got %#v", list.Warnings)
	}
}

func TestNormalizeGeoUserListIPs(t *testing.T) {
	list := normalizeGeoUserList(geoUserList{
		Name:   "Clients",
		Kind:   "ip",
		Target: "direct",
		Items:  []string{"ip(192.168.1.10) -> direct", "geoip:telegram", "10.0.0.0/8", "bad-ip"},
	}, 0)

	want := []string{"192.168.1.10", "geoip:telegram", "10.0.0.0/8"}
	if len(list.Items) != len(want) {
		t.Fatalf("items = %#v, warnings = %#v", list.Items, list.Warnings)
	}
	for i := range want {
		if list.Items[i] != want[i] {
			t.Fatalf("item %d = %q, want %q", i, list.Items[i], want[i])
		}
	}
	if len(list.Warnings) != 1 {
		t.Fatalf("expected one warning, got %#v", list.Warnings)
	}
}

func TestSaveGeoUserLists(t *testing.T) {
	dir := t.TempDir()
	state := &serverState{cfg: appConfig{DataDir: dir, GeoDir: filepath.Join(dir, "geo"), BackupDir: filepath.Join(dir, "backups")}}
	result := state.saveGeoUserLists(map[string]any{
		"lists": []any{
			map[string]any{"name": "Test", "kind": "domain", "target": "proxy", "items": "ya.ru\nexample.com"},
		},
	})
	if result["ok"] != true {
		t.Fatalf("save failed: %#v", result)
	}
	lists := state.geoUserLists()
	if len(lists) != 1 || len(lists[0].Items) != 2 {
		t.Fatalf("unexpected lists: %#v", lists)
	}
}
