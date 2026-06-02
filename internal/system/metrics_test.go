package system

import "testing"

func TestParseUintField(t *testing.T) {
	if got := ParseUintField(" 42 "); got != 42 {
		t.Fatalf("ParseUintField = %d, want 42", got)
	}
	if got := ParseUintField("bad"); got != 0 {
		t.Fatalf("ParseUintField invalid = %d, want 0", got)
	}
}

func TestMemoryStatsShape(t *testing.T) {
	stats := MemoryStats()
	if len(stats) == 0 {
		t.Skip("/proc/meminfo is not available")
	}
	for _, key := range []string{"total", "available", "used", "usedPercent"} {
		if _, ok := stats[key]; !ok {
			t.Fatalf("MemoryStats missing %s: %#v", key, stats)
		}
	}
}

func TestRouterUptimeNonNegative(t *testing.T) {
	if got := RouterUptimeSeconds(); got < 0 {
		t.Fatalf("RouterUptimeSeconds = %f, want non-negative", got)
	}
}

func TestSamplerMetricsShape(t *testing.T) {
	stats := NewSampler().Metrics()
	for _, key := range []string{"cpu", "memory", "tcp", "conntrack", "disk", "traffic", "uptime"} {
		if _, ok := stats[key]; !ok {
			t.Fatalf("Metrics missing %s: %#v", key, stats)
		}
	}
}

func TestTCPFastOpenStatusShape(t *testing.T) {
	status := TCPFastOpenStatus()
	for _, key := range []string{"ok", "available", "enabled", "value"} {
		if _, ok := status[key]; !ok {
			t.Fatalf("TCPFastOpenStatus missing %s: %#v", key, status)
		}
	}
}
