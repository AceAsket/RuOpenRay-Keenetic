package main

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	rfw "github.com/AceAsket/RuOpenRay-Keenetic/internal/firewall"
)

func TestParseFirewallStatusMeta(t *testing.T) {
	body := `# ruopenray-meta routerMode=tproxy bypassMode=off deviceMode=selected portMode=custom ports=80,443 blockQuic=true dnsIntercept=false transparentPort=52345 lanInterface=br-lan killSwitch=true
table inet ruopenray {}
`
	meta := parseFirewallStatusMeta(body)
	if meta["routerMode"] != "tproxy" {
		t.Fatalf("routerMode = %#v, want tproxy", meta["routerMode"])
	}
	if meta["deviceMode"] != "selected" {
		t.Fatalf("deviceMode = %#v, want selected", meta["deviceMode"])
	}
	if meta["dnsIntercept"] != false {
		t.Fatalf("dnsIntercept = %#v, want false", meta["dnsIntercept"])
	}
	if meta["blockQuic"] != true {
		t.Fatalf("blockQuic = %#v, want true", meta["blockQuic"])
	}
	if meta["transparentPort"] != 52345 {
		t.Fatalf("transparentPort = %#v, want 52345", meta["transparentPort"])
	}
	ports, ok := meta["ports"].([]string)
	if !ok || len(ports) != 2 || ports[0] != "80" || ports[1] != "443" {
		t.Fatalf("ports = %#v, want [80 443]", meta["ports"])
	}
}

func TestSanitizeKillSwitchDomains(t *testing.T) {
	got := sanitizeKillSwitchDomains([]any{" OpenAI.com ", "*.chatgpt.com", "bad value", "10.0.0.1", "openai.com"})
	want := []string{"openai.com", "chatgpt.com"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("sanitizeKillSwitchDomains() = %#v, want %#v", got, want)
	}
}

func TestKillSwitchDomainFromNftsetEntry(t *testing.T) {
	got := killSwitchDomainFromNftsetEntry("/openai.com/4#inet#ruopenray#killswitch4")
	if got != "openai.com" {
		t.Fatalf("domain = %#v, want openai.com", got)
	}
}

func TestRouteNftsetEntryAndDomain(t *testing.T) {
	entry := routeNftsetEntry("telegram.org", "proxy4")
	if entry != "/telegram.org/4#inet#ruopenray#proxy4" {
		t.Fatalf("entry = %#v", entry)
	}
	if got := domainFromNftsetEntry(entry, "proxy4"); got != "telegram.org" {
		t.Fatalf("domain = %#v, want telegram.org", got)
	}
	if got := domainFromNftsetEntry(entry, "bypass4"); got != "" {
		t.Fatalf("wrong set domain = %#v, want empty", got)
	}
}

func TestKillSwitchDNSBlockEntries(t *testing.T) {
	got := killSwitchDNSBlockEntries([]string{"openai.com", "*.chatgpt.com", "bad value"})
	want := []string{"/openai.com/0.0.0.0", "/openai.com/::", "/chatgpt.com/0.0.0.0", "/chatgpt.com/::"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("killSwitchDNSBlockEntries() = %#v, want %#v", got, want)
	}
}

func TestParseFirewallPortsFromLegacyBody(t *testing.T) {
	body := `table inet ruopenray {
  chain prerouting {
    iifname "br-lan" meta l4proto { tcp, udp } th dport 53 counter tproxy ip to 127.0.0.1:52345 meta mark set 1 comment "RuOpenRay DNS Intercept"
    iifname "br-lan" udp dport 443 drop comment "RuOpenRay Block QUIC"
    iifname "br-lan" meta l4proto { tcp, udp } th dport { 80, 443 } counter tproxy ip to 127.0.0.1:52345 meta mark set 1
  }
}`
	ports := parseFirewallPortsFromBody(body)
	if len(ports) != 2 || ports[0] != "80" || ports[1] != "443" {
		t.Fatalf("ports = %#v, want [80 443]", ports)
	}
}

func TestParseKeeneticRedirectStatusPieces(t *testing.T) {
	natChain := `-N RUOPENRAY
-A RUOPENRAY -d 10.0.0.0/8 -j RETURN
-A RUOPENRAY -p tcp -j REDIRECT --to-ports 52345`
	prerouting := `-P PREROUTING ACCEPT
-A PREROUTING -i br0 -p tcp -m tcp --dport 80 -j RUOPENRAY
-A PREROUTING -i br0 -p tcp -m tcp --dport 443 -j RUOPENRAY`

	if got := parseKeeneticRedirectPort(natChain); got != 52345 {
		t.Fatalf("transparent port = %d, want 52345", got)
	}
	if got := parseKeeneticLANInterface(prerouting); got != "br0" {
		t.Fatalf("LAN interface = %q, want br0", got)
	}
	if got := parseKeeneticRedirectPorts(prerouting); !reflect.DeepEqual(got, []string{"80", "443"}) {
		t.Fatalf("redirect ports = %#v, want [80 443]", got)
	}
}

func TestParseKeeneticTProxyStatusPieces(t *testing.T) {
	mangleChain := `-N RUOPENRAY_TPROXY
-A RUOPENRAY_TPROXY -d 10.0.0.0/8 -j RETURN
-A RUOPENRAY_TPROXY -p tcp -j TPROXY --on-port 52345 --on-ip 127.0.0.1 --tproxy-mark 0x111`
	prerouting := `-P PREROUTING ACCEPT
-A PREROUTING -i br0 -p udp -m udp --dport 443 -j RUOPENRAY_TPROXY
-A PREROUTING -i br0 -p tcp -m tcp --dport 443 -j RUOPENRAY_TPROXY`

	if got := parseKeeneticRedirectPort(mangleChain); got != 52345 {
		t.Fatalf("transparent port = %d, want 52345", got)
	}
	if got := parseKeeneticLANInterface(prerouting); got != "br0" {
		t.Fatalf("LAN interface = %q, want br0", got)
	}
	if got := parseKeeneticRedirectPorts(prerouting); !reflect.DeepEqual(got, []string{"443"}) {
		t.Fatalf("tproxy ports = %#v, want [443]", got)
	}
}

func TestParseKeeneticAllPortsAndDeviceScope(t *testing.T) {
	prerouting := `-P PREROUTING ACCEPT
-A PREROUTING -i br0 -s 192.168.1.50 -p udp -j RUOPENRAY_TPROXY
-A PREROUTING -i br0 -s 192.168.1.50 -p tcp -j RUOPENRAY_TPROXY`
	if !parseKeeneticAllPorts(prerouting) {
		t.Fatalf("all-port prerouting was not detected")
	}
	mode, devices := parseKeeneticDeviceScope(prerouting, "")
	if mode != "selected" {
		t.Fatalf("device mode = %q, want selected", mode)
	}
	if !reflect.DeepEqual(devices, []string{"192.168.1.50"}) {
		t.Fatalf("devices = %#v, want [192.168.1.50]", devices)
	}
}

func TestParseKeeneticExcludeDeviceScope(t *testing.T) {
	chain := `-N RUOPENRAY
-A RUOPENRAY -d 10.0.0.0/8 -j RETURN
-A RUOPENRAY -s 192.168.1.60 -j RETURN
-A RUOPENRAY -p tcp -j REDIRECT --to-ports 52345`
	mode, devices := parseKeeneticDeviceScope("", chain)
	if mode != "exclude" {
		t.Fatalf("device mode = %q, want exclude", mode)
	}
	if !reflect.DeepEqual(devices, []string{"192.168.1.60"}) {
		t.Fatalf("devices = %#v, want [192.168.1.60]", devices)
	}
}

func TestKeeneticFirewallMetaNormalizesScope(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir(), Platform: "keenetic"}}
	meta := state.keeneticFirewallMeta(map[string]any{
		"deviceMode": []any{},
		"portMode":   "all",
		"devices":    []any{"192.168.1.70"},
	}, "tproxy", "br0", 52345, []string{"all"}, false)
	if meta["portMode"] != "all" {
		t.Fatalf("portMode = %#v, want all", meta["portMode"])
	}
	if !reflect.DeepEqual(meta["ports"], []string{}) {
		t.Fatalf("ports = %#v, want empty list", meta["ports"])
	}
	if meta["deviceMode"] != "all" {
		t.Fatalf("deviceMode = %#v, want all for invalid payload mode", meta["deviceMode"])
	}
}

func TestParseKeeneticIptablesCounters(t *testing.T) {
	body := `Chain PREROUTING (policy ACCEPT 10 packets, 800 bytes)
 pkts bytes target     prot opt in     out     source               destination
   12   960 RUOPENRAY_TPROXY  tcp  --  br0    *       0.0.0.0/0            0.0.0.0/0 tcp dpt:443
    3   300 RETURN     udp  --  br0    *       0.0.0.0/0            10.0.0.0/8
    5   500 RUOPENRAY_TPROXY  udp  --  br0    *       0.0.0.0/0            0.0.0.0/0 udp dpt:443`

	total := parseKeeneticRuleCounters(body)
	if numberAny(total["packets"]) != 20 || numberAny(total["bytes"]) != 1760 {
		t.Fatalf("total counters = %#v", total)
	}
	target := parseKeeneticTargetCounters(body, "RUOPENRAY_TPROXY")
	if numberAny(target["packets"]) != 17 || numberAny(target["bytes"]) != 1460 {
		t.Fatalf("target counters = %#v", target)
	}
}

func TestExpandFirewallGeoPayloadAddsGeoTargets(t *testing.T) {
	geoDir := t.TempDir()
	writeFirewallGeoFixture(t, geoDir)
	state := &serverState{cfg: appConfig{GeoDir: geoDir}}

	payload := map[string]any{
		"killSwitchIps":     []any{"162.159.140.0/24"},
		"killSwitchDomains": []any{"openai.com"},
		"killSwitchGeoip":   []any{"private"},
		"killSwitchGeosite": []any{"telegram"},
		"killSwitchExt":     []any{`ext:"LoyalsoldierSite.dat:antifilter-community"`},
	}

	expanded := state.expandFirewallGeoPayload(payload)
	gotIPs := stringList(expanded["killSwitchIps"])
	wantIPs := []string{"162.159.140.0/24", "10.0.0.0/8", "192.168.0.0/16"}
	if !reflect.DeepEqual(gotIPs, wantIPs) {
		t.Fatalf("killSwitchIps = %#v, want %#v", gotIPs, wantIPs)
	}
	gotDomains := stringList(expanded["killSwitchDomains"])
	wantDomains := []string{"openai.com", "telegram.org", "t.me", "blocked.example"}
	if !reflect.DeepEqual(gotDomains, wantDomains) {
		t.Fatalf("killSwitchDomains = %#v, want %#v", gotDomains, wantDomains)
	}
	report, ok := expanded["geoExpansion"].(map[string]any)
	if !ok {
		t.Fatalf("geoExpansion missing: %#v", expanded["geoExpansion"])
	}
	if report["addedIps"] != 2 || report["addedDomains"] != 3 || report["skipped"] != 1 {
		t.Fatalf("geoExpansion = %#v", report)
	}
}

func TestExpandFirewallGeoPayloadAddsRouteTargets(t *testing.T) {
	geoDir := t.TempDir()
	writeFirewallGeoFixture(t, geoDir)
	state := &serverState{cfg: appConfig{GeoDir: geoDir}}

	expanded := state.expandFirewallGeoPayload(map[string]any{
		"directIps":     []any{"1.1.1.1"},
		"directDomains": []any{"router.example"},
		"directGeoip":   []any{"private"},
		"directGeosite": []any{"telegram"},
		"proxyDomains":  []any{"openai.com"},
		"proxyExt":      []any{`ext:"LoyalsoldierSite.dat:antifilter-community"`},
	})

	if got := stringList(expanded["directIps"]); !reflect.DeepEqual(got, []string{"1.1.1.1", "10.0.0.0/8", "192.168.0.0/16"}) {
		t.Fatalf("directIps = %#v", got)
	}
	if got := stringList(expanded["directDomains"]); !reflect.DeepEqual(got, []string{"router.example", "telegram.org", "t.me"}) {
		t.Fatalf("directDomains = %#v", got)
	}
	if got := stringList(expanded["proxyDomains"]); !reflect.DeepEqual(got, []string{"openai.com", "blocked.example"}) {
		t.Fatalf("proxyDomains = %#v", got)
	}
}

func TestFirewallPreviewUsesExpandedGeoTargets(t *testing.T) {
	geoDir := t.TempDir()
	writeFirewallGeoFixture(t, geoDir)
	state := &serverState{cfg: appConfig{GeoDir: geoDir}}

	expanded := state.expandFirewallGeoPayload(map[string]any{
		"routerMode":             "tproxy",
		"bypassMode":             "redirect",
		"deviceMode":             "all",
		"portMode":               "all",
		"killSwitch":             true,
		"killSwitchTargetMode":   "all",
		"killSwitchDomainMode":   "nftset",
		"killSwitchGeoip":        []any{"private"},
		"killSwitchGeosite":      []any{"telegram"},
		"transparentPort":        52345,
		"dnsIntercept":           true,
		"dnsInterceptPort":       5353,
		"dnsInterceptTargetPort": 5353,
	})
	body, meta := rfw.NativeNft(expanded)
	for _, needle := range []string{"10.0.0.0/8", "192.168.0.0/16", "@killswitch4", "meta l4proto { tcp, udp } counter tproxy ip to 127.0.0.1:52345"} {
		if !strings.Contains(body, needle) {
			t.Fatalf("nft preview missing %q:\n%s", needle, body)
		}
	}
	if got := meta["killSwitchIps"]; !reflect.DeepEqual(got, []string{"10.0.0.0/8", "192.168.0.0/16"}) {
		t.Fatalf("metadata killSwitchIps = %#v", got)
	}
	if got := meta["killSwitchDomains"]; !reflect.DeepEqual(got, []string{"telegram.org", "t.me"}) {
		t.Fatalf("metadata killSwitchDomains = %#v", got)
	}
}

func writeFirewallGeoFixture(t *testing.T, geoDir string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(geoDir, "geoip.dat"), protoMessage(1, protoRawMessage(
		protoStringField(1, "private"),
		protoMessage(2, protoRawMessage(protoBytesField(1, []byte{10, 0, 0, 0}), protoVarintField(2, 8))),
		protoMessage(2, protoRawMessage(protoBytesField(1, []byte{192, 168, 0, 0}), protoVarintField(2, 16))),
	)), 0o600); err != nil {
		t.Fatalf("write geoip fixture: %v", err)
	}
	if err := os.WriteFile(filepath.Join(geoDir, "geosite.dat"), protoMessage(1, protoRawMessage(
		protoStringField(1, "telegram"),
		protoMessage(2, protoRawMessage(protoVarintField(1, 2), protoStringField(2, "telegram.org"))),
		protoMessage(2, protoRawMessage(protoVarintField(1, 3), protoStringField(2, "t.me"))),
		protoMessage(2, protoRawMessage(protoVarintField(1, 1), protoStringField(2, ".*\\.telegram\\.org"))),
	)), 0o600); err != nil {
		t.Fatalf("write geosite fixture: %v", err)
	}
	if err := os.WriteFile(filepath.Join(geoDir, "LoyalsoldierSite.dat"), protoMessage(1, protoRawMessage(
		protoStringField(1, "antifilter-community"),
		protoMessage(2, protoRawMessage(protoVarintField(1, 2), protoStringField(2, "blocked.example"))),
	)), 0o600); err != nil {
		t.Fatalf("write ext fixture: %v", err)
	}
}
