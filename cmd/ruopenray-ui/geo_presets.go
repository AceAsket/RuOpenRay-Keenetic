package main

import "fmt"

func geoPresets() []map[string]any {
	return []map[string]any{
		{
			"id": "loyalsoldier", "name": "Loyalsoldier", "purpose": "универсальный набор", "mode": "replace", "compat": "Xray DAT", "installable": true,
			"estimatedBytes": 32 * 1024 * 1024, "detail": "Базовый набор geoip.dat/geosite.dat для маршрутизации Xray.",
			"covers":   []string{"private", "cn", "gfw", "telegram", "youtube", "google"},
			"geoipUrl": "https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat", "geositeUrl": "https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat",
		},
		{
			"id": "loyalsoldier-cdn", "name": "Loyalsoldier CDN", "purpose": "универсальный набор через CDN", "mode": "replace", "compat": "Xray DAT", "installable": true,
			"estimatedBytes": 32 * 1024 * 1024, "detail": "То же содержимое через jsDelivr, удобно если GitHub с роутера открывается нестабильно.",
			"covers":   []string{"private", "cn", "gfw", "telegram", "youtube", "google"},
			"geoipUrl": "https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat", "geositeUrl": "https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat",
		},
		{
			"id": "runetfreedom", "name": "RUNET Freedom", "purpose": "российские блокировки", "mode": "replace", "compat": "Xray DAT", "installable": true,
			"estimatedBytes": 28 * 1024 * 1024, "detail": "Набор для российского сегмента: заблокированные домены, IP-диапазоны и популярные сервисы для обхода.",
			"covers":     []string{"ru", "ru-blocked", "antifilter", "private"},
			"ruleHint":   "domain(geosite:ru-blocked) -> proxy",
			"geoipUrl":   "https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/geoip.dat",
			"geositeUrl": "https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/geosite.dat",
		},
		{
			"id": "nidelon", "name": "Nidelon", "purpose": "российские блокировки", "mode": "replace", "compat": "Xray DAT", "installable": true,
			"estimatedBytes": 8 * 1024 * 1024, "detail": "Компактный набор блокировок РКН. В оригинальном проекте используется как отдельные ext-файлы, но здесь может заменить базовые geoip/geosite.",
			"covers":     []string{"ru", "ru-blocked", "compact"},
			"ruleHint":   "ext:geosite_RU.dat:ru-block / ext:geoip_RU.dat:ru-block",
			"geoipUrl":   "https://raw.githubusercontent.com/Nidelon/ru-block-v2ray-rules/release/geoip.dat",
			"geositeUrl": "https://raw.githubusercontent.com/Nidelon/ru-block-v2ray-rules/release/geosite.dat",
		},
		{
			"id": "b4geoip", "name": "b4geoip", "purpose": "расширенный GeoIP", "mode": "geoip-only", "compat": "Xray geoip.dat", "installable": true,
			"estimatedBytes": 21 * 1024 * 1024, "detail": "GeoIP от DanielLavrushin/b4geoip: обновляет только geoip.dat и оставляет текущий geosite.dat без изменений.",
			"covers":    []string{"geoip", "private", "ru-ip", "antifilter"},
			"ruleHint":  "ip(geoip:...) -> proxy/direct",
			"geoipUrl":  "https://github.com/DanielLavrushin/b4geoip/releases/latest/download/geoip.dat",
			"sourceUrl": "https://github.com/DanielLavrushin/b4geoip",
		},
		{
			"id": "dustinwin", "name": "DustinWin", "purpose": "Китай и CDN", "mode": "replace", "compat": "mihomo/Xray DAT", "installable": true,
			"estimatedBytes": 30 * 1024 * 1024, "detail": "Китайский ruleset/geodata набор с категориями для CN, CDN, медиа и популярных сервисов.",
			"covers":   []string{"cn", "cdn", "media", "ai"},
			"geoipUrl": "https://github.com/DustinWin/ruleset_geodata/releases/download/mihomo-geodata/geoip.dat", "geositeUrl": "https://github.com/DustinWin/ruleset_geodata/releases/download/mihomo-geodata/geosite.dat",
		},
		{
			"id": "chocolate4u", "name": "Chocolate4U", "purpose": "Иран", "mode": "replace", "compat": "Xray DAT", "installable": true,
			"estimatedBytes": 24 * 1024 * 1024, "detail": "Иранский набор: локальные домены, sanctioned, ads, malware, phishing и другие категории.",
			"covers":   []string{"ir", "ads", "malware", "phishing"},
			"geoipUrl": "https://cdn.jsdelivr.net/gh/chocolate4u/Iran-v2ray-rules@release/geoip.dat", "geositeUrl": "https://cdn.jsdelivr.net/gh/chocolate4u/Iran-v2ray-rules@release/geosite.dat",
		},
		{
			"id": "antifilter-community", "name": "antifilter-community", "purpose": "РФ блокировки", "mode": "extra-geosite", "compat": "Xray ext DAT", "installable": true,
			"estimatedBytes": 256 * 1024, "detail": "Дополнительный geosite-файл для правил ext по спискам community.antifilter.download.",
			"covers": []string{"ext", "antifilter-community", "ru-blocked"},
			"target": "LoyalsoldierSite.dat", "ruleHint": "domain(ext:\"LoyalsoldierSite.dat:antifilter-community\") -> proxy",
			"geositeUrl": "https://github.com/1andrevich/antifilter-domain/releases/latest/download/geosite.dat",
		},
		{
			"id": "metacubex", "name": "MetaCubeX", "purpose": "AI/CDN/Discord", "mode": "replace", "compat": "Xray DAT", "installable": true,
			"estimatedBytes": 24 * 1024 * 1024, "detail": "Альтернативный rules-dat с актуальными категориями для mihomo/Clash.Meta и Xray DAT.",
			"covers":   []string{"ai", "cdn", "discord", "telegram", "youtube", "google"},
			"geoipUrl": "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat", "geositeUrl": "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat",
		},
		{
			"id": "sagernet", "name": "SagerNet", "purpose": "OpenWrt/sing-box", "mode": "reference", "compat": "sing-box DB", "installable": false,
			"detail":   "Справочные sing-box базы geoip.db/geosite.db. Xray не читает этот формат напрямую.",
			"geoipUrl": "https://github.com/SagerNet/sing-geoip/releases/latest/download/geoip.db", "geositeUrl": "https://github.com/SagerNet/sing-geosite/releases/latest/download/geosite.db",
		},
		{
			"id": "blockcheck", "name": "blockcheck", "purpose": "диагностика DPI", "mode": "diagnostic", "compat": "zapret", "installable": false,
			"detail":    "Диагностический сценарий zapret для подбора DPI-стратегий; это не geo-файл Xray.",
			"sourceUrl": "https://github.com/bol-van/zapret/blob/master/blockcheck.sh",
		},
		{
			"id": "official", "name": "XTLS install-geodata", "purpose": "официальный скрипт", "mode": "reference", "compat": "Xray install script", "installable": false,
			"detail":    "Официальный install-geodata работает через XTLS/Xray-install, а не через прямые release-ассеты geoip.dat/geosite.dat.",
			"sourceUrl": "https://github.com/XTLS/Xray-install",
		},
	}
}

func visibleGeoPresets() []map[string]any {
	presets := []map[string]any{}
	for _, preset := range geoPresets() {
		mode := fmt.Sprint(preset["mode"])
		if mode == "reference" || mode == "diagnostic" {
			continue
		}
		presets = append(presets, preset)
	}
	return presets
}

func (s *serverState) geoPresets() []map[string]any {
	presets := geoPresets()
	overrides := s.geoPresetOverrides()
	if len(overrides) == 0 {
		return presets
	}
	next := make([]map[string]any, 0, len(presets))
	for _, preset := range presets {
		id := fmt.Sprint(preset["id"])
		override, ok := overrides[id]
		if !ok {
			next = append(next, preset)
			continue
		}
		merged := map[string]any{}
		for key, value := range preset {
			merged[key] = value
		}
		for _, key := range []string{"name", "purpose", "detail", "compat", "mode", "geoipUrl", "geositeUrl", "url", "target", "ruleHint"} {
			if value := fmt.Sprint(override[key]); value != "" && value != "<nil>" {
				merged[key] = value
			}
		}
		if enabled, ok := override["enabled"].(bool); ok {
			merged["enabled"] = enabled
			merged["installable"] = enabled && merged["installable"] != false
		}
		merged["customized"] = true
		next = append(next, merged)
	}
	return next
}

func (s *serverState) visibleGeoPresets() []map[string]any {
	presets := []map[string]any{}
	for _, preset := range s.geoPresets() {
		mode := fmt.Sprint(preset["mode"])
		if mode == "reference" || mode == "diagnostic" {
			continue
		}
		presets = append(presets, preset)
	}
	return presets
}
