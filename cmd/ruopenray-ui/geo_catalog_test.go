package main

import "testing"

func TestParseGeoSiteCatalog(t *testing.T) {
	body := protoMessage(1, protoRawMessage(
		protoStringField(1, "telegram"),
		protoMessage(2, protoRawMessage(protoVarintField(1, 2), protoStringField(2, "telegram.org"))),
		protoMessage(2, protoRawMessage(protoVarintField(1, 3), protoStringField(2, "t.me"))),
		protoMessage(2, protoRawMessage(protoVarintField(1, 1), protoStringField(2, ".*\\.telegram\\.org"))),
	))

	catalog := parseGeoSiteCatalog(body, "", geoCatalogItemLimit)
	if !catalog.OK || len(catalog.Categories) != 1 {
		t.Fatalf("unexpected catalog: %#v", catalog)
	}
	if catalog.Categories[0].Code != "telegram" || catalog.Categories[0].Count != 3 {
		t.Fatalf("unexpected category: %#v", catalog.Categories[0])
	}

	items := parseGeoSiteCatalog(body, "telegram", geoCatalogItemLimit)
	want := []string{"domain:telegram.org", "full:t.me", "regexp:.*\\.telegram\\.org"}
	if len(items.Items) != len(want) {
		t.Fatalf("items = %#v", items.Items)
	}
	for i := range want {
		if items.Items[i] != want[i] {
			t.Fatalf("item %d = %q, want %q", i, items.Items[i], want[i])
		}
	}
}

func TestParseGeoIPCatalog(t *testing.T) {
	body := protoMessage(1, protoRawMessage(
		protoStringField(1, "private"),
		protoMessage(2, protoRawMessage(protoBytesField(1, []byte{10, 0, 0, 0}), protoVarintField(2, 8))),
		protoMessage(2, protoRawMessage(protoBytesField(1, []byte{192, 168, 0, 0}), protoVarintField(2, 16))),
	))

	catalog := parseGeoIPCatalog(body, "", geoCatalogItemLimit)
	if !catalog.OK || len(catalog.Categories) != 1 {
		t.Fatalf("unexpected catalog: %#v", catalog)
	}
	if catalog.Categories[0].Code != "private" || catalog.Categories[0].Count != 2 {
		t.Fatalf("unexpected category: %#v", catalog.Categories[0])
	}

	items := parseGeoIPCatalog(body, "private", geoCatalogItemLimit)
	want := []string{"10.0.0.0/8", "192.168.0.0/16"}
	if len(items.Items) != len(want) {
		t.Fatalf("items = %#v", items.Items)
	}
	for i := range want {
		if items.Items[i] != want[i] {
			t.Fatalf("item %d = %q, want %q", i, items.Items[i], want[i])
		}
	}
}

func TestReplaceGeoSiteCategory(t *testing.T) {
	body := protoMessage(1, protoRawMessage(
		protoStringField(1, "telegram"),
		protoMessage(2, protoRawMessage(protoVarintField(1, 2), protoStringField(2, "telegram.org"))),
	))
	category, normalized, err := buildGeoSiteCategory("telegram", []string{"example.com", "full:t.me", "regexp:.*\\.telegram\\.org"})
	if err != nil {
		t.Fatalf("buildGeoSiteCategory: %v", err)
	}
	if len(normalized) != 3 {
		t.Fatalf("normalized = %#v", normalized)
	}
	next, replaced, err := replaceGeoCategory(body, "geosite", "telegram", category)
	if err != nil {
		t.Fatalf("replaceGeoCategory: %v", err)
	}
	if !replaced {
		t.Fatal("expected category replacement")
	}
	items := parseGeoSiteCatalog(next, "telegram", geoCatalogItemLimit)
	want := []string{"domain:example.com", "full:t.me", "regexp:.*\\.telegram\\.org"}
	if len(items.Items) != len(want) {
		t.Fatalf("items = %#v", items.Items)
	}
	for i := range want {
		if items.Items[i] != want[i] {
			t.Fatalf("item %d = %q, want %q", i, items.Items[i], want[i])
		}
	}
}

func TestReplaceGeoIPCategory(t *testing.T) {
	body := protoMessage(1, protoRawMessage(
		protoStringField(1, "private"),
		protoMessage(2, protoRawMessage(protoBytesField(1, []byte{10, 0, 0, 0}), protoVarintField(2, 8))),
	))
	category, normalized, err := buildGeoIPCategory("private", []string{"192.168.0.0/16", "10.0.0.1"})
	if err != nil {
		t.Fatalf("buildGeoIPCategory: %v", err)
	}
	if len(normalized) != 2 {
		t.Fatalf("normalized = %#v", normalized)
	}
	next, replaced, err := replaceGeoCategory(body, "geoip", "private", category)
	if err != nil {
		t.Fatalf("replaceGeoCategory: %v", err)
	}
	if !replaced {
		t.Fatal("expected category replacement")
	}
	items := parseGeoIPCatalog(next, "private", geoCatalogItemLimit)
	want := []string{"192.168.0.0/16", "10.0.0.1/32"}
	if len(items.Items) != len(want) {
		t.Fatalf("items = %#v", items.Items)
	}
	for i := range want {
		if items.Items[i] != want[i] {
			t.Fatalf("item %d = %q, want %q", i, items.Items[i], want[i])
		}
	}
}

func protoRawMessage(parts ...[]byte) []byte {
	body := []byte{}
	for _, part := range parts {
		body = append(body, part...)
	}
	return body
}

func protoMessage(field int, body []byte) []byte {
	return append(append(protoTag(field, 2), protoVarint(uint64(len(body)))...), body...)
}

func protoStringField(field int, value string) []byte {
	return protoBytesField(field, []byte(value))
}

func protoBytesField(field int, value []byte) []byte {
	return append(append(protoTag(field, 2), protoVarint(uint64(len(value)))...), value...)
}

func protoVarintField(field int, value uint64) []byte {
	return append(protoTag(field, 0), protoVarint(value)...)
}

func protoVarint(value uint64) []byte {
	out := []byte{}
	for value >= 0x80 {
		out = append(out, byte(value)|0x80)
		value >>= 7
	}
	return append(out, byte(value))
}

func protoTag(field int, wire int) []byte {
	return protoVarint(uint64(field<<3 | wire))
}
