package main

import (
	"fmt"
	"strings"
)

const (
	firewallGeoIPLimit     = 50000
	firewallGeoDomainLimit = 20000
)

type firewallGeoExpansion struct {
	GeoIPRefs    int      `json:"geoipRefs"`
	GeoSiteRefs  int      `json:"geositeRefs"`
	ExtRefs      int      `json:"extRefs"`
	AddedIPs     int      `json:"addedIps"`
	AddedDomains int      `json:"addedDomains"`
	Skipped      int      `json:"skipped"`
	Warnings     []string `json:"warnings,omitempty"`
}

func (s *serverState) expandFirewallGeoPayload(payload map[string]any) map[string]any {
	next := clonePayloadMap(payload)
	expansion := firewallGeoExpansion{}

	addIP := func(values *[]string, seen map[string]bool, value string) {
		clean := strings.TrimSpace(value)
		if clean == "" || seen[clean] || len(*values) >= firewallGeoIPLimit {
			if clean != "" && len(*values) >= firewallGeoIPLimit {
				expansion.Skipped++
			}
			return
		}
		seen[clean] = true
		*values = append(*values, clean)
		expansion.AddedIPs++
	}
	addDomain := func(values *[]string, seen map[string]bool, value string) {
		clean := strings.ToLower(strings.TrimSpace(value))
		clean = strings.TrimPrefix(clean, "*.")
		clean = strings.Trim(clean, ".")
		if clean == "" || seen[clean] || len(*values) >= firewallGeoDomainLimit {
			if clean != "" && len(*values) >= firewallGeoDomainLimit {
				expansion.Skipped++
			}
			return
		}
		seen[clean] = true
		*values = append(*values, clean)
		expansion.AddedDomains++
	}

	expandGeoIP := func(target string, values *[]string, seen map[string]bool, refs []string) {
		for _, code := range refs {
			code = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(code, "geoip:")))
			if code == "" {
				continue
			}
			expansion.GeoIPRefs++
			report := s.geoCatalogReport("geoip", code, true, "geoip.dat")
			if !report.OK || report.Stderr != "" {
				expansion.Warnings = append(expansion.Warnings, fmt.Sprintf("%s geoip:%s не найден в geoip.dat: %s", target, code, strings.TrimSpace(report.Stderr)))
				continue
			}
			for _, item := range report.Items {
				addIP(values, seen, item)
			}
			if report.Truncated {
				expansion.Warnings = append(expansion.Warnings, fmt.Sprintf("%s geoip:%s открыт частично", target, code))
			}
		}
	}

	expandGeoSite := func(target string, values *[]string, seen map[string]bool, refs []string) {
		for _, code := range refs {
			code = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(code, "geosite:")))
			if code == "" {
				continue
			}
			expansion.GeoSiteRefs++
			report := s.geoCatalogReport("geosite", code, true, "geosite.dat")
			if !report.OK || report.Stderr != "" {
				expansion.Warnings = append(expansion.Warnings, fmt.Sprintf("%s geosite:%s не найден в geosite.dat: %s", target, code, strings.TrimSpace(report.Stderr)))
				continue
			}
			for _, item := range report.Items {
				if domain, ok := geoSiteFirewallDomain(item); ok {
					addDomain(values, seen, domain)
				} else {
					expansion.Skipped++
				}
			}
		}
	}

	expandExt := func(target string, values *[]string, seen map[string]bool, refs []string) {
		for _, ref := range refs {
			file, code, ok := parseFirewallExtRef(ref)
			if !ok {
				expansion.Warnings = append(expansion.Warnings, target+" не удалось разобрать "+ref)
				continue
			}
			expansion.ExtRefs++
			report := s.geoCatalogReport("geosite", code, true, file)
			if !report.OK || report.Stderr != "" {
				expansion.Warnings = append(expansion.Warnings, fmt.Sprintf("%s %s:%s не найден: %s", target, file, code, strings.TrimSpace(report.Stderr)))
				continue
			}
			for _, item := range report.Items {
				if domain, ok := geoSiteFirewallDomain(item); ok {
					addDomain(values, seen, domain)
				} else {
					expansion.Skipped++
				}
			}
		}
	}

	killSwitchIPs := stringList(next["killSwitchIps"])
	killSwitchDomains := stringList(next["killSwitchDomains"])
	directIPs := stringList(next["directIps"])
	proxyIPs := stringList(next["proxyIps"])
	directDomains := stringList(next["directDomains"])
	proxyDomains := stringList(next["proxyDomains"])
	killSwitchIPSeen := stringSet(killSwitchIPs)
	killSwitchDomainSeen := stringSet(killSwitchDomains)
	directIPSeen := stringSet(directIPs)
	proxyIPSeen := stringSet(proxyIPs)
	directDomainSeen := stringSet(directDomains)
	proxyDomainSeen := stringSet(proxyDomains)

	expandGeoIP("защита", &killSwitchIPs, killSwitchIPSeen, stringList(next["killSwitchGeoip"]))
	expandGeoSite("защита", &killSwitchDomains, killSwitchDomainSeen, stringList(next["killSwitchGeosite"]))
	expandExt("защита", &killSwitchDomains, killSwitchDomainSeen, stringList(next["killSwitchExt"]))
	expandGeoIP("direct", &directIPs, directIPSeen, stringList(next["directGeoip"]))
	expandGeoSite("direct", &directDomains, directDomainSeen, stringList(next["directGeosite"]))
	expandExt("direct", &directDomains, directDomainSeen, stringList(next["directExt"]))
	expandGeoIP("proxy", &proxyIPs, proxyIPSeen, stringList(next["proxyGeoip"]))
	expandGeoSite("proxy", &proxyDomains, proxyDomainSeen, stringList(next["proxyGeosite"]))
	expandExt("proxy", &proxyDomains, proxyDomainSeen, stringList(next["proxyExt"]))

	if len(killSwitchIPs) >= firewallGeoIPLimit || len(directIPs) >= firewallGeoIPLimit || len(proxyIPs) >= firewallGeoIPLimit {
		expansion.Warnings = append(expansion.Warnings, fmt.Sprintf("IP-список ограничен %d записями", firewallGeoIPLimit))
	}
	if len(killSwitchDomains) >= firewallGeoDomainLimit || len(directDomains) >= firewallGeoDomainLimit || len(proxyDomains) >= firewallGeoDomainLimit {
		expansion.Warnings = append(expansion.Warnings, fmt.Sprintf("список доменов ограничен %d записями", firewallGeoDomainLimit))
	}
	next["killSwitchIps"] = killSwitchIPs
	next["killSwitchDomains"] = killSwitchDomains
	next["directIps"] = directIPs
	next["proxyIps"] = proxyIPs
	next["directDomains"] = directDomains
	next["proxyDomains"] = proxyDomains
	next["geoExpansion"] = map[string]any{
		"geoipRefs":     expansion.GeoIPRefs,
		"geositeRefs":   expansion.GeoSiteRefs,
		"extRefs":       expansion.ExtRefs,
		"addedIps":      expansion.AddedIPs,
		"addedDomains":  expansion.AddedDomains,
		"skipped":       expansion.Skipped,
		"warnings":      expansion.Warnings,
		"ipLimit":       firewallGeoIPLimit,
		"domainLimit":   firewallGeoDomainLimit,
		"totalIps":      len(killSwitchIPs) + len(directIPs) + len(proxyIPs),
		"totalDomains":  len(killSwitchDomains) + len(directDomains) + len(proxyDomains),
		"domainFormats": "domain/full; regexp/keyword пропускаются для firewall",
	}
	return next
}

func clonePayloadMap(payload map[string]any) map[string]any {
	next := make(map[string]any, len(payload)+1)
	for key, value := range payload {
		next[key] = value
	}
	return next
}

func stringSet(items []string) map[string]bool {
	seen := map[string]bool{}
	for _, item := range items {
		clean := strings.TrimSpace(item)
		if clean != "" {
			seen[clean] = true
		}
	}
	return seen
}

func geoSiteFirewallDomain(item string) (string, bool) {
	clean := strings.TrimSpace(item)
	for _, prefix := range []string{"domain:", "full:"} {
		if strings.HasPrefix(clean, prefix) {
			value := strings.TrimSpace(strings.TrimPrefix(clean, prefix))
			return value, value != ""
		}
	}
	if killSwitchDomainPattern.MatchString(clean) {
		return clean, true
	}
	return "", false
}

func parseFirewallExtRef(ref string) (string, string, bool) {
	clean := strings.TrimSpace(ref)
	if strings.HasPrefix(strings.ToLower(clean), "ext:") {
		clean = clean[4:]
	}
	clean = strings.Trim(clean, "\"'")
	if clean == "" {
		return "", "", false
	}
	file, code, ok := strings.Cut(clean, ":")
	if !ok {
		return "", "", false
	}
	file = strings.TrimSpace(strings.Trim(file, "\"'"))
	code = strings.ToLower(strings.TrimSpace(strings.Trim(code, "\"'")))
	if file == "" || code == "" {
		return "", "", false
	}
	return file, code, true
}
