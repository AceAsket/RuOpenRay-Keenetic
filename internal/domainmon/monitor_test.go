package domainmon

import (
	"testing"
	"time"
)

func TestParseB4SNILines(t *testing.T) {
	devices := map[string]string{"192.168.1.190": "phone"}
	events := ParseB4SNILines("12:34:56.789,TCP,192.168.1.190:5555,1.1.1.1:443,telegram.org\n", devices)
	if len(events) != 1 {
		t.Fatalf("expected one event, got %d", len(events))
	}
	event := events[0]
	if event.Host != "telegram.org" || event.Protocol != "TCP" || event.SourceDevice != "phone" {
		t.Fatalf("unexpected event: %#v", event)
	}
	if event.SourceIP != "192.168.1.190" || event.SourcePort != "5555" || event.DestinationPort != "443" {
		t.Fatalf("unexpected addresses: %#v", event)
	}
}

func TestParseXrayDomainLines(t *testing.T) {
	content := "2026/05/18 12:00:01.123456 [Info] [proxy] app/dns: querying DNS for: telegram.org from tcp:192.168.1.190:53000\n" +
		"2026/05/18 12:00:02.123456 [Info] [proxy] proxy: tunneling request to tcp:chatgpt.com:443 from tcp:192.168.1.190:51234\n"
	devices := map[string]string{"192.168.1.190": "phone"}

	events := ParseXrayDomainLines(content, devices)
	if len(events) != 2 {
		t.Fatalf("expected two events, got %d: %#v", len(events), events)
	}
	if events[0].Host != "telegram.org" || events[0].Protocol != "DNS" || events[0].Outbound != "proxy" {
		t.Fatalf("unexpected DNS event: %#v", events[0])
	}
	if events[1].Host != "chatgpt.com" || events[1].Protocol != "TCP" || events[1].DestinationPort != "443" {
		t.Fatalf("unexpected TCP event: %#v", events[1])
	}
}

func TestParseXrayDomainLinesPrefersFromSource(t *testing.T) {
	content := "2026/05/18 12:00:02.123456 [Info] [proxy] router 192.168.1.1 accepted tcp:example.com:443 from tcp:192.168.1.165:51234\n"
	devices := map[string]string{"192.168.1.165": "mobile"}

	events := ParseXrayDomainLines(content, devices)
	if len(events) != 1 {
		t.Fatalf("expected one event, got %d: %#v", len(events), events)
	}
	if events[0].SourceIP != "192.168.1.165" || events[0].SourceDevice != "mobile" {
		t.Fatalf("source should be selected from 'from tcp:CLIENT:PORT': %#v", events[0])
	}
}

func TestParseXrayDomainLinesIgnoresConnectionIDs(t *testing.T) {
	content := "2026/05/18 12:00:02.123456 [Info] [112379243] proxy: tunneling request to tcp:chatgpt.com:443 from tcp:192.168.1.165:51234\n"

	events := ParseXrayDomainLines(content, nil)
	if len(events) != 1 {
		t.Fatalf("expected one event, got %d: %#v", len(events), events)
	}
	if events[0].Outbound != "" {
		t.Fatalf("numeric xray connection id should not be treated as outbound: %#v", events[0])
	}
}

func TestParseDnsmasqLines(t *testing.T) {
	content := "Sun May 24 13:30:01 2026 daemon.info dnsmasq[1234]: query[A] telegram.org from 192.168.1.165\n" +
		"Sun May 24 13:30:02 2026 daemon.info dnsmasq[1234]: query[PTR] 1.1.168.192.in-addr.arpa from 192.168.1.165\n"
	devices := map[string]string{"192.168.1.165": "phone"}

	events := ParseDnsmasqLines(content, devices)
	if len(events) != 1 {
		t.Fatalf("expected one dnsmasq query event, got %d: %#v", len(events), events)
	}
	if events[0].Host != "telegram.org" || events[0].SourceIP != "192.168.1.165" || events[0].SourceDevice != "phone" || events[0].Source != "dnsmasq" {
		t.Fatalf("unexpected dnsmasq event: %#v", events[0])
	}
}

func TestParseDnsmasqLinesSupportsAAAA(t *testing.T) {
	content := "daemon.info dnsmasq[1234]: query[AAAA] chatgpt.com from 192.168.1.190\n"

	events := ParseDnsmasqLines(content, nil)
	if len(events) != 1 || events[0].Host != "chatgpt.com" || events[0].Protocol != "DNS" {
		t.Fatalf("unexpected AAAA dnsmasq event: %#v", events)
	}
}

func TestAggregateDomainEvents(t *testing.T) {
	events := []Event{
		{Time: "12:00:00", Timestamp: time.Date(2026, 5, 18, 12, 0, 0, 0, time.Local).UnixNano(), Protocol: "TCP", Host: "telegram.org", SourceIP: "192.168.1.190", SourceDevice: "phone", Outbound: "proxy"},
		{Time: "12:01:00", Timestamp: time.Date(2026, 5, 18, 12, 1, 0, 0, time.Local).UnixNano(), Protocol: "UDP", Host: "telegram.org", SourceIP: "192.168.1.190", SourceDevice: "phone", Outbound: "proxy"},
	}
	aggregates := AggregateDomainEvents(events)
	if len(aggregates) != 1 {
		t.Fatalf("expected one aggregate, got %d", len(aggregates))
	}
	if aggregates[0].Hits != 2 || aggregates[0].TCP != 1 || aggregates[0].UDP != 1 {
		t.Fatalf("unexpected aggregate counters: %#v", aggregates[0])
	}
}

func TestAggregateDevicesIncludesKnownLeases(t *testing.T) {
	events := []Event{
		{Time: "12:00:00", Timestamp: time.Date(2026, 5, 18, 12, 0, 0, 0, time.Local).UnixNano(), Protocol: "TCP", Host: "telegram.org", SourceIP: "192.168.1.190", SourceDevice: "phone", Outbound: "proxy"},
	}
	known := []Device{
		{IP: "192.168.1.190", Name: "phone"},
		{IP: "192.168.1.165", Name: "my-mobile"},
	}

	devices := AggregateDevicesWithKnown(events, known)
	if len(devices) != 2 {
		t.Fatalf("expected event device and known lease, got %d: %#v", len(devices), devices)
	}
	if devices[0]["ip"] != "192.168.1.190" || devices[0]["hits"] != 1 {
		t.Fatalf("event device should stay first: %#v", devices[0])
	}
	if devices[1]["ip"] != "192.168.1.165" || devices[1]["name"] != "my-mobile" || devices[1]["hits"] != 0 {
		t.Fatalf("known lease should be visible with zero hits: %#v", devices[1])
	}
}
