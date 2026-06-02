package main

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	rfw "github.com/AceAsket/RuOpenRay-Keenetic/internal/firewall"
)

const (
	ruOpenRayFirewallNftPath       = "/etc/ruopenray-ui/firewall.nft"
	ruOpenRayFirewallLegacyNftPath = "/etc/nftables.d/ruopenray.nft"
	ruOpenRayFirewallHotplugPath   = "/etc/hotplug.d/iface/90-ruopenray-tproxy"
	ruOpenRayFirewallEventPath     = "/etc/hotplug.d/firewall/90-ruopenray-tproxy"
	ruOpenRayKillSwitchDNSPath     = "/etc/ruopenray-ui/killswitch-dns-domains"
)

var killSwitchDomainPattern = regexp.MustCompile(`^[a-z0-9_.-]+(\.[a-z0-9_-]+)+$`)

func applyTProxyPolicyRouting(enabled bool) []map[string]any {
	if !enabled {
		return []map[string]any{
			runTimeout(5*time.Second, "ip", "rule", "del", "fwmark", "1/1", "table", "100"),
			runTimeout(5*time.Second, "ip", "rule", "del", "fwmark", "1", "table", "100"),
			runTimeout(5*time.Second, "ip", "route", "flush", "table", "100"),
		}
	}
	return []map[string]any{
		runTimeout(5*time.Second, "ip", "rule", "del", "fwmark", "1/1", "table", "100"),
		runTimeout(5*time.Second, "ip", "rule", "del", "fwmark", "1", "table", "100"),
		runTimeout(5*time.Second, "ip", "route", "flush", "table", "100"),
		runTimeout(5*time.Second, "ip", "rule", "add", "fwmark", "1/1", "table", "100"),
		runTimeout(5*time.Second, "ip", "route", "add", "local", "0.0.0.0/0", "dev", "lo", "table", "100"),
	}
}

func sanitizeKillSwitchDomains(value any) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, item := range stringList(value) {
		clean := strings.ToLower(strings.TrimSpace(item))
		clean = strings.TrimPrefix(clean, "*.")
		clean = strings.Trim(clean, ".")
		if net.ParseIP(clean) != nil {
			continue
		}
		if clean == "" || !killSwitchDomainPattern.MatchString(clean) || seen[clean] {
			continue
		}
		seen[clean] = true
		out = append(out, clean)
	}
	return out
}

func killSwitchNftsetEntry(domain string) string {
	return "/" + domain + "/4#inet#ruopenray#killswitch4"
}

func dnsmasqNftsetValuesForSet(setName string) []string {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return []string{}
	}
	out := fmt.Sprint(runTimeout(5*time.Second, "uci", "-q", "get", "dhcp.@dnsmasq[0].nftset")["stdout"])
	values := []string{}
	marker := "#inet#ruopenray#" + setName
	for _, item := range strings.Fields(strings.ReplaceAll(out, "\n", " ")) {
		clean := strings.TrimSpace(item)
		if strings.Contains(clean, marker) {
			values = append(values, clean)
		}
	}
	return values
}

func domainFromNftsetEntry(entry string, setName string) string {
	if !strings.Contains(entry, "#inet#ruopenray#"+setName) {
		return ""
	}
	if !strings.HasPrefix(entry, "/") {
		return ""
	}
	parts := strings.Split(entry, "/")
	if len(parts) < 3 {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func killSwitchNftsetValues() []string {
	return dnsmasqNftsetValuesForSet("killswitch4")
}

func killSwitchDomainFromNftsetEntry(entry string) string {
	return domainFromNftsetEntry(entry, "killswitch4")
}

func killSwitchNftsetStatus() map[string]any {
	values := killSwitchNftsetValues()
	domains := []string{}
	for _, entry := range values {
		if domain := killSwitchDomainFromNftsetEntry(entry); domain != "" {
			domains = append(domains, domain)
		}
	}
	return map[string]any{
		"available": runtime.GOOS != "windows" && commandExists("uci"),
		"active":    len(values) > 0,
		"count":     len(values),
		"domains":   domains,
		"set":       "inet ruopenray killswitch4",
	}
}

func routeNftsetEntry(domain string, setName string) string {
	return "/" + domain + "/4#inet#ruopenray#" + setName
}

func routeNftsetStatus(setName string) map[string]any {
	values := dnsmasqNftsetValuesForSet(setName)
	domains := []string{}
	for _, entry := range values {
		if domain := domainFromNftsetEntry(entry, setName); domain != "" {
			domains = append(domains, domain)
		}
	}
	return map[string]any{
		"available": runtime.GOOS != "windows" && commandExists("uci"),
		"active":    len(values) > 0,
		"count":     len(values),
		"domains":   domains,
		"set":       "inet ruopenray " + setName,
	}
}

func killSwitchDNSBlockEntries(domains []string) []string {
	entries := []string{}
	for _, domain := range sanitizeKillSwitchDomains(domains) {
		entries = append(entries, "/"+domain+"/0.0.0.0", "/"+domain+"/::")
	}
	return entries
}

func readKillSwitchDNSBlockDomains() []string {
	body, err := os.ReadFile(ruOpenRayKillSwitchDNSPath)
	if err != nil {
		return []string{}
	}
	return sanitizeKillSwitchDomains(strings.Fields(strings.ReplaceAll(string(body), ",", "\n")))
}

func killSwitchDNSBlockStatus() map[string]any {
	domains := readKillSwitchDNSBlockDomains()
	return map[string]any{
		"available": runtime.GOOS != "windows" && commandExists("uci"),
		"active":    len(domains) > 0,
		"count":     len(domains),
		"domains":   domains,
		"path":      ruOpenRayKillSwitchDNSPath,
	}
}

func applyKillSwitchDNSBlock(domains []string, enabled bool) []map[string]any {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return []map[string]any{{"ok": true, "skipped": true, "message": "uci unavailable"}}
	}
	steps := []map[string]any{}
	previousDomains := readKillSwitchDNSBlockDomains()
	previousEntries := killSwitchDNSBlockEntries(previousDomains)
	nextDomains := []string{}
	if enabled {
		nextDomains = sanitizeKillSwitchDomains(domains)
	}
	nextEntries := killSwitchDNSBlockEntries(nextDomains)
	if sameStringSet(previousEntries, nextEntries) {
		return []map[string]any{{"ok": true, "unchanged": true, "message": "dnsmasq DNS block already matches"}}
	}
	for _, entry := range previousEntries {
		steps = append(steps, runTimeout(5*time.Second, "uci", "del_list", "dhcp.@dnsmasq[0].address="+entry))
	}
	for _, entry := range nextEntries {
		steps = append(steps, runTimeout(5*time.Second, "uci", "add_list", "dhcp.@dnsmasq[0].address="+entry))
	}
	if len(nextDomains) > 0 {
		_ = os.MkdirAll(filepath.Dir(ruOpenRayKillSwitchDNSPath), 0o755)
		_ = os.WriteFile(ruOpenRayKillSwitchDNSPath, []byte(strings.Join(nextDomains, "\n")+"\n"), 0o644)
	} else {
		_ = os.Remove(ruOpenRayKillSwitchDNSPath)
	}
	steps = append(steps, runTimeout(5*time.Second, "uci", "commit", "dhcp"))
	if commandExists("/etc/init.d/dnsmasq") {
		steps = append(steps, runTimeout(15*time.Second, "/etc/init.d/dnsmasq", "restart"))
	}
	return steps
}

func applyKillSwitchDomainProtection(domains []string, enabled bool, mode string) []map[string]any {
	if mode == "nftset" {
		steps := applyKillSwitchDNSBlock(nil, false)
		return append(steps, applyKillSwitchNftsets(domains, enabled)...)
	}
	steps := applyKillSwitchNftsets(nil, false)
	return append(steps, applyKillSwitchDNSBlock(domains, enabled)...)
}

func applyKillSwitchNftsets(domains []string, enabled bool) []map[string]any {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return []map[string]any{{"ok": true, "skipped": true, "message": "uci unavailable"}}
	}
	steps := []map[string]any{}
	existing := killSwitchNftsetValues()
	desired := []string{}
	if enabled {
		for _, domain := range sanitizeKillSwitchDomains(domains) {
			desired = append(desired, killSwitchNftsetEntry(domain))
		}
	}
	if sameStringSet(existing, desired) {
		return []map[string]any{{"ok": true, "unchanged": true, "message": "dnsmasq nftset already matches"}}
	}
	for _, entry := range existing {
		steps = append(steps, runTimeout(5*time.Second, "uci", "del_list", "dhcp.@dnsmasq[0].nftset="+entry))
	}
	for _, entry := range desired {
		steps = append(steps, runTimeout(5*time.Second, "uci", "add_list", "dhcp.@dnsmasq[0].nftset="+entry))
	}
	steps = append(steps, runTimeout(5*time.Second, "uci", "commit", "dhcp"))
	if commandExists("/etc/init.d/dnsmasq") {
		steps = append(steps, runTimeout(15*time.Second, "/etc/init.d/dnsmasq", "restart"))
	}
	return steps
}

func applyRouteNftsets(setName string, domains []string, enabled bool) []map[string]any {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return []map[string]any{{"ok": true, "skipped": true, "message": "uci unavailable"}}
	}
	steps := []map[string]any{}
	existing := dnsmasqNftsetValuesForSet(setName)
	desired := []string{}
	if enabled {
		for _, domain := range sanitizeKillSwitchDomains(domains) {
			desired = append(desired, routeNftsetEntry(domain, setName))
		}
	}
	if sameStringSet(existing, desired) {
		return []map[string]any{{"ok": true, "unchanged": true, "message": "dnsmasq route nftset already matches"}}
	}
	for _, entry := range existing {
		steps = append(steps, runTimeout(5*time.Second, "uci", "del_list", "dhcp.@dnsmasq[0].nftset="+entry))
	}
	for _, entry := range desired {
		steps = append(steps, runTimeout(5*time.Second, "uci", "add_list", "dhcp.@dnsmasq[0].nftset="+entry))
	}
	steps = append(steps, runTimeout(5*time.Second, "uci", "commit", "dhcp"))
	if commandExists("/etc/init.d/dnsmasq") {
		steps = append(steps, runTimeout(15*time.Second, "/etc/init.d/dnsmasq", "restart"))
	}
	return steps
}

func applyRouteDomainNftsets(payload map[string]any, bypassMode string) []map[string]any {
	steps := []map[string]any{}
	steps = append(steps, applyRouteNftsets("bypass4", stringList(payload["directDomains"]), bypassMode == "bypass")...)
	steps = append(steps, applyRouteNftsets("proxy4", stringList(payload["proxyDomains"]), bypassMode == "redirect")...)
	return steps
}

func sameStringSet(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	seen := map[string]int{}
	for _, item := range left {
		seen[item]++
	}
	for _, item := range right {
		seen[item]--
		if seen[item] < 0 {
			return false
		}
	}
	return true
}

func (s *serverState) firewallStatus() map[string]any {
	nftExists := false
	nftBody := ""
	if body, err := os.ReadFile(ruOpenRayFirewallNftPath); err == nil {
		nftExists = true
		nftBody = string(body)
	}
	hotplugExists := false
	if _, err := os.Stat(ruOpenRayFirewallHotplugPath); err == nil {
		hotplugExists = true
	}
	nftActive := runTimeout(5*time.Second, "nft", "list", "table", "inet", "ruopenray")
	activeNftBody := fmt.Sprint(nftActive["stdout"])
	statusBody := nftBody
	if strings.TrimSpace(statusBody) == "" && strings.TrimSpace(activeNftBody) != "" {
		statusBody = activeNftBody
	}
	ipRules := runTimeout(5*time.Second, "ip", "rule", "show")
	ipRoutes := runTimeout(5*time.Second, "ip", "route", "show", "table", "100")
	ipRulesText := fmt.Sprint(ipRules["stdout"])
	ipRuleActive := (strings.Contains(ipRulesText, "fwmark 0x1/0x1") || strings.Contains(ipRulesText, "fwmark 0x1 ")) && strings.Contains(ipRulesText, "lookup 100")
	ipRouteActive := strings.Contains(fmt.Sprint(ipRoutes["stdout"]), "local") && strings.Contains(fmt.Sprint(ipRoutes["stdout"]), "dev lo")
	routerMode := "unknown"
	if strings.Contains(statusBody, " tproxy ") {
		routerMode = "tproxy"
	} else if strings.Contains(statusBody, " redirect ") {
		routerMode = "redirect"
	}
	meta := parseFirewallStatusMeta(statusBody)
	if value := strings.TrimSpace(fmt.Sprint(meta["routerMode"])); value != "" && value != "<nil>" {
		routerMode = value
	}
	status := map[string]any{
		"ok":          true,
		"available":   runtime.GOOS != "windows" && commandExists("nft"),
		"persistent":  nftExists,
		"active":      nftActive["ok"] == true,
		"nftPath":     ruOpenRayFirewallNftPath,
		"hotplugPath": ruOpenRayFirewallHotplugPath,
		"hotplug":     hotplugExists,
		"routerMode":  routerMode,
		"ipRule":      ipRuleActive,
		"ipRoute":     ipRouteActive,
		"nft":         nftActive,
		"ipRules":     ipRules,
		"ipRoutes":    ipRoutes,
		"tproxyModules": tproxyModuleStatus(func() string {
			if commandExists("apk") {
				return "apk"
			}
			if commandExists("opkg") {
				return "opkg"
			}
			return ""
		}()),
		"killSwitchNftset":   killSwitchNftsetStatus(),
		"killSwitchDNSBlock": killSwitchDNSBlockStatus(),
		"directNftset":       routeNftsetStatus("bypass4"),
		"proxyNftset":        routeNftsetStatus("proxy4"),
		"needsPolicyFix":     routerMode == "tproxy" && (!ipRuleActive || !ipRouteActive || !hotplugExists),
	}
	for key, value := range meta {
		status[key] = value
	}
	return status
}

func parseFirewallStatusMeta(nftBody string) map[string]any {
	meta := map[string]any{}
	for _, line := range strings.Split(nftBody, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "# ruopenray-meta ") {
			continue
		}
		for _, field := range strings.Fields(strings.TrimPrefix(line, "# ruopenray-meta ")) {
			key, value, ok := strings.Cut(field, "=")
			if !ok {
				continue
			}
			switch key {
			case "blockQuic", "dnsIntercept", "killSwitch":
				meta[key] = value == "true"
			case "transparentPort":
				if port, err := strconv.Atoi(value); err == nil {
					meta[key] = port
				}
			case "ports", "devices", "killSwitchDevices", "killSwitchIps", "directIps", "proxyIps", "directDomains", "proxyDomains":
				if value == "" {
					meta[key] = []string{}
				} else {
					meta[key] = strings.Split(value, ",")
				}
			case "killSwitchDomains":
				if value == "" {
					meta[key] = []string{}
				} else {
					meta[key] = strings.Split(value, ",")
				}
			case "killSwitchDomainMode":
				if value != "nftset" {
					value = "dns-block"
				}
				meta[key] = value
			case "killSwitchDeviceMode":
				if value != "selected" && value != "exclude" {
					value = "all"
				}
				meta[key] = value
			default:
				meta[key] = value
			}
		}
		return meta
	}
	if strings.Contains(nftBody, " tproxy ") {
		meta["routerMode"] = "tproxy"
	} else if strings.Contains(nftBody, " redirect ") {
		meta["routerMode"] = "redirect"
	}
	if strings.Contains(nftBody, "set bypass4") {
		meta["bypassMode"] = "bypass"
	} else if strings.Contains(nftBody, "set proxy4") {
		meta["bypassMode"] = "redirect"
	} else if nftBody != "" {
		meta["bypassMode"] = "off"
	}
	if strings.Contains(nftBody, "RuOpenRay DNS Intercept") {
		meta["dnsIntercept"] = true
	}
	if strings.Contains(nftBody, "RuOpenRay Block QUIC") {
		meta["blockQuic"] = true
	}
	if strings.Contains(nftBody, " ip saddr ") {
		if strings.Contains(nftBody, " ip saddr ") && strings.Contains(nftBody, " return") {
			meta["deviceMode"] = "exclude"
		}
		if strings.Contains(nftBody, `iifname "br-lan" ip saddr `) {
			meta["deviceMode"] = "selected"
		}
	} else if nftBody != "" {
		meta["deviceMode"] = "all"
	}
	if ports := parseFirewallPortsFromBody(nftBody); len(ports) > 0 {
		meta["portMode"] = "custom"
		meta["ports"] = ports
	} else if nftBody != "" {
		meta["portMode"] = "all"
		meta["ports"] = []string{}
	}
	if port := parseFirewallTransparentPort(nftBody); port > 0 {
		meta["transparentPort"] = port
	}
	return meta
}

func parseFirewallPortsFromBody(nftBody string) []string {
	for _, line := range strings.Split(nftBody, "\n") {
		if strings.Contains(line, "DNS Intercept") || strings.Contains(line, "Block QUIC") || strings.Contains(line, "Kill Switch") {
			continue
		}
		for _, marker := range []string{" th dport ", " tcp dport ", " udp dport "} {
			index := strings.Index(line, marker)
			if index < 0 {
				continue
			}
			rest := strings.TrimSpace(line[index+len(marker):])
			if strings.HasPrefix(rest, "{") {
				end := strings.Index(rest, "}")
				if end < 0 {
					continue
				}
				values := []string{}
				for _, item := range strings.Split(strings.Trim(rest[:end+1], "{} \t\r\n"), ",") {
					clean := strings.TrimSpace(item)
					if clean != "" {
						values = append(values, clean)
					}
				}
				return values
			}
			end := 0
			for end < len(rest) && ((rest[end] >= '0' && rest[end] <= '9') || rest[end] == '-') {
				end++
			}
			if end > 0 {
				return []string{rest[:end]}
			}
		}
	}
	return []string{}
}

func parseFirewallTransparentPort(nftBody string) int {
	index := strings.Index(nftBody, " to :")
	if index < 0 {
		return 0
	}
	rest := nftBody[index+5:]
	end := 0
	for end < len(rest) && rest[end] >= '0' && rest[end] <= '9' {
		end++
	}
	if end == 0 {
		return 0
	}
	port, _ := strconv.Atoi(rest[:end])
	return port
}

func (s *serverState) firewallSnapshot() map[string]any {
	status := s.firewallStatus()
	nftBody := ""
	if body, err := os.ReadFile(ruOpenRayFirewallNftPath); err == nil {
		nftBody = string(body)
	}
	hotplugBody := ""
	if body, err := os.ReadFile(ruOpenRayFirewallHotplugPath); err == nil {
		hotplugBody = string(body)
	}
	return map[string]any{
		"ok":          true,
		"status":      status,
		"nftBody":     nftBody,
		"hotplugBody": hotplugBody,
	}
}

func (s *serverState) previewFirewall(payload map[string]any) map[string]any {
	payload = s.expandFirewallGeoPayload(payload)
	body, meta := rfw.NativeNft(payload)
	return map[string]any{
		"ok":           true,
		"nft":          body,
		"meta":         meta,
		"geoExpansion": payload["geoExpansion"],
		"status":       s.firewallStatus(),
	}
}

func (s *serverState) applyFirewall(payload map[string]any) map[string]any {
	if runtime.GOOS == "windows" || !commandExists("nft") {
		return map[string]any{"ok": false, "available": false, "error": "nftables недоступен на этой системе"}
	}
	payload = s.expandFirewallGeoPayload(payload)
	body, meta := rfw.NativeNft(payload)
	routerMode := fmt.Sprint(meta["routerMode"])
	steps := []map[string]any{}
	if err := os.MkdirAll(filepath.Dir(ruOpenRayFirewallNftPath), 0o755); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "nft": body, "meta": meta}
	}
	if err := os.WriteFile(ruOpenRayFirewallNftPath, []byte(body), 0o644); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "nft": body, "meta": meta}
	}
	_ = os.Remove(ruOpenRayFirewallLegacyNftPath)
	if routerMode == "tproxy" {
		_ = os.MkdirAll(filepath.Dir(ruOpenRayFirewallHotplugPath), 0o755)
		hotplug := []byte(rfw.HotplugScript())
		if err := os.WriteFile(ruOpenRayFirewallHotplugPath, hotplug, 0o755); err != nil {
			return map[string]any{"ok": false, "error": err.Error(), "nft": body, "meta": meta}
		}
		_ = os.MkdirAll(filepath.Dir(ruOpenRayFirewallEventPath), 0o755)
		if err := os.WriteFile(ruOpenRayFirewallEventPath, hotplug, 0o755); err != nil {
			return map[string]any{"ok": false, "error": err.Error(), "nft": body, "meta": meta}
		}
	} else {
		_ = os.Remove(ruOpenRayFirewallHotplugPath)
		_ = os.Remove(ruOpenRayFirewallEventPath)
	}
	if commandExists("/etc/init.d/firewall") {
		steps = append(steps, runTimeout(20*time.Second, "/etc/init.d/firewall", "reload"))
	}
	steps = append(steps, runTimeout(5*time.Second, "nft", "delete", "table", "inet", "ruopenray"))
	steps = append(steps, runTimeout(10*time.Second, "nft", "-f", ruOpenRayFirewallNftPath))
	steps = append(steps, applyTProxyPolicyRouting(routerMode == "tproxy")...)
	steps = append(steps, applyKillSwitchDomainProtection(
		stringList(payload["killSwitchDomains"]),
		boolPayload(payload, "killSwitch", false),
		rfw.PayloadString(payload, "killSwitchDomainMode", "dns-block"),
	)...)
	steps = append(steps, applyRouteDomainNftsets(payload, fmt.Sprint(meta["bypassMode"]))...)
	status := s.firewallStatus()
	ok := rfw.AllStepsOK(steps) && status["active"] == true
	if routerMode == "tproxy" {
		ok = ok && status["ipRule"] == true && status["ipRoute"] == true
	}
	return map[string]any{"ok": ok, "nft": body, "meta": meta, "geoExpansion": payload["geoExpansion"], "steps": steps, "status": status}
}

func (s *serverState) restoreFirewallSnapshot(payload map[string]any) map[string]any {
	rawSnapshot := payload
	if nested, ok := payload["snapshot"].(map[string]any); ok {
		rawSnapshot = nested
	}
	nftBody := cleanPayloadString(rawSnapshot, "nftBody")
	hotplugBody := cleanPayloadString(rawSnapshot, "hotplugBody")
	if strings.TrimSpace(nftBody) == "" {
		return s.disableFirewall()
	}
	steps := []map[string]any{}
	if err := os.MkdirAll(filepath.Dir(ruOpenRayFirewallNftPath), 0o755); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if err := os.WriteFile(ruOpenRayFirewallNftPath, []byte(nftBody), 0o644); err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	if strings.TrimSpace(hotplugBody) != "" {
		_ = os.MkdirAll(filepath.Dir(ruOpenRayFirewallHotplugPath), 0o755)
		hotplug := []byte(hotplugBody)
		if err := os.WriteFile(ruOpenRayFirewallHotplugPath, hotplug, 0o755); err != nil {
			return map[string]any{"ok": false, "error": err.Error()}
		}
		_ = os.MkdirAll(filepath.Dir(ruOpenRayFirewallEventPath), 0o755)
		if err := os.WriteFile(ruOpenRayFirewallEventPath, hotplug, 0o755); err != nil {
			return map[string]any{"ok": false, "error": err.Error()}
		}
	} else {
		_ = os.Remove(ruOpenRayFirewallHotplugPath)
		_ = os.Remove(ruOpenRayFirewallEventPath)
	}
	_ = os.Remove(ruOpenRayFirewallLegacyNftPath)
	if commandExists("/etc/init.d/firewall") {
		steps = append(steps, runTimeout(20*time.Second, "/etc/init.d/firewall", "reload"))
	}
	if commandExists("nft") {
		steps = append(steps, runTimeout(5*time.Second, "nft", "delete", "table", "inet", "ruopenray"))
		steps = append(steps, runTimeout(10*time.Second, "nft", "-f", ruOpenRayFirewallNftPath))
	}
	routerMode := "redirect"
	if strings.Contains(nftBody, " tproxy ") {
		routerMode = "tproxy"
	}
	steps = append(steps, applyTProxyPolicyRouting(routerMode == "tproxy")...)
	meta := parseFirewallStatusMeta(nftBody)
	steps = append(steps, applyKillSwitchDomainProtection(
		stringList(meta["killSwitchDomains"]),
		meta["killSwitch"] == true,
		fmt.Sprint(meta["killSwitchDomainMode"]),
	)...)
	steps = append(steps, applyRouteDomainNftsets(meta, fmt.Sprint(meta["bypassMode"]))...)
	status := s.firewallStatus()
	ok := rfw.AllStepsOK(steps) && status["active"] == true
	if routerMode == "tproxy" {
		ok = ok && status["ipRule"] == true && status["ipRoute"] == true
	}
	return map[string]any{"ok": ok, "steps": steps, "status": status}
}

func (s *serverState) disableFirewall() map[string]any {
	steps := []map[string]any{}
	_ = os.Remove(ruOpenRayFirewallNftPath)
	_ = os.Remove(ruOpenRayFirewallLegacyNftPath)
	_ = os.Remove(ruOpenRayFirewallHotplugPath)
	_ = os.Remove(ruOpenRayFirewallEventPath)
	if commandExists("/etc/init.d/firewall") {
		steps = append(steps, runTimeout(20*time.Second, "/etc/init.d/firewall", "reload"))
	}
	if commandExists("nft") {
		steps = append(steps, runTimeout(5*time.Second, "nft", "delete", "table", "inet", "ruopenray"))
	}
	steps = append(steps, applyTProxyPolicyRouting(false)...)
	steps = append(steps, applyKillSwitchNftsets(nil, false)...)
	steps = append(steps, applyKillSwitchDNSBlock(nil, false)...)
	steps = append(steps, applyRouteNftsets("bypass4", nil, false)...)
	steps = append(steps, applyRouteNftsets("proxy4", nil, false)...)
	status := s.firewallStatus()
	return map[string]any{"ok": rfw.AllStepsOK(steps), "steps": steps, "status": status}
}
