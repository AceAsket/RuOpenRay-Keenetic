package geodata

import "testing"

func TestCleanSourceID(t *testing.T) {
	tests := map[string]string{
		"RUNET Freedom":       "custom-runet-freedom",
		"custom-my-source":    "custom-my-source",
		"  weird/value 2026 ": "custom-weird-value-2026",
	}
	for input, want := range tests {
		if got := CleanSourceID(input); got != want {
			t.Fatalf("CleanSourceID(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestCleanTarget(t *testing.T) {
	tests := map[string]string{
		"LoyalsoldierSite":        "LoyalsoldierSite.dat",
		"nested/antifilter.dat":   "antifilter.dat",
		`nested\windows-name.dat`: "windows-name.dat",
		"":                        "",
	}
	for input, want := range tests {
		if got := CleanTarget(input); got != want {
			t.Fatalf("CleanTarget(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestCleanFileName(t *testing.T) {
	tests := map[string]string{
		"geoip.dat":               "geoip.dat",
		"nested/geosite.dat":      "geosite.dat",
		`nested\windows-name.dat`: "windows-name.dat",
		"not-dat.txt":             "",
	}
	for input, want := range tests {
		if got := CleanFileName(input); got != want {
			t.Fatalf("CleanFileName(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestNormalizeSourceExtra(t *testing.T) {
	source := NormalizeSource(map[string]any{
		"name":    "Antifilter",
		"kind":    "extra",
		"target":  "community",
		"url":     "https://example.com/community.dat",
		"enabled": true,
	}, 0)
	if source["id"] != "custom-antifilter" || source["kind"] != "extra" || source["target"] != "community.dat" {
		t.Fatalf("unexpected source: %#v", source)
	}
}

func TestNormalizeSourceSeparate(t *testing.T) {
	source := NormalizeSource(map[string]any{
		"name":       "RUNET Freedom",
		"kind":       "separate",
		"target":     "runet",
		"geoipUrl":   "https://example.com/geoip.dat",
		"geositeUrl": "https://example.com/geosite.dat",
	}, 0)
	if source["id"] != "custom-runet-freedom" || source["kind"] != "separate" || source["target"] != "runet.dat" {
		t.Fatalf("unexpected source: %#v", source)
	}
	if source["geoipUrl"] == "" || source["geositeUrl"] == "" {
		t.Fatalf("expected pair urls, got %#v", source)
	}
}
