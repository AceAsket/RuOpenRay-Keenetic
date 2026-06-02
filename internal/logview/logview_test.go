package logview

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFilterLinesSortsByTimeAscendingAfterLimit(t *testing.T) {
	content := strings.Join([]string{
		"2026/01/01 10:00:00 [Info] first",
		"2026/01/01 10:00:02 [Info] newest",
		"2026/01/01 10:00:01 [Info] middle",
	}, "\n")
	got := FilterLines(content, FilterOptions{Level: "info", Sort: "asc", Limit: 2})
	if got != "2026/01/01 10:00:01 [Info] middle\n2026/01/01 10:00:02 [Info] newest" {
		t.Fatalf("unexpected filtered logs:\n%s", got)
	}
}

func TestFilterLinesDesc(t *testing.T) {
	content := "2026/01/01 10:00:00 [Info] first\n2026/01/01 10:00:01 [Debug] second"
	got := FilterLines(content, FilterOptions{Sort: "desc", Limit: 10})
	if !strings.HasPrefix(got, "2026/01/01 10:00:01") {
		t.Fatalf("desc sort did not put newest first:\n%s", got)
	}
}

func TestTailFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "xray.log")
	if err := os.WriteFile(path, []byte("one\ntwo\nthree\n"), 0o600); err != nil {
		t.Fatalf("write log: %v", err)
	}
	got, err := TailFile(path, 2)
	if err != nil {
		t.Fatalf("TailFile returned error: %v", err)
	}
	if got != "three\n" && got != "two\nthree\n" {
		t.Fatalf("unexpected tail: %q", got)
	}
}

func TestParseLineTimeSupportsSyslogPrefix(t *testing.T) {
	if got := ParseLineTime("Mon Jan  2 15:04:05 2026 router xray[1]: hello"); got == 0 {
		t.Fatal("expected syslog timestamp to parse")
	}
}
