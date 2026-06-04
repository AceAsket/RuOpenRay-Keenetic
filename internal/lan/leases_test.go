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

func TestParseKeeneticDHCPBindings(t *testing.T) {
	content := `
            lease:
                   ip: 192.168.1.94
                  mac: 00:e0:4c:56:03:3d
                  via: 00:e0:4c:56:03:3d
             hostname: AceLegion
                 name: AceLegion - Home network - 2026-06-02 10:58
              expires: 17218
`
	leases := ParseKeeneticDHCPBindings(content, 1770000000)
	if len(leases) != 1 {
		t.Fatalf("ParseKeeneticDHCPBindings returned %d leases, want 1: %#v", len(leases), leases)
	}
	if leases[0]["name"] != "AceLegion" || leases[0]["ip"] != "192.168.1.94" || leases[0]["remaining"] != int64(17218) {
		t.Fatalf("lease parsed incorrectly: %#v", leases[0])
	}
	if leases[0]["expires"] != "1770017218" {
		t.Fatalf("expires = %v, want 1770017218", leases[0]["expires"])
	}
}

func TestParseIPNeighbours(t *testing.T) {
	content := `
192.168.1.94 dev br0 lladdr 00:E0:4C:56:03:3D REACHABLE
fe80::1 dev br0 lladdr aa:bb:cc:dd:ee:ff STALE
192.168.1.95 dev br0 FAILED
`
	leases := ParseIPNeighbours(content, "ip neigh show")
	if len(leases) != 1 {
		t.Fatalf("ParseIPNeighbours returned %d leases, want 1: %#v", len(leases), leases)
	}
	if leases[0]["ip"] != "192.168.1.94" || leases[0]["mac"] != "00:e0:4c:56:03:3d" || leases[0]["interface"] != "br0" {
		t.Fatalf("neighbour parsed incorrectly: %#v", leases[0])
	}
}

func TestParseProcNetARP(t *testing.T) {
	content := `IP address       HW type     Flags       HW address            Mask     Device
192.168.1.94     0x1         0x2         00:E0:4C:56:03:3D     *        br0
192.168.1.95     0x1         0x0         00:00:00:00:00:00     *        br0
`
	leases := ParseProcNetARP(content, "/proc/net/arp")
	if len(leases) != 1 {
		t.Fatalf("ParseProcNetARP returned %d leases, want 1: %#v", len(leases), leases)
	}
	if leases[0]["ip"] != "192.168.1.94" || leases[0]["mac"] != "00:e0:4c:56:03:3d" || leases[0]["interface"] != "br0" {
		t.Fatalf("arp parsed incorrectly: %#v", leases[0])
	}
}

func TestDHCPLeaseReportEmptyArray(t *testing.T) {
	previous := activeNetworkNeighbours
	activeNetworkNeighbours = func() ([]map[string]any, bool) { return nil, false }
	t.Cleanup(func() { activeNetworkNeighbours = previous })

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
