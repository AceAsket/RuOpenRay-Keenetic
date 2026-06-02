package main

import (
	"reflect"
	"strings"
	"testing"
)

func TestNormalizeKeeneticExternalLists(t *testing.T) {
	ip, rejectedIP := normalizeKeeneticCIDRList("192.168.1.10\n203.0.113.0/24\nbad")
	if !reflect.DeepEqual(ip, []string{"192.168.1.10", "203.0.113.0/24"}) {
		t.Fatalf("ip = %#v", ip)
	}
	if !reflect.DeepEqual(rejectedIP, []string{"bad"}) {
		t.Fatalf("rejectedIP = %#v", rejectedIP)
	}

	ports, rejectedPorts := normalizeKeeneticPortList("443, 8000:8100\n99999\n22")
	if !reflect.DeepEqual(ports, []string{"443", "8000:8100", "22"}) {
		t.Fatalf("ports = %#v", ports)
	}
	if !reflect.DeepEqual(rejectedPorts, []string{"99999"}) {
		t.Fatalf("rejectedPorts = %#v", rejectedPorts)
	}
}

func TestKeeneticFirewallPortsMergesProxyList(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir(), Platform: "keenetic"}}
	ports := state.keeneticFirewallPorts(map[string]any{
		"ports":             []any{"80", "443"},
		"keeneticPortProxy": []any{"5228", "443"},
	})
	want := []string{"80", "443", "5228"}
	if !reflect.DeepEqual(ports, want) {
		t.Fatalf("ports = %#v, want %#v", ports, want)
	}
}

func TestKeeneticFirewallPortsMergesSavedProxyList(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir(), Platform: "keenetic"}}
	state.saveKeeneticSettings(map[string]any{"portProxyText": "5228\n8443"})
	ports := state.keeneticFirewallPorts(map[string]any{"ports": []any{"80", "443"}})
	want := []string{"80", "443", "5228", "8443"}
	if !reflect.DeepEqual(ports, want) {
		t.Fatalf("ports = %#v, want %#v", ports, want)
	}
}

func TestKeeneticFirewallMetaCarriesDnsAndIPv6(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir(), Platform: "keenetic"}}
	state.saveKeeneticSettings(map[string]any{"ipv6Mode": "disable"})
	meta := state.keeneticFirewallMeta(map[string]any{"dnsIntercept": true}, "tproxy", "br0", 52345, []string{"80", "443"}, true)
	if meta["dnsIntercept"] != true {
		t.Fatalf("dnsIntercept = %#v, want true", meta["dnsIntercept"])
	}
	if meta["ipv6Mode"] != "disable" {
		t.Fatalf("ipv6Mode = %#v, want disable", meta["ipv6Mode"])
	}
}

func TestKeeneticSettingsReportsEntwareProxyApplied(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir(), Platform: "keenetic"}}
	state.saveKeeneticSettings(map[string]any{"entwareProxy": true})
	report := state.keeneticSettings()
	features, _ := report["appliedFeatures"].(map[string]any)
	if features["entwareProxy"] != true {
		t.Fatalf("entwareProxy applied feature = %#v", features["entwareProxy"])
	}
}

func TestKeeneticPreviewIncludesDnsAndIPv6Env(t *testing.T) {
	state := &serverState{cfg: appConfig{DataDir: t.TempDir(), Platform: "keenetic"}}
	state.saveKeeneticSettings(map[string]any{"ipv6Mode": "disable"})
	preview := state.previewKeeneticFirewall(map[string]any{"routerMode": "redirect", "dnsIntercept": true})
	body := strings.TrimSpace(preview["preview"].(string))
	for _, want := range []string{"RUOPENRAY_DNS_INTERCEPT='1'", "RUOPENRAY_IPV6_MODE='disable'"} {
		if !strings.Contains(body, want) {
			t.Fatalf("preview missing %q:\n%s", want, body)
		}
	}
}
