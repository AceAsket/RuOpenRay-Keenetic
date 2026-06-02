package main

import (
	"fmt"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

func (s *serverState) geoAudit() map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "items": []map[string]any{}, "summary": map[string]any{"total": 0, "missing": 0}}
	}
	return s.geoAuditForConfig(cfg)
}

func (s *serverState) geoAuditForConfig(cfg map[string]any) map[string]any {
	items := map[string]map[string]any{}
	add := func(kind, code, source string) {
		code = strings.TrimSpace(code)
		if code == "" || code == "<nil>" {
			return
		}
		file := ""
		status := "unchecked"
		message := "Файл есть, наличие категории проверит Xray при тесте конфигурации."
		severity := "info"
		switch kind {
		case "geoip":
			file = "geoip.dat"
			if !fileExists(filepath.Join(s.cfg.GeoDir, file)) {
				status, severity, message = "missing-file", "danger", "Не найден geoip.dat."
			}
		case "geosite":
			file = "geosite.dat"
			if !fileExists(filepath.Join(s.cfg.GeoDir, file)) {
				status, severity, message = "missing-file", "danger", "Не найден geosite.dat."
			}
		case "ext":
			file = extDatFile(code)
			if file == "" {
				status, severity, message = "bad-ext", "danger", "ext-правило указано без имени .dat файла."
			} else if !fileExists(filepath.Join(s.cfg.GeoDir, file)) {
				status, severity, message = "missing-file", "danger", "Не найден дополнительный dat-файл для ext-правила."
			} else {
				message = "Дополнительный dat-файл найден. Наличие списка внутри файла проверит Xray."
			}
		}
		key := kind + ":" + code
		item, ok := items[key]
		if !ok {
			item = map[string]any{
				"kind": kind, "code": code, "file": file, "status": status,
				"severity": severity, "message": message, "sources": []string{},
			}
			items[key] = item
		}
		item["sources"] = appendStringUnique(stringList(item["sources"]), source)
	}

	routing, _ := cfg["routing"].(map[string]any)
	for index, raw := range asArray(routing["rules"]) {
		rule, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		source := fmt.Sprintf("правило %d", index+1)
		for _, value := range asArray(rule["domain"]) {
			ref := strings.TrimSpace(fmt.Sprint(value))
			switch {
			case strings.HasPrefix(ref, "geosite:"):
				add("geosite", strings.TrimPrefix(ref, "geosite:"), source)
			case strings.HasPrefix(ref, "ext:"):
				add("ext", ref, source)
			}
		}
		for _, value := range asArray(rule["ip"]) {
			ref := strings.TrimSpace(fmt.Sprint(value))
			if strings.HasPrefix(ref, "geoip:") {
				add("geoip", strings.TrimPrefix(ref, "geoip:"), source)
			}
		}
	}
	if dns, ok := cfg["dns"].(map[string]any); ok {
		for index, raw := range asArray(dns["servers"]) {
			server, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			source := fmt.Sprintf("DNS сервер %d", index+1)
			for _, value := range asArray(server["domains"]) {
				ref := strings.TrimSpace(fmt.Sprint(value))
				switch {
				case strings.HasPrefix(ref, "geosite:"):
					add("geosite", strings.TrimPrefix(ref, "geosite:"), source)
				case strings.HasPrefix(ref, "ext:"):
					add("ext", ref, source)
				}
			}
		}
	}

	list := make([]map[string]any, 0, len(items))
	missing := 0
	for _, item := range items {
		if fmt.Sprint(item["severity"]) == "danger" {
			missing++
		}
		list = append(list, item)
	}
	sort.Slice(list, func(i, j int) bool {
		left := fmt.Sprintf("%s:%s", list[i]["kind"], list[i]["code"])
		right := fmt.Sprintf("%s:%s", list[j]["kind"], list[j]["code"])
		return left < right
	})
	return map[string]any{
		"ok":      missing == 0,
		"items":   list,
		"summary": map[string]any{"total": len(list), "missing": missing},
	}
}

func (s *serverState) checkGeoAudit(payloads ...map[string]any) map[string]any {
	var cfg map[string]any
	source := "active"
	if len(payloads) > 0 {
		if draft, ok := payloads[0]["config"].(map[string]any); ok && draft != nil {
			cfg = draft
			source = "draft"
		}
	}
	if cfg == nil {
		var err error
		cfg, err = s.readActiveConfig()
		if err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "audit": map[string]any{"items": []map[string]any{}, "summary": map[string]any{"total": 0, "missing": 0}}}
		}
	}
	audit := s.geoAuditForConfig(cfg)
	items, _ := audit["items"].([]map[string]any)
	missing := 0
	for _, item := range items {
		if fmt.Sprint(item["severity"]) == "danger" {
			missing++
			continue
		}
		if runtime.GOOS == "windows" {
			item["status"] = "dev-skip"
			item["severity"] = "info"
			item["message"] = "На Windows проверяется только наличие файла; категорию проверит Xray на роутере."
			continue
		}
		test := s.validateConfig(s.geoProbeConfig(fmt.Sprint(item["kind"]), fmt.Sprint(item["code"])))
		item["test"] = test
		if test["ok"] == true {
			item["status"] = "ok"
			item["severity"] = "ok"
			item["message"] = "Xray нашел этот список в dat-файле."
			continue
		}
		missing++
		item["status"] = "missing-code"
		item["severity"] = "danger"
		item["message"] = geoProbeErrorMessage(fmt.Sprint(item["kind"]), fmt.Sprint(item["code"]), test)
	}
	audit["ok"] = missing == 0
	audit["checkedAt"] = time.Now().Format(time.RFC3339)
	audit["summary"] = map[string]any{"total": len(items), "missing": missing}
	return map[string]any{
		"ok":     missing == 0,
		"audit":  audit,
		"source": source,
		"status": s.geoStatusWithAudit(audit),
		"stdout": geoAuditStdout(len(items), missing, source),
	}
}

func (s *serverState) geoStatusWithAudit(audit map[string]any) map[string]any {
	status := s.geoStatus()
	status["audit"] = audit
	return status
}

func (s *serverState) geoProbeConfig(kind, code string) map[string]any {
	rule := map[string]any{"type": "field", "outboundTag": "direct"}
	switch kind {
	case "geoip":
		rule["ip"] = []any{"geoip:" + code}
	case "geosite":
		rule["domain"] = []any{"geosite:" + code}
	case "ext":
		rule["domain"] = []any{code}
	}
	return map[string]any{
		"log":      map[string]any{"loglevel": "warning"},
		"inbounds": []any{},
		"outbounds": []any{
			map[string]any{"tag": "direct", "protocol": "freedom"},
			map[string]any{"tag": "block", "protocol": "blackhole"},
		},
		"routing": map[string]any{"rules": []any{rule}},
	}
}

func geoProbeErrorMessage(kind, code string, result map[string]any) string {
	raw := strings.TrimSpace(fmt.Sprint(result["stdout"]) + "\n" + fmt.Sprint(result["stderr"]) + "\n" + fmt.Sprint(result["message"]))
	if strings.Contains(raw, "code not found") || strings.Contains(raw, "failed to load") {
		switch kind {
		case "geoip":
			return fmt.Sprintf("В geoip.dat не найден список %s.", code)
		case "geosite":
			return fmt.Sprintf("В geosite.dat не найден список %s.", code)
		case "ext":
			return "Xray не смог прочитать ext-список из дополнительного dat-файла."
		}
	}
	if raw != "" {
		lines := strings.Split(raw, "\n")
		return strings.TrimSpace(lines[0])
	}
	return "Xray не смог проверить этот geo-список."
}

func geoAuditStdout(total, missing int, source string) string {
	scope := "активной конфигурации"
	if source == "draft" {
		scope = "черновике конфигурации"
	}
	if total == 0 {
		return fmt.Sprintf("В %s нет geo-ссылок для проверки.", scope)
	}
	if missing == 0 {
		return fmt.Sprintf("Проверено geo-ссылок в %s: %d, проблем не найдено.", scope, total)
	}
	return fmt.Sprintf("Проверено geo-ссылок в %s: %d, проблем: %d.", scope, total, missing)
}

func appendStringUnique(values []string, next string) []string {
	next = strings.TrimSpace(next)
	if next == "" {
		return values
	}
	for _, value := range values {
		if value == next {
			return values
		}
	}
	return append(values, next)
}
