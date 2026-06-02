package lan

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseDHCPLeases(t *testing.T) {
	content := "" +
		"1770000100 00:e0:4c:56:03:3d 192.168.1.190 AceLegion 01:00:e0:4c:56:03:3d\n" +
		"1770000200 aa:bb:cc:dd:ee:ff 192.168.1.191 * *\n" +
		"bad line\n"
	leases := ParseDHCPLeases(content, "/tmp/dhcp.leases", 1770000000)
	if len(leases) != 2 {
		t.Fatalf("ParseDHCPLeases returned %d leases, want 2: %#v", len(leases), leases)
	}
	if leases[0]["name"] != "AceLegion" || leases[0]["remaining"] != int64(100) {
		t.Fatalf("first lease parsed incorrectly: %#v", leases[0])
	}
	if leases[1]["name"] != "" || leases[1]["ip"] != "192.168.1.191" {
		t.Fatalf("second lease parsed incorrectly: %#v", leases[1])
	}
}

func TestDHCPLeaseReportUsesDataDirFallback(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "dhcp.leases")
	if err := os.WriteFile(path, []byte("1770000100 00:e0:4c:56:03:3d 192.168.1.190 AceLegion *\n"), 0o600); err != nil {
		t.Fatalf("write fallback leases: %v", err)
	}
	report := DHCPLeaseReport(dir)
	if report["source"] != path {
		t.Fatalf("source = %v, want %v", report["source"], path)
	}
	leases, ok := report["leases"].([]map[string]any)
	if !ok || len(leases) != 1 {
		t.Fatalf("leases = %#v, want one lease", report["leases"])
	}
}

func TestDHCPLeaseReportEmptyArray(t *testing.T) {
	report := DHCPLeaseReport(t.TempDir())
	leases, ok := report["leases"].([]map[string]any)
	if !ok {
		t.Fatalf("leases has type %T, want []map[string]any", report["leases"])
	}
	if leases == nil {
		t.Fatal("leases is nil, want empty slice for JSON []")
	}
	if len(leases) != 0 {
		t.Fatalf("leases length = %d, want 0", len(leases))
	}
}
