package firewall

import (
	"fmt"
	"net"
	"regexp"
	"strconv"
	"strings"
)

const DefaultNftPath = "/etc/ruopenray-ui/firewall.nft"

func PayloadString(payload map[string]any, key, fallback string) string {
	value := strings.TrimSpace(fmt.Sprint(payload[key]))
	if value == "" || value == "<nil>" {
		return fallback
	}
	return value
}

func PortList(payload map[string]any) []string {
	if PayloadString(payload, "portMode", "custom") == "all" {
		return []string{}
	}
	ports := []string{}
	for _, item := range stringList(payload["ports"]) {
		clean := strings.ReplaceAll(strings.TrimSpace(item), ":", "-")
		if regexp.MustCompile(`^\d+(-\d+)?$`).MatchString(clean) {
			ports = append(ports, clean)
		}
	}
	if len(ports) == 0 {
		return []string{"80", "443"}
	}
	return ports
}

func DNSIntercept(payload map[string]any) bool {
	return boolPayload(payload, "dnsIntercept", true)
}

func PortListCovers(ports []string, port int) bool {
	if len(ports) == 0 {
		return true
	}
	for _, item := range ports {
		start, end, ok := portRange(item)
		if ok && port >= start && port <= end {
			return true
		}
	}
	return false
}

func IPList(value any) []string {
	out := []string{}
	for _, item := range stringList(value) {
		if net.ParseIP(item) != nil {
			out = append(out, item)
		}
	}
	return out
}

func CIDRList(value any) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, item := range stringList(value) {
		clean := strings.TrimSpace(item)
		if clean == "" {
			continue
		}
		if ip := net.ParseIP(clean); ip != nil {
			if ip.To4() == nil {
				continue
			}
			clean = ip.String()
		} else {
			ip, network, err := net.ParseCIDR(clean)
			if err != nil || ip.To4() == nil {
				continue
			}
			clean = network.String()
		}
		if !seen[clean] {
			seen[clean] = true
			out = append(out, clean)
		}
	}
	return out
}

func mergeCIDRLists(lists ...[]string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, list := range lists {
		for _, item := range list {
			clean := strings.TrimSpace(item)
			if clean == "" || seen[clean] {
				continue
			}
			seen[clean] = true
			out = append(out, clean)
		}
	}
	return out
}

func NftSet(items []string) string {
	if len(items) == 0 {
		return ""
	}
	return "{ " + strings.Join(items, ", ") + " }"
}

func DportExpression(ports []string, protocol string) string {
	if len(ports) == 0 {
		return ""
	}
	if protocol == "tcp" {
		return " tcp dport " + NftSet(ports)
	}
	return " th dport " + NftSet(ports)
}

func NativeNft(payload map[string]any) (string, map[string]any) {
	routerMode := PayloadString(payload, "routerMode", "tproxy")
	if routerMode != "redirect" {
		routerMode = "tproxy"
	}
	bypassMode := PayloadString(payload, "bypassMode", "off")
	if bypassMode != "bypass" && bypassMode != "redirect" {
		bypassMode = "off"
	}
	deviceMode := PayloadString(payload, "deviceMode", "all")
	if deviceMode != "selected" && deviceMode != "exclude" {
		deviceMode = "all"
	}
	lanInterface := PayloadString(payload, "lanInterface", "br-lan")
	transparentPort := number(payload["transparentPort"], 52345)
	if transparentPort <= 0 || transparentPort > 65535 {
		transparentPort = 52345
	}
	ports := PortList(payload)
	devices := IPList(payload["devices"])
	selectedModeEmpty := deviceMode == "selected" && len(devices) == 0
	killSwitchDeviceMode := PayloadString(payload, "killSwitchDeviceMode", "all")
	if killSwitchDeviceMode != "selected" && killSwitchDeviceMode != "exclude" {
		killSwitchDeviceMode = "all"
	}
	killSwitchDevices := IPList(payload["killSwitchDevices"])
	killSwitchSelectedModeEmpty := killSwitchDeviceMode == "selected" && len(killSwitchDevices) == 0
	blockQuic := boolPayload(payload, "blockQuic", true)
	dnsIntercept := DNSIntercept(payload)
	killSwitch := boolPayload(payload, "killSwitch", false)
	killSwitchIPs := CIDRList(payload["killSwitchIps"])
	killSwitchDomains := stringList(payload["killSwitchDomains"])
	killSwitchDomainMode := PayloadString(payload, "killSwitchDomainMode", "dns-block")
	if killSwitchDomainMode != "nftset" {
		killSwitchDomainMode = "dns-block"
	}
	directIPs := CIDRList(payload["directIps"])
	proxyIPs := CIDRList(payload["proxyIps"])
	directDomains := stringList(payload["directDomains"])
	proxyDomains := stringList(payload["proxyDomains"])
	localBypass := []string{"0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.168.0.0/16", "224.0.0.0/3"}
	setLines := []string{}
	chainLines := []string{"  chain prerouting {"}
	if routerMode == "redirect" {
		chainLines = append(chainLines, "    type nat hook prerouting priority dstnat; policy accept;")
	} else {
		chainLines = append(chainLines, "    type filter hook prerouting priority mangle - 5; policy accept;")
	}
	chainLines = append(chainLines,
		fmt.Sprintf("    iifname != %q return", lanInterface),
	)
	if deviceMode == "exclude" && len(devices) > 0 {
		chainLines = append(chainLines, "    ip saddr "+NftSet(devices)+" return")
	}
	targetPrefix := fmt.Sprintf("    iifname %q ", lanInterface)
	if deviceMode == "selected" && len(devices) > 0 {
		targetPrefix += "ip saddr " + NftSet(devices) + " "
	}
	killSwitchPrefix := fmt.Sprintf("    iifname %q ", lanInterface)
	if killSwitchDeviceMode == "selected" && len(killSwitchDevices) > 0 {
		killSwitchPrefix += "ip saddr " + NftSet(killSwitchDevices) + " "
	}
	if killSwitchDeviceMode == "exclude" && len(killSwitchDevices) > 0 {
		killSwitchPrefix += "ip saddr != " + NftSet(killSwitchDevices) + " "
	}
	if !killSwitchSelectedModeEmpty && killSwitch && (len(killSwitchIPs) > 0 || (len(killSwitchDomains) > 0 && killSwitchDomainMode == "nftset")) {
		if len(killSwitchIPs) > 0 {
			setLines = append(setLines, "  set killswitch4 { type ipv4_addr; flags interval; elements = "+NftSet(killSwitchIPs)+"; }")
		} else {
			setLines = append(setLines, "  set killswitch4 { type ipv4_addr; flags interval; }")
		}
		if routerMode == "redirect" {
			chainLines = append(chainLines,
				killSwitchPrefix+"ip daddr @killswitch4 meta l4proto tcp redirect to :"+strconv.Itoa(transparentPort)+" comment \"RuOpenRay Kill Switch\"",
				killSwitchPrefix+"ip daddr @killswitch4 meta l4proto udp drop comment \"RuOpenRay Kill Switch UDP guard\"",
			)
		} else {
			chainLines = append(chainLines, killSwitchPrefix+"ip daddr @killswitch4 meta l4proto { tcp, udp } counter tproxy ip to 127.0.0.1:"+strconv.Itoa(transparentPort)+" meta mark set 1 comment \"RuOpenRay Kill Switch\"")
		}
	}
	if selectedModeEmpty {
		chainLines = append(chainLines, "    return comment \"RuOpenRay selected device list is empty\"")
	}
	chainLines = append(chainLines, "    ip daddr "+NftSet(localBypass)+" return")
	if !selectedModeEmpty && bypassMode == "bypass" {
		setLines = append(setLines, "  set bypass4 { type ipv4_addr; flags interval; elements = "+NftSet(mergeCIDRLists(localBypass, directIPs))+"; }")
		chainLines = append(chainLines,
			"    ip daddr @bypass4 return",
		)
	}
	if !selectedModeEmpty && dnsIntercept && !PortListCovers(ports, 53) {
		if routerMode == "redirect" {
			chainLines = append(chainLines,
				targetPrefix+"meta l4proto tcp tcp dport 53 redirect to :"+strconv.Itoa(transparentPort)+" comment \"RuOpenRay DNS Intercept\"",
				targetPrefix+"meta l4proto udp udp dport 53 drop comment \"RuOpenRay DNS UDP guard\"",
			)
		} else {
			chainLines = append(chainLines, targetPrefix+"meta l4proto { tcp, udp } th dport 53 counter tproxy ip to 127.0.0.1:"+strconv.Itoa(transparentPort)+" meta mark set 1 comment \"RuOpenRay DNS Intercept\"")
		}
	}
	if !selectedModeEmpty && blockQuic {
		chainLines = append(chainLines, targetPrefix+"udp dport 443 drop comment \"RuOpenRay Block QUIC\"")
	}
	if !selectedModeEmpty && bypassMode == "redirect" {
		if len(proxyIPs) > 0 {
			setLines = append(setLines, "  set proxy4 { type ipv4_addr; flags interval; elements = "+NftSet(proxyIPs)+"; }")
		} else {
			setLines = append(setLines, "  set proxy4 { type ipv4_addr; flags interval; }")
		}
		targetPrefix += "ip daddr @proxy4 "
	}
	if !selectedModeEmpty {
		if routerMode == "redirect" {
			redirectMatch := "meta l4proto tcp"
			if len(ports) > 0 {
				redirectMatch = "tcp dport " + NftSet(ports)
			}
			chainLines = append(chainLines, targetPrefix+redirectMatch+" redirect to :"+strconv.Itoa(transparentPort))
		} else {
			chainLines = append(chainLines, targetPrefix+"meta l4proto { tcp, udp }"+DportExpression(ports, "meta")+" counter tproxy ip to 127.0.0.1:"+strconv.Itoa(transparentPort)+" meta mark set 1")
		}
	}
	chainLines = append(chainLines, "  }")
	meta := map[string]any{
		"routerMode":           routerMode,
		"bypassMode":           bypassMode,
		"deviceMode":           deviceMode,
		"devices":              devices,
		"ports":                ports,
		"portMode":             PayloadString(payload, "portMode", "custom"),
		"blockQuic":            blockQuic,
		"dnsIntercept":         dnsIntercept,
		"lanInterface":         lanInterface,
		"transparentPort":      transparentPort,
		"killSwitch":           killSwitch,
		"killSwitchDeviceMode": killSwitchDeviceMode,
		"killSwitchDevices":    killSwitchDevices,
		"killSwitchIps":        killSwitchIPs,
		"killSwitchDomains":    killSwitchDomains,
		"killSwitchDomainMode": killSwitchDomainMode,
		"directIps":            directIPs,
		"proxyIps":             proxyIPs,
		"directDomains":        directDomains,
		"proxyDomains":         proxyDomains,
		"path":                 DefaultNftPath,
	}
	metaLine := fmt.Sprintf(
		"# ruopenray-meta routerMode=%s bypassMode=%s deviceMode=%s devices=%s portMode=%s ports=%s blockQuic=%t dnsIntercept=%t transparentPort=%d lanInterface=%s killSwitch=%t killSwitchDeviceMode=%s killSwitchDevices=%s killSwitchDomainMode=%s killSwitchIps=%s killSwitchDomains=%s directIps=%s proxyIps=%s directDomains=%s proxyDomains=%s",
		routerMode,
		bypassMode,
		deviceMode,
		strings.Join(devices, ","),
		PayloadString(payload, "portMode", "custom"),
		strings.Join(ports, ","),
		blockQuic,
		dnsIntercept,
		transparentPort,
		lanInterface,
		killSwitch,
		killSwitchDeviceMode,
		strings.Join(killSwitchDevices, ","),
		killSwitchDomainMode,
		strings.Join(killSwitchIPs, ","),
		strings.Join(killSwitchDomains, ","),
		strings.Join(directIPs, ","),
		strings.Join(proxyIPs, ","),
		strings.Join(directDomains, ","),
		strings.Join(proxyDomains, ","),
	)
	lines := []string{metaLine, "table inet ruopenray {"}
	lines = append(lines, setLines...)
	lines = append(lines, chainLines...)
	lines = append(lines, "}")
	return strings.Join(lines, "\n") + "\n", meta
}

func HotplugScript() string {
	return `#!/bin/sh
[ "$ACTION" = "ifup" ] || [ "$ACTION" = "ifupdate" ] || [ "$ACTION" = "ifdown" ] || exit 0
NFT_FILE="/etc/ruopenray-ui/firewall.nft"
nft delete table inet ruopenray 2>/dev/null
[ -s "$NFT_FILE" ] && nft -f "$NFT_FILE" 2>/dev/null
ip rule del fwmark 1 table 100 2>/dev/null
ip rule del fwmark 1/1 table 100 2>/dev/null
ip route flush table 100 2>/dev/null
ip rule add fwmark 1/1 table 100 2>/dev/null
ip route add local 0.0.0.0/0 dev lo table 100 2>/dev/null
exit 0
`
}

func StepOK(step map[string]any) bool {
	stderr := strings.TrimSpace(fmt.Sprint(step["stderr"]))
	stdout := strings.TrimSpace(fmt.Sprint(step["stdout"]))
	message := strings.TrimSpace(fmt.Sprint(step["message"]))
	combined := strings.ToLower(stderr + " " + stdout + " " + message)
	missing := strings.Contains(combined, "no such file") || strings.Contains(combined, "not found") || strings.Contains(combined, "no such process")
	if strings.Contains(combined, "error:") && !missing {
		return false
	}
	if step["ok"] == true {
		return true
	}
	return missing
}

func AllStepsOK(steps []map[string]any) bool {
	for _, step := range steps {
		if !StepOK(step) {
			return false
		}
	}
	return true
}

func stringList(value any) []string {
	var out []string
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			if clean := strings.TrimSpace(fmt.Sprint(item)); clean != "" && clean != "<nil>" {
				out = append(out, clean)
			}
		}
	case []string:
		for _, item := range typed {
			if clean := strings.TrimSpace(item); clean != "" {
				out = append(out, clean)
			}
		}
	case string:
		for _, item := range strings.Split(typed, ",") {
			if clean := strings.TrimSpace(item); clean != "" {
				out = append(out, clean)
			}
		}
	}
	return out
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

func portRange(value string) (int, int, bool) {
	parts := strings.Split(value, "-")
	if len(parts) == 1 {
		port, err := strconv.Atoi(strings.TrimSpace(parts[0]))
		if err != nil || port < 0 || port > 65535 {
			return 0, 0, false
		}
		return port, port, true
	}
	if len(parts) != 2 {
		return 0, 0, false
	}
	start, startErr := strconv.Atoi(strings.TrimSpace(parts[0]))
	end, endErr := strconv.Atoi(strings.TrimSpace(parts[1]))
	if startErr != nil || endErr != nil || start < 0 || end > 65535 || start > end {
		return 0, 0, false
	}
	return start, end, true
}

func number(value any, fallback int) int {
	clean := strings.TrimSpace(fmt.Sprint(value))
	if clean == "" || clean == "<nil>" {
		return fallback
	}
	parsed, err := strconv.Atoi(clean)
	if err != nil {
		return fallback
	}
	return parsed
}
