package main

import (
	"net"
	"testing"
)

func TestCIDRHostsSkipsTarget(t *testing.T) {
	target := net.ParseIP("192.0.2.10").To4()
	hosts, network := cidrHosts(target, 29, 16)
	if network != "192.0.2.8/29" {
		t.Fatalf("unexpected network: %s", network)
	}
	for _, host := range hosts {
		if host.Equal(target) {
			t.Fatalf("target IP was included in scan hosts: %v", hosts)
		}
	}
	if len(hosts) == 0 {
		t.Fatal("expected CIDR hosts")
	}
}

func TestProximity(t *testing.T) {
	target := net.ParseIP("192.0.2.10").To4()
	near := net.ParseIP("192.0.2.11").To4()
	far := net.ParseIP("192.0.3.10").To4()
	if proximity(near, target) <= proximity(far, target) {
		t.Fatalf("near IP should have higher proximity than far IP")
	}
}
