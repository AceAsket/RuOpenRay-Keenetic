package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

func (s *serverState) validateConfig(cfg map[string]any) map[string]any {
	if cfg == nil {
		var err error
		cfg, err = s.readActiveConfig()
		if err != nil {
			return map[string]any{"ok": false, "stderr": err.Error()}
		}
	}
	normalizeCatchAllRoutingRules(cfg)
	ensureFragmentOutboundsInConfig(cfg)
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": true, "stdout": "dev-mode: JSON корректен; бинарник xray на Windows не проверялся"}
	}
	body, _ := json.MarshalIndent(cfg, "", "  ")
	tmp := filepath.Join(s.cfg.DataDir, fmt.Sprintf(".test-%d.json", time.Now().UnixNano()))
	if err := os.WriteFile(tmp, body, 0o600); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	defer os.Remove(tmp)
	return s.runXray("run", "-test", "-config", tmp)
}

func (s *serverState) validateConfigWithGeoAudit(cfg map[string]any) map[string]any {
	result := s.validateConfig(cfg)
	if cfg == nil {
		var err error
		cfg, err = s.readActiveConfig()
		if err != nil {
			return result
		}
	}
	analysis := s.analyzeConfig(cfg)
	result["analysis"] = analysis
	if errors := stringSlice(analysis["errors"]); len(errors) > 0 {
		result["ok"] = false
		if strings.TrimSpace(fmt.Sprint(result["message"])) == "" || fmt.Sprint(result["message"]) == "<nil>" {
			result["message"] = "RuOpenRay нашел ошибки в маршрутизации. Исправьте их перед применением."
		}
	}
	auditResult := s.checkGeoAudit(map[string]any{"config": cfg})
	if audit, ok := auditResult["audit"].(map[string]any); ok {
		result["geoAudit"] = audit
	}
	if status, ok := auditResult["status"].(map[string]any); ok {
		result["geoStatus"] = status
	}
	if stdout := strings.TrimSpace(fmt.Sprint(auditResult["stdout"])); stdout != "" && stdout != "<nil>" {
		result["geoAuditStdout"] = stdout
	}
	if auditResult["ok"] == false {
		result["ok"] = false
		if strings.TrimSpace(fmt.Sprint(result["message"])) == "" || fmt.Sprint(result["message"]) == "<nil>" {
			result["message"] = "Geo Doctor нашел проблемы в geo-ссылках конфигурации."
		}
	}
	return result
}

func (s *serverState) analyzeConfig(cfg map[string]any) map[string]any {
	if cfg == nil {
		var err error
		cfg, err = s.readActiveConfig()
		if err != nil {
			return map[string]any{"ok": false, "errors": []string{err.Error()}}
		}
	}
	outbounds := map[string]map[string]any{}
	for _, item := range asArray(cfg["outbounds"]) {
		if outbound, ok := item.(map[string]any); ok {
			tag := strings.TrimSpace(fmt.Sprint(outbound["tag"]))
			if tag != "" && tag != "<nil>" {
				outbounds[tag] = outbound
			}
		}
	}
	hasTransparentInbound := false
	hasDNSInbound := false
	hasPlainLocalInbound := false
	for _, item := range asArray(cfg["inbounds"]) {
		inbound, ok := item.(map[string]any)
		if !ok {
			continue
		}
		tag := strings.TrimSpace(fmt.Sprint(inbound["tag"]))
		protocol := strings.TrimSpace(fmt.Sprint(inbound["protocol"]))
		if tag == "ruopenray_dns_in" {
			hasDNSInbound = true
			continue
		}
		if protocol == "socks" || protocol == "http" {
			hasPlainLocalInbound = true
		}
		settings, _ := inbound["settings"].(map[string]any)
		streamSettings, _ := inbound["streamSettings"].(map[string]any)
		sockopt, _ := streamSettings["sockopt"].(map[string]any)
		tproxyMode := strings.TrimSpace(fmt.Sprint(sockopt["tproxy"]))
		if protocol == "dokodemo-door" && (strings.Contains(tag, "transparent") || settings["followRedirect"] == true || tproxyMode == "tproxy" || tproxyMode == "redirect") {
			hasTransparentInbound = true
		}
	}
	apiTags := map[string]bool{}
	if api, ok := cfg["api"].(map[string]any); ok {
		if tag := strings.TrimSpace(fmt.Sprint(api["tag"])); tag != "" && tag != "<nil>" {
			apiTags[tag] = true
		}
	}
	warnings := []string{}
	errors := []string{}
	info := []string{}
	counts := map[string]int{"proxy": 0, "direct": 0, "block": 0, "other": 0, "total": 0}
	if !hasTransparentInbound && (hasDNSInbound || hasPlainLocalInbound) {
		warnings = append(warnings, "Нет входящего потока перехвата: LAN-трафик через nftables/TPROXY не попадет в Xray. Подготовьте transparent_ipv4 в разделе Перехват или через мастер настройки.")
	}
	if hasDNSInbound && !hasTransparentInbound {
		warnings = append(warnings, "DNS-вход ruopenray_dns_in есть, но он обрабатывает только DNS с dnsmasq. Для сайтов и приложений LAN-клиентов нужен отдельный входящий поток перехвата.")
	}
	if hasDNSInbound && runtime.GOOS != "windows" {
		host, port, _ := xrayDNSInboundEndpoint(cfg)
		owner := udpPortOwner(host, port)
		if owner != "" && !strings.Contains(owner, "/xray") {
			warnings = append(warnings, fmt.Sprintf("DNS-вход ruopenray_dns_in не сможет стартовать: UDP %s:%d уже занят процессом %s. Подготовьте DNS-вход заново, RuOpenRay выберет свободный порт.", host, port, owner))
		}
	}
	geoipPath := filepath.Join(s.cfg.GeoDir, "geoip.dat")
	geositePath := filepath.Join(s.cfg.GeoDir, "geosite.dat")
	routing, _ := cfg["routing"].(map[string]any)
	balancers := map[string]bool{}
	rawBalancers := asArray(routing["balancers"])
	observatory, _ := cfg["observatory"].(map[string]any)
	observatorySelectors := map[string]bool{}
	for _, item := range asArray(observatory["subjectSelector"]) {
		selector := strings.TrimSpace(fmt.Sprint(item))
		if selector != "" && selector != "<nil>" {
			observatorySelectors[selector] = true
		}
	}
	burstObservatory, _ := cfg["burstObservatory"].(map[string]any)
	burstObservatorySelectors := map[string]bool{}
	for _, item := range asArray(burstObservatory["subjectSelector"]) {
		selector := strings.TrimSpace(fmt.Sprint(item))
		if selector != "" && selector != "<nil>" {
			burstObservatorySelectors[selector] = true
		}
	}
	for index, item := range rawBalancers {
		if balancer, ok := item.(map[string]any); ok {
			tag := strings.TrimSpace(fmt.Sprint(balancer["tag"]))
			if tag != "" && tag != "<nil>" {
				balancers[tag] = true
			}
			strategy := "random"
			if strategyMap, ok := balancer["strategy"].(map[string]any); ok {
				strategy = strings.TrimSpace(fmt.Sprint(strategyMap["type"]))
			}
			if strategy == "leastPing" || strategy == "leastLoad" {
				requiredSelectors := observatorySelectors
				requiredName := "настройки наблюдения Xray"
				if strategy == "leastLoad" {
					requiredSelectors = burstObservatorySelectors
					requiredName = "настройки burst-наблюдения Xray"
				}
				hasSelector := false
				for _, selector := range asArray(balancer["selector"]) {
					if requiredSelectors[strings.TrimSpace(fmt.Sprint(selector))] {
						hasSelector = true
						break
					}
				}
				if !hasSelector {
					warnings = append(warnings, fmt.Sprintf("Балансировщик %d: выбранный режим %s требует %s", index+1, strategy, requiredName))
				}
			}
		}
	}
	for index, item := range asArray(routing["rules"]) {
		rule, ok := item.(map[string]any)
		if !ok {
			continue
		}
		counts["total"]++
		tag := strings.TrimSpace(fmt.Sprint(rule["outboundTag"]))
		if tag == "<nil>" {
			tag = ""
		}
		balancerTag := strings.TrimSpace(fmt.Sprint(rule["balancerTag"]))
		if balancerTag == "<nil>" {
			balancerTag = ""
		}
		if tag != "" && balancerTag != "" {
			errors = append(errors, fmt.Sprintf("Правило %d: укажите сервер или балансировщик, но не оба сразу", index+1))
		} else if tag == "" && balancerTag == "" {
			warnings = append(warnings, fmt.Sprintf("Правило %d: не указан сервер или балансировщик", index+1))
		} else if balancerTag != "" && !balancers[balancerTag] {
			errors = append(errors, fmt.Sprintf("Правило %d: balancerTag %q не найден в routing.balancers", index+1, balancerTag))
		} else if tag != "" {
			if _, exists := outbounds[tag]; !exists && !apiTags[tag] {
				errors = append(errors, fmt.Sprintf("Правило %d: сервер %q не найден в списке направлений Xray", index+1, tag))
			}
		}
		switch {
		case balancerTag != "":
			counts["proxy"]++
		case tag == "direct":
			counts["direct"]++
		case tag == "block":
			counts["block"]++
		default:
			if outbound, exists := outbounds[tag]; exists && !isSystemOutbound(outbound) {
				counts["proxy"]++
			} else {
				counts["other"]++
			}
		}
		if isCatchAllRoutingRule(rule) {
			target := firstNonEmpty(tag, "не задано")
			if balancerTag != "" {
				target = "balancer:" + balancerTag
			}
			info = append(info, fmt.Sprintf("Правило %d: default/catch-all идет в %s", index+1, target))
		}
		for _, value := range asArray(rule["domain"]) {
			domain := strings.TrimSpace(fmt.Sprint(value))
			if strings.EqualFold(domain, "default") {
				warnings = append(warnings, fmt.Sprintf("Правило %d: domain \"default\" не задает поведение по умолчанию. Используйте тип правила \"Остальной трафик\" или строку default: direct.", index+1))
			}
			if strings.HasPrefix(domain, "geosite:") && !fileExists(geositePath) {
				warnings = append(warnings, fmt.Sprintf("Правило %d: geosite требует %s", index+1, geositePath))
			}
			if strings.HasPrefix(domain, "ext:") {
				file := extDatFile(domain)
				if file == "" {
					warnings = append(warnings, fmt.Sprintf("Правило %d: ext-список указан без имени .dat файла", index+1))
				} else if !fileExists(filepath.Join(s.cfg.GeoDir, file)) {
					warnings = append(warnings, fmt.Sprintf("Правило %d: ext-списку нужен %s", index+1, filepath.Join(s.cfg.GeoDir, file)))
				}
			}
		}
		for _, value := range asArray(rule["ip"]) {
			ip := strings.TrimSpace(fmt.Sprint(value))
			if strings.HasPrefix(ip, "geoip:") && !fileExists(geoipPath) {
				warnings = append(warnings, fmt.Sprintf("Правило %d: geoip требует %s", index+1, geoipPath))
			}
		}
	}
	return map[string]any{"ok": len(errors) == 0, "errors": errors, "warnings": warnings, "info": info, "counts": counts}
}

func isCatchAllRoutingRule(rule map[string]any) bool {
	if rule == nil {
		return false
	}
	tag := strings.TrimSpace(fmt.Sprint(rule["outboundTag"]))
	if tag == "<nil>" {
		tag = ""
	}
	balancerTag := strings.TrimSpace(fmt.Sprint(rule["balancerTag"]))
	if balancerTag == "<nil>" {
		balancerTag = ""
	}
	if tag == "" && balancerTag == "" {
		return false
	}
	if len(asArray(rule["domain"])) > 0 || len(asArray(rule["ip"])) > 0 || len(asArray(rule["source"])) > 0 || len(asArray(rule["inboundTag"])) > 0 {
		return false
	}
	if network := strings.TrimSpace(fmt.Sprint(rule["network"])); network != "" && network != "<nil>" && !isAllNetworkRule(network) {
		return false
	}
	port := strings.TrimSpace(fmt.Sprint(rule["port"]))
	return port == "" || port == "<nil>" || port == "0-65535"
}

func normalizeCatchAllRoutingRules(cfg map[string]any) int {
	if cfg == nil {
		return 0
	}
	routing, _ := cfg["routing"].(map[string]any)
	if routing == nil {
		return 0
	}
	normalized := 0
	for _, item := range asArray(routing["rules"]) {
		rule, ok := item.(map[string]any)
		if !ok || !isEmptyCatchAllRoutingRule(rule) {
			continue
		}
		rule["network"] = "tcp,udp"
		normalized++
	}
	return normalized
}

func isEmptyCatchAllRoutingRule(rule map[string]any) bool {
	if rule == nil {
		return false
	}
	tag := strings.TrimSpace(fmt.Sprint(rule["outboundTag"]))
	if tag == "<nil>" {
		tag = ""
	}
	balancerTag := strings.TrimSpace(fmt.Sprint(rule["balancerTag"]))
	if balancerTag == "<nil>" {
		balancerTag = ""
	}
	if tag == "" && balancerTag == "" {
		return false
	}
	return len(asArray(rule["domain"])) == 0 &&
		len(asArray(rule["ip"])) == 0 &&
		len(asArray(rule["source"])) == 0 &&
		len(asArray(rule["inboundTag"])) == 0 &&
		emptyRuleScalar(rule["network"]) &&
		emptyRuleScalar(rule["port"])
}

func emptyRuleScalar(value any) bool {
	text := strings.TrimSpace(fmt.Sprint(value))
	return text == "" || text == "<nil>"
}

func isAllNetworkRule(network string) bool {
	clean := strings.ToLower(strings.ReplaceAll(network, " ", ""))
	return clean == "tcp,udp" || clean == "udp,tcp"
}
