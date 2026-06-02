package main

import (
	"reflect"
	"testing"
)

func TestParseKeeneticInterfaceAddress(t *testing.T) {
	text := "\x1b[Kinterface: Bridge0\n\x1b[K    address: 192.168.1.1\n\x1b[K    mask: 255.255.255.0\n"

	if got := parseKeeneticInterfaceAddress(text); got != "192.168.1.1" {
		t.Fatalf("parseKeeneticInterfaceAddress() = %q, want 192.168.1.1", got)
	}
}

func TestParseKeeneticInterfaceAddressIgnoresInvalidIP(t *testing.T) {
	text := "\x1b[K    address: Home\n\x1b[K    address: 192.168.1.1/24\n"

	if got := parseKeeneticInterfaceAddress(text); got != "" {
		t.Fatalf("parseKeeneticInterfaceAddress() = %q, want empty string", got)
	}
}

func TestParseKeeneticNameServers(t *testing.T) {
	text := "\x1b[KName server:\n\x1b[K    address: 192.168.50.1\n\x1b[K    service: Dhcp::Client-GigabitEthernet0/Vlan2\n\x1b[KName server:\n\x1b[K    address: 1.1.1.1\n"
	want := []string{"192.168.50.1", "1.1.1.1"}

	if got := parseKeeneticNameServers(text); !reflect.DeepEqual(got, want) {
		t.Fatalf("parseKeeneticNameServers() = %#v, want %#v", got, want)
	}
}
