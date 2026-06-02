package main

import (
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestGeoUploadTargetStandardFiles(t *testing.T) {
	for target, want := range map[string]string{
		"":        "geosite.dat",
		"geosite": "geosite.dat",
		"geoip":   "geoip.dat",
	} {
		req := httptest.NewRequest("POST", "/api/geo/upload", strings.NewReader(""))
		req.PostForm = url.Values{"target": {target}}
		req.Form = req.PostForm
		got, err := geoUploadTarget(req, "ignored.dat")
		if err != nil {
			t.Fatalf("unexpected error for %q: %v", target, err)
		}
		if got != want {
			t.Fatalf("target %q: got %q, want %q", target, got, want)
		}
	}
}

func TestGeoUploadTargetCustomFile(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/geo/upload", strings.NewReader(""))
	req.PostForm = url.Values{"target": {"custom"}, "name": {"nested/custom-list"}}
	req.Form = req.PostForm
	got, err := geoUploadTarget(req, "fallback.dat")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "custom-list.dat" {
		t.Fatalf("got %q", got)
	}
}

func TestGeoUploadTargetRejectsBaseForCustom(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/geo/upload", strings.NewReader(""))
	req.PostForm = url.Values{"target": {"custom"}, "name": {"geoip.dat"}}
	req.Form = req.PostForm
	if _, err := geoUploadTarget(req, "geoip.dat"); err == nil {
		t.Fatal("expected error for custom geoip.dat target")
	}
}
