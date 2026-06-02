package main

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/AceAsket/RuOpenRay-Keenetic/internal/geodata"
)

const geoCatalogItemLimit = 20000

type geoCatalogCategory struct {
	Code  string `json:"code"`
	Count int    `json:"count"`
}

type geoCatalogReport struct {
	OK         bool                 `json:"ok"`
	Kind       string               `json:"kind"`
	File       string               `json:"file"`
	Path       string               `json:"path"`
	Code       string               `json:"code,omitempty"`
	Categories []geoCatalogCategory `json:"categories,omitempty"`
	Items      []string             `json:"items,omitempty"`
	Truncated  bool                 `json:"truncated,omitempty"`
	Stderr     string               `json:"stderr,omitempty"`
}

func (s *serverState) geoCatalog(kind, code string, full bool, fileName ...string) map[string]any {
	file := ""
	if len(fileName) > 0 {
		file = fileName[0]
	}
	report := s.geoCatalogReport(kind, code, full, file)
	payload := map[string]any{
		"ok":         report.OK,
		"kind":       report.Kind,
		"file":       report.File,
		"path":       report.Path,
		"code":       report.Code,
		"categories": report.Categories,
		"items":      report.Items,
		"truncated":  report.Truncated,
	}
	if report.Stderr != "" {
		payload["stderr"] = report.Stderr
		payload["error"] = report.Stderr
	}
	return payload
}

func (s *serverState) saveGeoCatalogCategory(payload map[string]any) map[string]any {
	kind := strings.ToLower(strings.TrimSpace(fmt.Sprint(payload["kind"])))
	code := strings.ToLower(strings.TrimSpace(fmt.Sprint(payload["code"])))
	file, kind := geoCatalogTarget(kind, strings.TrimSpace(fmt.Sprint(payload["file"])))
	if code == "" || code == "<nil>" || !geoListCodePattern.MatchString(code) {
		return map[string]any{"ok": false, "stderr": "Укажите категорию DAT, которую нужно изменить"}
	}
	items := stringList(payload["items"])
	if len(items) == 0 {
		if raw := strings.TrimSpace(fmt.Sprint(payload["items"])); raw != "" && raw != "<nil>" {
			items = strings.Split(raw, "\n")
		}
	}
	backup := boolPayload(payload, "backup", true)
	var category []byte
	var normalized []string
	var err error
	if kind == "geoip" {
		file = "geoip.dat"
		category, normalized, err = buildGeoIPCategory(code, items)
	} else {
		category, normalized, err = buildGeoSiteCategory(code, items)
	}
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "status": s.geoStatus()}
	}
	target := filepath.Join(s.cfg.GeoDir, file)
	body, err := os.ReadFile(target)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "status": s.geoStatus()}
	}
	next, replaced, err := replaceGeoCategory(body, kind, code, category)
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "status": s.geoStatus()}
	}
	if backup {
		if err := os.MkdirAll(s.cfg.BackupDir, 0o755); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "status": s.geoStatus()}
		}
		backupPath := filepath.Join(s.cfg.BackupDir, file+"-"+time.Now().Format("20060102-150405"))
		if err := os.WriteFile(backupPath, body, 0o644); err != nil {
			return map[string]any{"ok": false, "stderr": err.Error(), "status": s.geoStatus()}
		}
	}
	tmp := target + ".ruopenray-new"
	if err := os.WriteFile(tmp, next, 0o644); err != nil {
		return map[string]any{"ok": false, "stderr": err.Error(), "status": s.geoStatus()}
	}
	if err := os.Rename(tmp, target); err != nil {
		_ = os.Remove(tmp)
		return map[string]any{"ok": false, "stderr": err.Error(), "status": s.geoStatus()}
	}
	restart := s.serviceAction("restart")
	ok := restart["ok"] == true
	action := "изменена"
	if !replaced {
		action = "добавлена"
	}
	stdout := fmt.Sprintf("Категория %s в %s %s: %d записей", code, file, action, len(normalized))
	if restartText := strings.TrimSpace(fmt.Sprint(restart["stdout"])); restartText != "" && restartText != "<nil>" {
		stdout += "\n" + restartText
	}
	stderr := ""
	if !ok {
		stderr = strings.TrimSpace(fmt.Sprint(restart["stderr"]))
		if stderr == "" || stderr == "<nil>" {
			stderr = "DAT сохранен, но Xray не перезапустился"
		}
	}
	return map[string]any{"ok": ok, "file": file, "kind": kind, "code": code, "items": len(normalized), "replaced": replaced, "restart": restart, "status": s.geoStatus(), "stdout": stdout, "stderr": stderr}
}

func (s *serverState) geoCatalogReport(kind, code string, full bool, fileName ...string) geoCatalogReport {
	kind = strings.ToLower(strings.TrimSpace(kind))
	code = strings.ToLower(strings.TrimSpace(code))
	file := ""
	if len(fileName) > 0 {
		file = fileName[0]
	}
	file, kind = geoCatalogTarget(kind, file)
	path := filepath.Join(s.cfg.GeoDir, file)
	body, err := os.ReadFile(path)
	if err != nil {
		return geoCatalogReport{OK: false, Kind: kind, File: file, Path: path, Code: code, Stderr: err.Error()}
	}
	if len(body) == 0 {
		return geoCatalogReport{OK: false, Kind: kind, File: file, Path: path, Code: code, Stderr: "dat-файл пустой"}
	}
	var report geoCatalogReport
	itemLimit := geoCatalogItemLimit
	if full {
		itemLimit = 0
	}
	if kind == "geoip" {
		report = parseGeoIPCatalog(body, code, itemLimit)
	} else {
		report = parseGeoSiteCatalog(body, code, itemLimit)
	}
	report.Kind = kind
	report.File = file
	report.Path = path
	report.Code = code
	if report.Stderr != "" {
		report.OK = false
	}
	return report
}

func geoCatalogTarget(kind, fileName string) (string, string) {
	file := strings.TrimSpace(fileName)
	if clean := geodata.CleanFileName(file); clean != "" {
		file = clean
	} else {
		file = ""
	}
	kind = strings.ToLower(strings.TrimSpace(kind))
	if kind == "ip" {
		kind = "geoip"
	}
	if kind != "geoip" && kind != "geosite" {
		if strings.Contains(strings.ToLower(file), "geoip") {
			kind = "geoip"
		} else {
			kind = "geosite"
		}
	}
	if file == "" {
		if kind == "geoip" {
			file = "geoip.dat"
		} else {
			file = "geosite.dat"
		}
	}
	return file, kind
}

func parseGeoSiteCatalog(body []byte, wantedCode string, itemLimit int) geoCatalogReport {
	report := geoCatalogReport{OK: true}
	pos := 0
	for pos < len(body) {
		field, wire, ok := geoReadTag(body, &pos)
		if !ok {
			return geoCatalogReport{Stderr: "не удалось прочитать geosite.dat"}
		}
		if field != 1 || wire != 2 {
			if !geoSkipField(body, &pos, wire) {
				return geoCatalogReport{Stderr: "не удалось пропустить неизвестное поле geosite.dat"}
			}
			continue
		}
		entry, ok := geoReadBytes(body, &pos)
		if !ok {
			return geoCatalogReport{Stderr: "поврежденная запись geosite.dat"}
		}
		category := parseGeoSiteEntry(entry, wantedCode, itemLimit)
		if category.Code == "" {
			continue
		}
		if wantedCode != "" && strings.EqualFold(category.Code, wantedCode) {
			report.Items = category.Items
			report.Truncated = category.Truncated
			return report
		}
		report.Categories = append(report.Categories, geoCatalogCategory{Code: strings.ToLower(category.Code), Count: category.Count})
	}
	sort.Slice(report.Categories, func(i, j int) bool {
		return report.Categories[i].Code < report.Categories[j].Code
	})
	if wantedCode != "" {
		report.Stderr = "в geosite.dat не найден список " + wantedCode
	}
	return report
}

func parseGeoIPCatalog(body []byte, wantedCode string, itemLimit int) geoCatalogReport {
	report := geoCatalogReport{OK: true}
	pos := 0
	for pos < len(body) {
		field, wire, ok := geoReadTag(body, &pos)
		if !ok {
			return geoCatalogReport{Stderr: "не удалось прочитать geoip.dat"}
		}
		if field != 1 || wire != 2 {
			if !geoSkipField(body, &pos, wire) {
				return geoCatalogReport{Stderr: "не удалось пропустить неизвестное поле geoip.dat"}
			}
			continue
		}
		entry, ok := geoReadBytes(body, &pos)
		if !ok {
			return geoCatalogReport{Stderr: "поврежденная запись geoip.dat"}
		}
		category := parseGeoIPEntry(entry, wantedCode, itemLimit)
		if category.Code == "" {
			continue
		}
		if wantedCode != "" && strings.EqualFold(category.Code, wantedCode) {
			report.Items = category.Items
			report.Truncated = category.Truncated
			return report
		}
		report.Categories = append(report.Categories, geoCatalogCategory{Code: strings.ToLower(category.Code), Count: category.Count})
	}
	sort.Slice(report.Categories, func(i, j int) bool {
		return report.Categories[i].Code < report.Categories[j].Code
	})
	if wantedCode != "" {
		report.Stderr = "в geoip.dat не найден список " + wantedCode
	}
	return report
}

type geoSiteEntry struct {
	Code      string
	Count     int
	Items     []string
	Truncated bool
}

func parseGeoSiteEntry(body []byte, wantedCode string, itemLimit int) geoSiteEntry {
	entry := geoSiteEntry{}
	pos := 0
	wantItems := wantedCode != ""
	for pos < len(body) {
		field, wire, ok := geoReadTag(body, &pos)
		if !ok {
			return entry
		}
		switch {
		case field == 1 && wire == 2:
			value, ok := geoReadString(body, &pos)
			if !ok {
				return entry
			}
			entry.Code = strings.ToLower(value)
			wantItems = wantedCode != "" && strings.EqualFold(value, wantedCode)
		case field == 2 && wire == 2:
			raw, ok := geoReadBytes(body, &pos)
			if !ok {
				return entry
			}
			entry.Count++
			if wantItems && (itemLimit <= 0 || len(entry.Items) < itemLimit) {
				if item := parseGeoSiteDomain(raw); item != "" {
					entry.Items = append(entry.Items, item)
				}
			} else if wantItems {
				entry.Truncated = true
			}
		default:
			if !geoSkipField(body, &pos, wire) {
				return entry
			}
		}
	}
	return entry
}

func parseGeoSiteDomain(body []byte) string {
	pos := 0
	domainType := uint64(0)
	value := ""
	for pos < len(body) {
		field, wire, ok := geoReadTag(body, &pos)
		if !ok {
			return ""
		}
		switch {
		case field == 1 && wire == 0:
			v, ok := geoReadVarint(body, &pos)
			if !ok {
				return ""
			}
			domainType = v
		case field == 2 && wire == 2:
			v, ok := geoReadString(body, &pos)
			if !ok {
				return ""
			}
			value = strings.TrimSpace(v)
		default:
			if !geoSkipField(body, &pos, wire) {
				return ""
			}
		}
	}
	if value == "" {
		return ""
	}
	switch domainType {
	case 1:
		return "regexp:" + value
	case 2:
		return "domain:" + strings.ToLower(value)
	case 3:
		return "full:" + strings.ToLower(value)
	default:
		return "keyword:" + strings.ToLower(value)
	}
}

type geoIPEntry struct {
	Code      string
	Count     int
	Items     []string
	Truncated bool
}

func parseGeoIPEntry(body []byte, wantedCode string, itemLimit int) geoIPEntry {
	entry := geoIPEntry{}
	pos := 0
	wantItems := wantedCode != ""
	for pos < len(body) {
		field, wire, ok := geoReadTag(body, &pos)
		if !ok {
			return entry
		}
		switch {
		case field == 1 && wire == 2:
			value, ok := geoReadString(body, &pos)
			if !ok {
				return entry
			}
			entry.Code = strings.ToLower(value)
			wantItems = wantedCode != "" && strings.EqualFold(value, wantedCode)
		case field == 2 && wire == 2:
			raw, ok := geoReadBytes(body, &pos)
			if !ok {
				return entry
			}
			entry.Count++
			if wantItems && (itemLimit <= 0 || len(entry.Items) < itemLimit) {
				if item := parseGeoIPCidr(raw); item != "" {
					entry.Items = append(entry.Items, item)
				}
			} else if wantItems {
				entry.Truncated = true
			}
		default:
			if !geoSkipField(body, &pos, wire) {
				return entry
			}
		}
	}
	return entry
}

func parseGeoIPCidr(body []byte) string {
	pos := 0
	var ipBytes []byte
	prefix := uint64(0)
	for pos < len(body) {
		field, wire, ok := geoReadTag(body, &pos)
		if !ok {
			return ""
		}
		switch {
		case field == 1 && wire == 2:
			value, ok := geoReadBytes(body, &pos)
			if !ok {
				return ""
			}
			ipBytes = append([]byte(nil), value...)
		case field == 2 && wire == 0:
			value, ok := geoReadVarint(body, &pos)
			if !ok {
				return ""
			}
			prefix = value
		default:
			if !geoSkipField(body, &pos, wire) {
				return ""
			}
		}
	}
	ip := net.IP(ipBytes)
	if len(ipBytes) == net.IPv4len {
		ip = net.IPv4(ipBytes[0], ipBytes[1], ipBytes[2], ipBytes[3])
	}
	if ip == nil {
		return ""
	}
	return fmt.Sprintf("%s/%d", ip.String(), prefix)
}

type geoRawCategory struct {
	Code string
	Raw  []byte
}

func replaceGeoCategory(body []byte, kind, code string, category []byte) ([]byte, bool, error) {
	entries, err := geoRawCategories(body, kind)
	if err != nil {
		return nil, false, err
	}
	replaced := false
	out := []byte{}
	for _, entry := range entries {
		raw := entry.Raw
		if strings.EqualFold(entry.Code, code) {
			raw = category
			replaced = true
		}
		out = append(out, geoProtoMessage(1, raw)...)
	}
	if !replaced {
		out = append(out, geoProtoMessage(1, category)...)
	}
	return out, replaced, nil
}

func geoRawCategories(body []byte, kind string) ([]geoRawCategory, error) {
	var entries []geoRawCategory
	pos := 0
	for pos < len(body) {
		field, wire, ok := geoReadTag(body, &pos)
		if !ok {
			return nil, fmt.Errorf("не удалось прочитать %s.dat", kind)
		}
		if field != 1 || wire != 2 {
			if !geoSkipField(body, &pos, wire) {
				return nil, fmt.Errorf("не удалось пропустить неизвестное поле %s.dat", kind)
			}
			continue
		}
		raw, ok := geoReadBytes(body, &pos)
		if !ok {
			return nil, fmt.Errorf("поврежденная запись %s.dat", kind)
		}
		code := ""
		if kind == "geoip" {
			code = parseGeoIPEntry(raw, "", geoCatalogItemLimit).Code
		} else {
			code = parseGeoSiteEntry(raw, "", geoCatalogItemLimit).Code
		}
		if code != "" {
			entries = append(entries, geoRawCategory{Code: code, Raw: append([]byte(nil), raw...)})
		}
	}
	return entries, nil
}

func buildGeoSiteCategory(code string, items []string) ([]byte, []string, error) {
	seen := map[string]bool{}
	normalized := []string{}
	body := geoProtoStringField(1, strings.ToLower(code))
	for _, raw := range items {
		item, ok := normalizeGeoDomainForDAT(raw)
		if !ok {
			return nil, nil, fmt.Errorf("нельзя сохранить в geosite.dat строку: %s", strings.TrimSpace(raw))
		}
		if seen[item] {
			continue
		}
		seen[item] = true
		normalized = append(normalized, item)
		domainType, value := geoDomainDATParts(item)
		body = append(body, geoProtoMessage(2, append(geoProtoVarintField(1, domainType), geoProtoStringField(2, value)...))...)
	}
	if len(normalized) == 0 {
		return nil, nil, fmt.Errorf("добавьте хотя бы один домен")
	}
	return body, normalized, nil
}

func normalizeGeoDomainForDAT(raw string) (string, bool) {
	value, ok := normalizeGeoDomainItem(raw)
	if !ok || strings.HasPrefix(value, "geosite:") {
		return "", false
	}
	return value, true
}

func geoDomainDATParts(item string) (uint64, string) {
	for _, prefix := range []struct {
		prefix string
		kind   uint64
	}{
		{"regexp:", 1},
		{"domain:", 2},
		{"full:", 3},
		{"keyword:", 0},
	} {
		if strings.HasPrefix(item, prefix.prefix) {
			return prefix.kind, strings.TrimPrefix(item, prefix.prefix)
		}
	}
	return 2, item
}

func buildGeoIPCategory(code string, items []string) ([]byte, []string, error) {
	seen := map[string]bool{}
	normalized := []string{}
	body := geoProtoStringField(1, strings.ToLower(code))
	for _, raw := range items {
		item, ok := normalizeGeoIPForDAT(raw)
		if !ok {
			return nil, nil, fmt.Errorf("нельзя сохранить в geoip.dat строку: %s", strings.TrimSpace(raw))
		}
		if seen[item] {
			continue
		}
		cidrBody, err := geoIPCIDRMessage(item)
		if err != nil {
			return nil, nil, err
		}
		seen[item] = true
		normalized = append(normalized, item)
		body = append(body, geoProtoMessage(2, cidrBody)...)
	}
	if len(normalized) == 0 {
		return nil, nil, fmt.Errorf("добавьте хотя бы один IP или подсеть")
	}
	return body, normalized, nil
}

func normalizeGeoIPForDAT(raw string) (string, bool) {
	value, ok := normalizeGeoIPItem(raw)
	if !ok || strings.HasPrefix(value, "geoip:") {
		return "", false
	}
	return value, true
}

func geoIPCIDRMessage(item string) ([]byte, error) {
	if strings.Contains(item, "/") {
		ip, network, err := net.ParseCIDR(item)
		if err != nil || ip == nil || network == nil {
			return nil, fmt.Errorf("некорректная подсеть: %s", item)
		}
		ones, _ := network.Mask.Size()
		networkIP := network.IP
		if v4 := networkIP.To4(); v4 != nil {
			return append(geoProtoBytesField(1, v4), geoProtoVarintField(2, uint64(ones))...), nil
		}
		return append(geoProtoBytesField(1, networkIP.To16()), geoProtoVarintField(2, uint64(ones))...), nil
	}
	ip := net.ParseIP(item)
	if ip == nil {
		return nil, fmt.Errorf("некорректный IP: %s", item)
	}
	if v4 := ip.To4(); v4 != nil {
		return append(geoProtoBytesField(1, v4), geoProtoVarintField(2, 32)...), nil
	}
	return append(geoProtoBytesField(1, ip.To16()), geoProtoVarintField(2, 128)...), nil
}

func geoProtoMessage(field int, body []byte) []byte {
	return append(append(geoProtoTag(field, 2), geoProtoVarint(uint64(len(body)))...), body...)
}

func geoProtoStringField(field int, value string) []byte {
	return geoProtoBytesField(field, []byte(value))
}

func geoProtoBytesField(field int, value []byte) []byte {
	return append(append(geoProtoTag(field, 2), geoProtoVarint(uint64(len(value)))...), value...)
}

func geoProtoVarintField(field int, value uint64) []byte {
	return append(geoProtoTag(field, 0), geoProtoVarint(value)...)
}

func geoProtoTag(field int, wire int) []byte {
	return geoProtoVarint(uint64(field<<3 | wire))
}

func geoProtoVarint(value uint64) []byte {
	out := []byte{}
	for value >= 0x80 {
		out = append(out, byte(value)|0x80)
		value >>= 7
	}
	return append(out, byte(value))
}

func geoReadTag(body []byte, pos *int) (int, int, bool) {
	value, ok := geoReadVarint(body, pos)
	if !ok {
		return 0, 0, false
	}
	return int(value >> 3), int(value & 7), true
}

func geoReadVarint(body []byte, pos *int) (uint64, bool) {
	var value uint64
	for shift := uint(0); shift < 64; shift += 7 {
		if *pos >= len(body) {
			return 0, false
		}
		b := body[*pos]
		(*pos)++
		value |= uint64(b&0x7f) << shift
		if b < 0x80 {
			return value, true
		}
	}
	return 0, false
}

func geoReadBytes(body []byte, pos *int) ([]byte, bool) {
	length, ok := geoReadVarint(body, pos)
	if !ok || length > uint64(len(body)-*pos) {
		return nil, false
	}
	start := *pos
	*pos += int(length)
	return body[start:*pos], true
}

func geoReadString(body []byte, pos *int) (string, bool) {
	value, ok := geoReadBytes(body, pos)
	if !ok {
		return "", false
	}
	return string(value), true
}

func geoSkipField(body []byte, pos *int, wire int) bool {
	switch wire {
	case 0:
		_, ok := geoReadVarint(body, pos)
		return ok
	case 1:
		if *pos+8 > len(body) {
			return false
		}
		*pos += 8
		return true
	case 2:
		_, ok := geoReadBytes(body, pos)
		return ok
	case 5:
		if *pos+4 > len(body) {
			return false
		}
		*pos += 4
		return true
	default:
		return false
	}
}
