package main

import (
	"fmt"

	rproxy "github.com/AceAsket/RuOpenRay-Keenetic/internal/proxy"
)

func ensureFragmentOutboundsInConfig(cfg map[string]any) {
	if cfg == nil {
		return
	}
	outbounds, _ := cfg["outbounds"].([]any)
	if len(outbounds) == 0 {
		return
	}
	cfg["outbounds"] = ensureFragmentOutbounds(outbounds)
}

func ensureFragmentOutbounds(outbounds []any) []any {
	if len(outbounds) == 0 {
		return outbounds
	}
	known := map[string]bool{}
	needed := []string{}
	for _, item := range outbounds {
		outbound, ok := item.(map[string]any)
		if !ok {
			continue
		}
		tag := fmt.Sprint(outbound["tag"])
		if tag != "" {
			known[tag] = true
		}
		dialer := fragmentDialerProxy(outbound)
		if dialer != "" {
			needed = append(needed, dialer)
		}
	}
	if len(needed) == 0 {
		return outbounds
	}
	next := append([]any{}, outbounds...)
	for _, tag := range needed {
		if known[tag] {
			continue
		}
		companion, ok := rproxy.FragmentOutboundFromTag(tag)
		if !ok {
			continue
		}
		next = append(next, companion)
		known[tag] = true
	}
	return next
}

func fragmentDialerProxy(outbound map[string]any) string {
	stream, _ := outbound["streamSettings"].(map[string]any)
	if stream == nil {
		return ""
	}
	sockopt, _ := stream["sockopt"].(map[string]any)
	if sockopt == nil {
		return ""
	}
	return fmt.Sprint(sockopt["dialerProxy"])
}
