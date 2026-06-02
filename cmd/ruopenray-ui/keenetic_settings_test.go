package main

import (
	"reflect"
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
