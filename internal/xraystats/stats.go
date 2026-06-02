package xraystats

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	APITag                    = "ruopenray-api"
	fragmentOutboundTagPrefix = "ruopenray-fragment-"
	APIPort                   = 10085
)

func APIInfo(cfg map[string]any) map[string]any {
	tag := APITag
	server := fmt.Sprintf("127.0.0.1:%d", APIPort)
	if cfg == nil {
		return map[string]any{"enabled": false, "server": server, "tag": tag}
	}
	statsEnabled := false
	if _, ok := cfg["stats"].(map[string]any); ok {
		statsEnabled = true
	}
	api, _ := cfg["api"].(map[string]any)
	if value := strings.TrimSpace(fmt.Sprint(api["tag"])); value != "" && value != "<nil>" {
		tag = value
	}
	for _, item := range asArray(cfg["inbounds"]) {
		inbound, ok := item.(map[string]any)
		if !ok || strings.TrimSpace(fmt.Sprint(inbound["tag"])) != tag {
			continue
		}
		listen := strings.TrimSpace(fmt.Sprint(inbound["listen"]))
		if listen == "" || listen == "<nil>" || listen == "0.0.0.0" || listen == "::" {
			listen = "127.0.0.1"
		}
		if port := number(inbound["port"], APIPort); port > 0 {
			server = fmt.Sprintf("%s:%d", listen, port)
		}
		break
	}
	policy, _ := cfg["policy"].(map[string]any)
	system, _ := policy["system"].(map[string]any)
	policyEnabled := boolPayload(system, "statsOutboundUplink", false) && boolPayload(system, "statsOutboundDownlink", false)
	enabled := statsEnabled && HasService(api) && policyEnabled
	return map[string]any{"enabled": enabled, "stats": statsEnabled, "api": HasService(api), "policy": policyEnabled, "server": server, "tag": tag}
}

func EnsureConfig(cfg map[string]any, enabled bool) {
	if cfg == nil {
		return
	}
	if !enabled {
		delete(cfg, "stats")
		if policy, ok := cfg["policy"].(map[string]any); ok {
			if system, ok := policy["system"].(map[string]any); ok {
				delete(system, "statsInboundUplink")
				delete(system, "statsInboundDownlink")
				delete(system, "statsOutboundUplink")
				delete(system, "statsOutboundDownlink")
				if len(system) == 0 {
					delete(policy, "system")
				}
			}
			if len(policy) == 0 {
				delete(cfg, "policy")
			}
		}
		if api, ok := cfg["api"].(map[string]any); ok {
			tag := strings.TrimSpace(fmt.Sprint(api["tag"]))
			if tag == APITag || tag == "" || tag == "<nil>" {
				delete(cfg, "api")
			} else {
				services := []any{}
				for _, service := range Services(api) {
					if service != "StatsService" {
						services = append(services, service)
					}
				}
				api["services"] = services
			}
		}
		inbounds := []any{}
		for _, item := range asArray(cfg["inbounds"]) {
			if inbound, ok := item.(map[string]any); ok && strings.TrimSpace(fmt.Sprint(inbound["tag"])) == APITag {
				continue
			}
			inbounds = append(inbounds, item)
		}
		cfg["inbounds"] = inbounds
		if routing, ok := cfg["routing"].(map[string]any); ok {
			rules := []any{}
			for _, item := range asArray(routing["rules"]) {
				rule, ok := item.(map[string]any)
				if ok && strings.TrimSpace(fmt.Sprint(rule["outboundTag"])) == APITag && containsStringList(rule["inboundTag"], APITag) {
					continue
				}
				rules = append(rules, item)
			}
			routing["rules"] = rules
		}
		return
	}

	cfg["stats"] = map[string]any{}
	policy, _ := cfg["policy"].(map[string]any)
	if policy == nil {
		policy = map[string]any{}
		cfg["policy"] = policy
	}
	system, _ := policy["system"].(map[string]any)
	if system == nil {
		system = map[string]any{}
		policy["system"] = system
	}
	system["statsInboundUplink"] = true
	system["statsInboundDownlink"] = true
	system["statsOutboundUplink"] = true
	system["statsOutboundDownlink"] = true

	api, _ := cfg["api"].(map[string]any)
	if api == nil {
		api = map[string]any{}
		cfg["api"] = api
	}
	tag := strings.TrimSpace(fmt.Sprint(api["tag"]))
	if tag == "" || tag == "<nil>" {
		tag = APITag
		api["tag"] = tag
	}
	services := map[string]bool{"StatsService": true}
	for _, service := range Services(api) {
		services[service] = true
	}
	serviceList := []any{}
	for _, service := range sortedKeys(services) {
		serviceList = append(serviceList, service)
	}
	api["services"] = serviceList

	inbounds := asArray(cfg["inbounds"])
	hasInbound := false
	for _, item := range inbounds {
		inbound, ok := item.(map[string]any)
		if !ok || strings.TrimSpace(fmt.Sprint(inbound["tag"])) != tag {
			continue
		}
		hasInbound = true
		if strings.TrimSpace(fmt.Sprint(inbound["listen"])) == "" || fmt.Sprint(inbound["listen"]) == "<nil>" {
			inbound["listen"] = "127.0.0.1"
		}
		if number(inbound["port"], 0) == 0 {
			inbound["port"] = APIPort
		}
		if strings.TrimSpace(fmt.Sprint(inbound["protocol"])) == "" || fmt.Sprint(inbound["protocol"]) == "<nil>" {
			inbound["protocol"] = "dokodemo-door"
		}
		if _, ok := inbound["settings"].(map[string]any); !ok {
			inbound["settings"] = map[string]any{"address": "127.0.0.1"}
		}
	}
	if !hasInbound {
		inbounds = append(inbounds, map[string]any{
			"tag":      tag,
			"listen":   "127.0.0.1",
			"port":     APIPort,
			"protocol": "dokodemo-door",
			"settings": map[string]any{"address": "127.0.0.1"},
		})
		cfg["inbounds"] = inbounds
	}
	routing, _ := cfg["routing"].(map[string]any)
	if routing == nil {
		routing = map[string]any{"domainStrategy": "AsIs"}
		cfg["routing"] = routing
	}
	rules := asArray(routing["rules"])
	hasRule := false
	for _, item := range rules {
		rule, ok := item.(map[string]any)
		if ok && strings.TrimSpace(fmt.Sprint(rule["outboundTag"])) == tag && containsStringList(rule["inboundTag"], tag) {
			hasRule = true
			break
		}
	}
	if !hasRule {
		routing["rules"] = append([]any{map[string]any{"type": "field", "inboundTag": []any{tag}, "outboundTag": tag}}, rules...)
	}
}

func Services(api map[string]any) []string {
	services := []string{}
	for _, item := range asArray(api["services"]) {
		value := strings.TrimSpace(fmt.Sprint(item))
		if value != "" && value != "<nil>" {
			services = append(services, value)
		}
	}
	return services
}

func HasService(api map[string]any) bool {
	for _, service := range Services(api) {
		if service == "StatsService" {
			return true
		}
	}
	return false
}

func OutboundKind(tag, protocol string) string {
	normalizedTag := strings.ToLower(strings.TrimSpace(tag))
	normalizedProtocol := strings.ToLower(strings.TrimSpace(protocol))
	switch {
	case strings.HasPrefix(normalizedTag, fragmentOutboundTagPrefix):
		return "system"
	case normalizedProtocol == "freedom" || normalizedTag == "direct":
		return "direct"
	case normalizedProtocol == "blackhole" || normalizedTag == "block":
		return "block"
	case normalizedTag == "" || normalizedTag == "api" || normalizedTag == APITag:
		return "system"
	default:
		return "proxy"
	}
}

func OutboundProtocols(cfg map[string]any) map[string]string {
	result := map[string]string{}
	for _, item := range asArray(cfg["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if !ok {
			continue
		}
		tag := strings.TrimSpace(fmt.Sprint(outbound["tag"]))
		if tag == "" || tag == "<nil>" {
			continue
		}
		result[tag] = strings.TrimSpace(fmt.Sprint(outbound["protocol"]))
	}
	return result
}

func ParseOutput(stdout string) map[string]uint64 {
	counters := map[string]uint64{}
	var payload struct {
		Stat []struct {
			Name  string `json:"name"`
			Value uint64 `json:"value"`
		} `json:"stat"`
		Stats []struct {
			Name  string `json:"name"`
			Value uint64 `json:"value"`
		} `json:"stats"`
	}
	if json.Unmarshal([]byte(stdout), &payload) == nil {
		for _, item := range payload.Stat {
			if item.Name != "" {
				counters[item.Name] = item.Value
			}
		}
		for _, item := range payload.Stats {
			if item.Name != "" {
				counters[item.Name] = item.Value
			}
		}
		if len(counters) > 0 {
			return counters
		}
	}
	re := regexp.MustCompile(`(?s)name:\s*"?([^"\s]+)"?.{0,120}?value:\s*(\d+)`)
	for _, match := range re.FindAllStringSubmatch(stdout, -1) {
		value, _ := strconv.ParseUint(match[2], 10, 64)
		counters[strings.TrimSpace(match[1])] = value
	}
	if len(counters) > 0 {
		return counters
	}
	lineRe := regexp.MustCompile(`(?m)(outbound>>>[^\s:]+>>>traffic>>>(?:uplink|downlink))\D+(\d+)`)
	for _, match := range lineRe.FindAllStringSubmatch(stdout, -1) {
		value, _ := strconv.ParseUint(match[2], 10, 64)
		counters[strings.TrimSpace(match[1])] = value
	}
	return counters
}

func TrafficResult(counters map[string]uint64, previous map[string]uint64, elapsed float64, protocols map[string]string, now time.Time) map[string]any {
	type outboundCounter struct {
		Tag      string
		Protocol string
		Kind     string
		Uplink   uint64
		Downlink uint64
		UpRate   float64
		DownRate float64
	}
	byTag := map[string]*outboundCounter{}
	for name, value := range counters {
		parts := strings.Split(name, ">>>")
		if len(parts) < 4 || parts[0] != "outbound" || parts[2] != "traffic" {
			continue
		}
		tag := parts[1]
		direction := parts[len(parts)-1]
		item := byTag[tag]
		if item == nil {
			protocol := protocols[tag]
			item = &outboundCounter{Tag: tag, Protocol: protocol, Kind: OutboundKind(tag, protocol)}
			byTag[tag] = item
		}
		if direction == "uplink" {
			item.Uplink = value
		} else if direction == "downlink" {
			item.Downlink = value
		}
		if elapsed > 0 {
			prior := previous[name]
			if value >= prior {
				rate := float64(value-prior) / elapsed
				if direction == "uplink" {
					item.UpRate = rate
				} else if direction == "downlink" {
					item.DownRate = rate
				}
			}
		}
	}
	for tag, protocol := range protocols {
		if byTag[tag] == nil {
			byTag[tag] = &outboundCounter{Tag: tag, Protocol: protocol, Kind: OutboundKind(tag, protocol)}
		}
	}
	tags := make([]string, 0, len(byTag))
	for tag := range byTag {
		tags = append(tags, tag)
	}
	sort.Strings(tags)
	groups := map[string]map[string]any{}
	for _, key := range []string{"proxy", "direct", "block", "system", "other"} {
		groups[key] = map[string]any{"uplink": uint64(0), "downlink": uint64(0), "upRate": float64(0), "downRate": float64(0), "count": 0}
	}
	outbounds := []map[string]any{}
	for _, tag := range tags {
		item := byTag[tag]
		kind := item.Kind
		if _, ok := groups[kind]; !ok {
			kind = "other"
		}
		group := groups[kind]
		group["uplink"] = group["uplink"].(uint64) + item.Uplink
		group["downlink"] = group["downlink"].(uint64) + item.Downlink
		group["upRate"] = group["upRate"].(float64) + item.UpRate
		group["downRate"] = group["downRate"].(float64) + item.DownRate
		group["count"] = group["count"].(int) + 1
		outbounds = append(outbounds, map[string]any{"tag": item.Tag, "protocol": item.Protocol, "kind": item.Kind, "uplink": item.Uplink, "downlink": item.Downlink, "upRate": item.UpRate, "downRate": item.DownRate})
	}
	return map[string]any{"outbounds": outbounds, "groups": groups, "updatedAt": now.Format(time.RFC3339)}
}

func asArray(value any) []any {
	if items, ok := value.([]any); ok {
		return items
	}
	return []any{}
}

func containsStringList(value any, expected string) bool {
	for _, item := range asArray(value) {
		if strings.TrimSpace(fmt.Sprint(item)) == expected {
			return true
		}
	}
	return strings.TrimSpace(fmt.Sprint(value)) == expected
}

func boolPayload(payload map[string]any, key string, fallback bool) bool {
	value, ok := payload[key]
	if !ok {
		return fallback
	}
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		clean := strings.ToLower(strings.TrimSpace(typed))
		return clean == "true" || clean == "1" || clean == "yes" || clean == "on"
	default:
		return fmt.Sprint(value) == "1"
	}
}

func number(value any, fallback int) int {
	var out int
	if _, err := fmt.Sscanf(fmt.Sprint(value), "%d", &out); err != nil {
		return fallback
	}
	return out
}

func sortedKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
