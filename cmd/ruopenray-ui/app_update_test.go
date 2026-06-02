package main

import "testing"

func TestNewerAppReleasePrefersHighestKeeneticTag(t *testing.T) {
	current := map[string]any{"tag": "v0.1.0-keenetic.9", "publishedAt": "2026-06-02T11:00:06Z"}
	candidate := map[string]any{"tag": "v0.1.0-keenetic.16", "publishedAt": "2026-06-02T10:00:06Z"}

	if !newerAppRelease(candidate, current) {
		t.Fatalf("expected %s to be newer than %s", candidate["tag"], current["tag"])
	}
}

func TestAppReleaseRankRejectsNonKeeneticTag(t *testing.T) {
	if _, ok := appReleaseRank("v0.1.0"); ok {
		t.Fatalf("non-Keenetic tag should not produce a rank")
	}
}
