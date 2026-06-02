package dnsconfig

import "testing"

func TestNormalizeDnsmasqServer(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "plain IPv4 gets port 53", in: "192.168.50.1", want: "192.168.50.1#53"},
		{name: "host port uses dnsmasq separator", in: "192.168.50.1:5353", want: "192.168.50.1#5353"},
		{name: "already dnsmasq format stays", in: "127.0.0.1#5353", want: "127.0.0.1#5353"},
		{name: "IPv6 bracket gets port 53", in: "[fd00::1]", want: "[fd00::1]#53"},
		{name: "IPv6 bracket port converted", in: "[fd00::1]:5353", want: "[fd00::1]#5353"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := NormalizeDnsmasqServer(tt.in); got != tt.want {
				t.Fatalf("NormalizeDnsmasqServer(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestLANCommandPlan(t *testing.T) {
	plan, err := LANCommandPlan("upstream", "192.168.50.2", true)
	if err != nil {
		t.Fatalf("LANCommandPlan returned error: %v", err)
	}
	commands := PlanCommands(plan)
	if len(commands) != 5 {
		t.Fatalf("expected 5 commands, got %d: %#v", len(commands), commands)
	}
	if got := commands[2][2]; got != "dhcp.@dnsmasq[0].server=192.168.50.2#53" {
		t.Fatalf("unexpected upstream command: %q", got)
	}
	if got := commands[4][0]; got != "/etc/init.d/dnsmasq" {
		t.Fatalf("expected dnsmasq restart command, got %#v", commands[4])
	}
}

func TestLANCommandPlanXrayCustomTarget(t *testing.T) {
	plan, err := LANCommandPlan("xray", "127.0.0.1#10535", false)
	if err != nil {
		t.Fatalf("LANCommandPlan returned error: %v", err)
	}
	commands := PlanCommands(plan)
	if len(commands) != 4 {
		t.Fatalf("expected 4 commands, got %d: %#v", len(commands), commands)
	}
	if got := commands[2][2]; got != "dhcp.@dnsmasq[0].server=127.0.0.1#10535" {
		t.Fatalf("unexpected xray upstream command: %q", got)
	}
}

func TestCleanCheckHost(t *testing.T) {
	tests := map[string]string{
		"":                         "example.com",
		"https://ya.ru/search?q=1": "ya.ru",
		" example.com. ":           "example.com",
	}
	for in, want := range tests {
		if got := CleanCheckHost(in); got != want {
			t.Fatalf("CleanCheckHost(%q) = %q, want %q", in, got, want)
		}
	}
}
