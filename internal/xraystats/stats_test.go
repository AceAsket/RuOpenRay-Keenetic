package xraystats

import (
	"testing"
	"time"
)

func TestEnsureConfigEnablesStats(t *testing.T) {
	cfg := map[string]any{}
	EnsureConfig(cfg, true)
	info := APIInfo(cfg)
	if info["enabled"] != true {
		t.Fatalf("stats not enabled: %#v cfg=%#v", info, cfg)
	}
	if len(asArray(cfg["inbounds"])) != 1 {
		t.Fatalf("expected stats inbound: %#v", cfg["inbounds"])
	}
}

func TestParseOutputJSON(t *testing.T) {
	counters := ParseOutput(`{"stat":[{"name":"outbound>>>proxy>>>traffic>>>downlink","value":42}]}`)
	if counters["outbound>>>proxy>>>traffic>>>downlink"] != 42 {
		t.Fatalf("unexpected counters: %#v", counters)
	}
}

func TestTrafficResultGroupsOutboundTraffic(t *testing.T) {
	result := TrafficResult(
		map[string]uint64{
			"outbound>>>proxy>>>traffic>>>downlink": 100,
			"outbound>>>proxy>>>traffic>>>uplink":   20,
		},
		map[string]uint64{
			"outbound>>>proxy>>>traffic>>>downlink": 40,
			"outbound>>>proxy>>>traffic>>>uplink":   10,
		},
		2,
		map[string]string{"proxy": "vless", "direct": "freedom"},
		time.Unix(0, 0),
	)
	groups := result["groups"].(map[string]map[string]any)
	if groups["proxy"]["downlink"] != uint64(100) || groups["proxy"]["downRate"] != float64(30) {
		t.Fatalf("unexpected proxy group: %#v", groups["proxy"])
	}
}
