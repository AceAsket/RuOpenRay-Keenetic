package firewall

import (
	"reflect"
	"strings"
	"testing"
)

func TestPortList(t *testing.T) {
	tests := []struct {
		name    string
		payload map[string]any
		want    []string
	}{
		{
			name:    "default ports",
			payload: map[string]any{},
			want:    []string{"80", "443"},
		},
		{
			name: "all ports",
			payload: map[string]any{
				"portMode": "all",
				"ports":    []any{"80", "443"},
			},
			want: []string{},
		},
		{
			name: "clean custom ports",
			payload: map[string]any{
				"ports": []any{"80", "443", "1000:2000", "bad"},
			},
			want: []string{"80", "443", "1000-2000"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := PortList(tt.payload); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("PortList() = %#v, want %#v", got, tt.want)
			}
		})
	}
}

func TestCIDRList(t *testing.T) {
	got := CIDRList([]any{"162.159.140.1", "172.64.150.0/24", "bad", "2001:db8::1", "162.159.140.1"})
	want := []string{"162.159.140.1", "172.64.150.0/24"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("CIDRList() = %#v, want %#v", got, want)
	}
}

func TestNativeNftTProxy(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"routerMode":      "tproxy",
		"lanInterface":    "br-lan",
		"transparentPort": "52345",
		"ports":           []any{"80", "443"},
	})
	if !strings.Contains(body, "tproxy ip to 127.0.0.1:52345") {
		t.Fatalf("nft body does not contain tproxy rule:\n%s", body)
	}
	if meta["routerMode"] != "tproxy" {
		t.Fatalf("routerMode = %#v, want tproxy", meta["routerMode"])
	}
	if !strings.Contains(body, "# ruopenray-meta routerMode=tproxy") {
		t.Fatalf("nft body does not contain status metadata:\n%s", body)
	}
}

func TestNativeNftInterceptsDNSOutsidePortList(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"routerMode":      "tproxy",
		"lanInterface":    "br-lan",
		"transparentPort": "52345",
		"ports":           []any{"80", "443"},
	})
	if !strings.Contains(body, "th dport 53 counter tproxy ip to 127.0.0.1:52345") {
		t.Fatalf("nft body does not contain DNS intercept rule:\n%s", body)
	}
	if meta["dnsIntercept"] != true {
		t.Fatalf("dnsIntercept = %#v, want true", meta["dnsIntercept"])
	}
}

func TestNativeNftDNSInterceptRespectsSelectedDevice(t *testing.T) {
	body, _ := NativeNft(map[string]any{
		"routerMode":   "tproxy",
		"deviceMode":   "selected",
		"devices":      []any{"192.168.1.190"},
		"ports":        []any{"80", "443"},
		"dnsIntercept": true,
	})
	if !strings.Contains(body, `iifname "br-lan" ip saddr { 192.168.1.190 } meta l4proto { tcp, udp } th dport 53`) {
		t.Fatalf("DNS intercept should be scoped to selected device:\n%s", body)
	}
}

func TestNativeNftBlockQuicRespectsSelectedDevice(t *testing.T) {
	body, _ := NativeNft(map[string]any{
		"routerMode": "tproxy",
		"deviceMode": "selected",
		"devices":    []any{"192.168.1.205"},
		"blockQuic":  true,
	})
	if !strings.Contains(body, `iifname "br-lan" ip saddr { 192.168.1.205 } udp dport 443 drop`) {
		t.Fatalf("Block QUIC should be scoped to selected device:\n%s", body)
	}
}

func TestNativeNftSelectedDeviceModeWithoutDevicesIsNoop(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"routerMode": "tproxy",
		"deviceMode": "selected",
		"devices":    []any{},
	})
	if !strings.Contains(body, `return comment "RuOpenRay selected device list is empty"`) {
		t.Fatalf("selected mode without devices should no-op before catch-all rules:\n%s", body)
	}
	if meta["deviceMode"] != "selected" {
		t.Fatalf("deviceMode = %#v, want selected", meta["deviceMode"])
	}
}

func TestNativeNftCanDisableDNSIntercept(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"ports":        []any{"80", "443"},
		"dnsIntercept": false,
	})
	if strings.Contains(body, "DNS Intercept") {
		t.Fatalf("DNS intercept should be disabled:\n%s", body)
	}
	if meta["dnsIntercept"] != false {
		t.Fatalf("dnsIntercept = %#v, want false", meta["dnsIntercept"])
	}
}

func TestNativeNftBypassUsesDirectIPs(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"bypassMode": "bypass",
		"directIps":  []any{"178.217.100.241", "107.155.0.0/16", "geoip:private", "bad"},
	})
	if !strings.Contains(body, "set bypass4") {
		t.Fatalf("bypass mode should create bypass4 set:\n%s", body)
	}
	if !strings.Contains(body, "178.217.100.241") || !strings.Contains(body, "107.155.0.0/16") {
		t.Fatalf("bypass4 should include direct IP rules:\n%s", body)
	}
	if strings.Contains(body, "geoip:private") || strings.Contains(body, "bad") {
		t.Fatalf("bypass4 should not include non-IP rules:\n%s", body)
	}
	got, ok := meta["directIps"].([]string)
	if !ok || len(got) != 2 {
		t.Fatalf("directIps meta = %#v, want two concrete IP entries", meta["directIps"])
	}
}

func TestNativeNftRedirectUsesProxyIPs(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"bypassMode":      "redirect",
		"transparentPort": "52345",
		"proxyIps":        []any{"91.108.4.0/22", "149.154.160.0/20", "geosite:telegram"},
	})
	if !strings.Contains(body, "set proxy4") {
		t.Fatalf("redirect mode should create proxy4 set:\n%s", body)
	}
	if !strings.Contains(body, "91.108.4.0/22") || !strings.Contains(body, "149.154.160.0/20") {
		t.Fatalf("proxy4 should include proxy IP rules:\n%s", body)
	}
	if strings.Contains(body, "geosite:telegram") {
		t.Fatalf("proxy4 should not include non-IP rules:\n%s", body)
	}
	if !strings.Contains(body, "ip daddr @proxy4 meta l4proto { tcp, udp }") {
		t.Fatalf("redirect policy should match proxy4 before sending to Xray:\n%s", body)
	}
	got, ok := meta["proxyIps"].([]string)
	if !ok || len(got) != 2 {
		t.Fatalf("proxyIps meta = %#v, want two concrete IP entries", meta["proxyIps"])
	}
}

func TestNativeNftKillSwitchForcesProtectedIPsToXray(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"routerMode":      "tproxy",
		"lanInterface":    "br-lan",
		"transparentPort": "52345",
		"killSwitch":      true,
		"killSwitchIps":   []any{"162.159.140.0/24", "172.64.150.15"},
	})
	if !strings.Contains(body, "set killswitch4") {
		t.Fatalf("nft body does not contain kill switch set:\n%s", body)
	}
	if !strings.Contains(body, "ip daddr @killswitch4 meta l4proto { tcp, udp } counter tproxy ip to 127.0.0.1:52345") {
		t.Fatalf("nft body does not force protected IPs to Xray:\n%s", body)
	}
	if meta["killSwitch"] != true {
		t.Fatalf("killSwitch = %#v, want true", meta["killSwitch"])
	}
}

func TestNativeNftKillSwitchRespectsSelectedDevice(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"routerMode":           "tproxy",
		"transparentPort":      "52345",
		"killSwitch":           true,
		"killSwitchDeviceMode": "selected",
		"killSwitchDevices":    []any{"192.168.1.190"},
		"killSwitchIps":        []any{"162.159.140.0/24"},
	})
	if !strings.Contains(body, `iifname "br-lan" ip saddr { 192.168.1.190 } ip daddr @killswitch4`) {
		t.Fatalf("kill switch should be scoped to selected device:\n%s", body)
	}
	devices, ok := meta["killSwitchDevices"].([]string)
	if !ok || len(devices) != 1 || devices[0] != "192.168.1.190" {
		t.Fatalf("killSwitchDevices = %#v, want selected device", meta["killSwitchDevices"])
	}
}

func TestNativeNftKillSwitchSelectedDeviceModeWithoutDevicesIsNoop(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"routerMode":           "tproxy",
		"transparentPort":      "52345",
		"killSwitch":           true,
		"killSwitchDeviceMode": "selected",
		"killSwitchDevices":    []any{},
		"killSwitchIps":        []any{"162.159.140.0/24"},
	})
	if strings.Contains(body, `ip daddr @killswitch4`) {
		t.Fatalf("kill switch selected mode without devices must not create all-LAN rules:\n%s", body)
	}
	if meta["killSwitchDeviceMode"] != "selected" {
		t.Fatalf("killSwitchDeviceMode = %#v, want selected", meta["killSwitchDeviceMode"])
	}
}

func TestNativeNftKillSwitchCanRunWhenInterceptSelectedListIsEmpty(t *testing.T) {
	body, _ := NativeNft(map[string]any{
		"routerMode":      "tproxy",
		"deviceMode":      "selected",
		"devices":         []any{},
		"transparentPort": "52345",
		"killSwitch":      true,
		"killSwitchIps":   []any{"162.159.140.0/24"},
	})
	killSwitchIndex := strings.Index(body, `ip daddr @killswitch4`)
	returnIndex := strings.Index(body, `return comment "RuOpenRay selected device list is empty"`)
	if killSwitchIndex < 0 || returnIndex < 0 || killSwitchIndex > returnIndex {
		t.Fatalf("kill switch should be emitted before empty intercept return:\n%s", body)
	}
}

func TestNativeNftKillSwitchExcludesDevice(t *testing.T) {
	body, _ := NativeNft(map[string]any{
		"routerMode":           "tproxy",
		"transparentPort":      "52345",
		"killSwitch":           true,
		"killSwitchDeviceMode": "exclude",
		"killSwitchDevices":    []any{"192.168.1.190"},
		"killSwitchIps":        []any{"162.159.140.0/24"},
	})
	if !strings.Contains(body, `iifname "br-lan" ip saddr != { 192.168.1.190 } ip daddr @killswitch4`) {
		t.Fatalf("kill switch exclude mode should use negative source match:\n%s", body)
	}
}

func TestNativeNftKillSwitchRedirectDropsUDP(t *testing.T) {
	body, _ := NativeNft(map[string]any{
		"routerMode":      "redirect",
		"transparentPort": "52345",
		"killSwitch":      true,
		"killSwitchIps":   []any{"162.159.140.0/24"},
	})
	if !strings.Contains(body, "ip daddr @killswitch4 meta l4proto tcp redirect to :52345") {
		t.Fatalf("redirect kill switch should redirect TCP:\n%s", body)
	}
	if !strings.Contains(body, "ip daddr @killswitch4 meta l4proto udp drop") {
		t.Fatalf("redirect kill switch should drop UDP to avoid leaks:\n%s", body)
	}
}

func TestNativeNftKillSwitchDomainsCreateDynamicSet(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"routerMode":           "tproxy",
		"transparentPort":      "52345",
		"killSwitch":           true,
		"killSwitchDomainMode": "nftset",
		"killSwitchDomains":    []any{"openai.com", "chatgpt.com"},
		"killSwitchIps":        []any{},
		"firewallDeviceMode":   "all",
	})
	if !strings.Contains(body, "set killswitch4 { type ipv4_addr; flags interval; }") {
		t.Fatalf("domain kill switch should create an empty dynamic nft set:\n%s", body)
	}
	if !strings.Contains(body, "ip daddr @killswitch4 meta l4proto { tcp, udp } counter tproxy ip to 127.0.0.1:52345") {
		t.Fatalf("domain kill switch should force resolved IPs to Xray:\n%s", body)
	}
	domains, ok := meta["killSwitchDomains"].([]string)
	if !ok || len(domains) != 2 {
		t.Fatalf("killSwitchDomains = %#v, want 2 domains", meta["killSwitchDomains"])
	}
}

func TestNativeNftKillSwitchDNSBlockDomainsDoNotCreateSet(t *testing.T) {
	body, meta := NativeNft(map[string]any{
		"routerMode":           "tproxy",
		"killSwitch":           true,
		"killSwitchDomainMode": "dns-block",
		"killSwitchDomains":    []any{"openai.com"},
	})
	if strings.Contains(body, "set killswitch4") {
		t.Fatalf("dns-block domain mode should not create nft set without IPs:\n%s", body)
	}
	if meta["killSwitchDomainMode"] != "dns-block" {
		t.Fatalf("killSwitchDomainMode = %#v, want dns-block", meta["killSwitchDomainMode"])
	}
}

func TestStepOKAllowsMissingDeletes(t *testing.T) {
	if !StepOK(map[string]any{"ok": false, "stderr": "No such file or directory"}) {
		t.Fatal("StepOK should allow idempotent missing-file errors")
	}
	if StepOK(map[string]any{"ok": false, "stderr": "Error: syntax error"}) {
		t.Fatal("StepOK should reject real nft syntax errors")
	}
}
