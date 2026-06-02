package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const dpiLargeReadBytes int64 = 20 * 1024

var dpiReadProbeSizes = []int64{4 * 1024, 20 * 1024, 256 * 1024}

func dpiDNSProbe(host string, timeoutMs int) map[string]any {
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()
	started := time.Now()
	records, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	latency := time.Since(started).Milliseconds()
	result := map[string]any{"ok": err == nil && len(records) > 0, "host": host, "latencyMs": latency}
	if err != nil {
		result["error"] = err.Error()
		return dpiAnnotate("dns", result)
	}
	addresses := make([]string, 0, len(records))
	for _, item := range records {
		if item.IP != nil {
			addresses = append(addresses, item.IP.String())
		}
	}
	result["addresses"] = addresses
	result["ok"] = len(addresses) > 0
	if len(addresses) == 0 {
		result["error"] = "DNS не вернул адреса"
	}
	return dpiAnnotate("dns", result)
}

type dpiDoHResponse struct {
	Status int `json:"Status"`
	Answer []struct {
		Type int    `json:"type"`
		Data string `json:"data"`
	} `json:"Answer"`
}

func dpiDoHQuery(ctx context.Context, client *http.Client, host string, qtype string) (dpiDoHResponse, error) {
	var parsed dpiDoHResponse
	endpoint := "https://dns.google/resolve?name=" + url.QueryEscape(host) + "&type=" + url.QueryEscape(qtype)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return parsed, err
	}
	req.Header.Set("Accept", "application/dns-json")
	resp, err := client.Do(req)
	if err != nil {
		return parsed, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return parsed, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 256*1024)).Decode(&parsed); err != nil {
		return parsed, err
	}
	return parsed, nil
}

func dpiDoHProbe(host string, timeoutMs int) map[string]any {
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()
	started := time.Now()
	client := &http.Client{Timeout: time.Duration(timeoutMs) * time.Millisecond}
	addresses := []string{}
	statuses := []string{}
	errors := []string{}
	for _, qtype := range []string{"A", "AAAA"} {
		reply, err := dpiDoHQuery(ctx, client, host, qtype)
		if err != nil {
			errors = append(errors, qtype+": "+err.Error())
			continue
		}
		statuses = append(statuses, fmt.Sprintf("%s:%d", qtype, reply.Status))
		if reply.Status != 0 {
			continue
		}
		for _, answer := range reply.Answer {
			if answer.Type != 1 && answer.Type != 28 {
				continue
			}
			if ip := net.ParseIP(answer.Data); ip != nil {
				addresses = append(addresses, ip.String())
			}
		}
	}
	result := map[string]any{
		"ok":        len(addresses) > 0,
		"host":      host,
		"provider":  "Google DoH",
		"latencyMs": time.Since(started).Milliseconds(),
		"addresses": addresses,
		"statuses":  statuses,
	}
	if len(addresses) == 0 {
		if len(errors) > 0 {
			result["error"] = strings.Join(errors, "; ")
		} else {
			result["error"] = "DoH не вернул адреса"
		}
	}
	return dpiAnnotate("dns", result)
}

func dpiStringList(value any) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		items := make([]string, 0, len(typed))
		for _, item := range typed {
			text := strings.TrimSpace(fmt.Sprint(item))
			if text != "" && text != "<nil>" {
				items = append(items, text)
			}
		}
		return items
	default:
		return nil
	}
}

func dpiIPOverlap(left []string, right []string) bool {
	seen := map[string]bool{}
	for _, item := range left {
		if ip := net.ParseIP(strings.TrimSpace(item)); ip != nil {
			seen[ip.String()] = true
		}
	}
	for _, item := range right {
		if ip := net.ParseIP(strings.TrimSpace(item)); ip != nil && seen[ip.String()] {
			return true
		}
	}
	return false
}

func dpiCompareDNS(routerDNS map[string]any, dohDNS map[string]any) map[string]any {
	routerOK := boolPayload(routerDNS, "ok", false)
	dohOK := boolPayload(dohDNS, "ok", false)
	routerAddresses := dpiStringList(routerDNS["addresses"])
	dohAddresses := dpiStringList(dohDNS["addresses"])
	result := map[string]any{
		"ok":        false,
		"router":    routerAddresses,
		"reference": dohAddresses,
	}
	switch {
	case routerOK && dohOK && dpiIPOverlap(routerAddresses, dohAddresses):
		result["ok"] = true
		result["code"] = "ok"
		result["label"] = "совпадает"
		result["detail"] = "Системный DNS роутера и внешний DoH вернули общий IP."
	case routerOK && dohOK:
		result["code"] = "dns-mismatch"
		result["label"] = "DNS отличается"
		result["detail"] = "Роутер и внешний DoH вернули разные IP. Это может быть CDN-география, DNS-фильтр или подмена ответа."
	case !routerOK && dohOK:
		result["code"] = "dns-local-fail"
		result["label"] = "DNS роутера не резолвит"
		result["detail"] = "Внешний DoH видит домен, а системный DNS роутера нет. Проверьте LAN DNS, dnsmasq и upstream."
	case routerOK && !dohOK:
		result["code"] = "doh-fail"
		result["label"] = "DoH не ответил"
		result["detail"] = "DNS роутера ответил, но эталонный DoH недоступен с роутера. Сравнение неполное."
	default:
		result["code"] = "dns-fail"
		result["label"] = "DNS не ответил"
		result["detail"] = "Не ответил ни системный DNS роутера, ни внешний DoH."
	}
	return result
}

func dpiTLSProbe(host string, port string, version uint16, timeoutMs int) map[string]any {
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	address := net.JoinHostPort(host, port)
	started := time.Now()
	conn, err := dialTCPPreferIPv4(address, time.Duration(timeoutMs)*time.Millisecond)
	if err != nil {
		return dpiAnnotate("tls", map[string]any{"ok": false, "address": address, "version": tlsVersionName(version), "latencyMs": time.Since(started).Milliseconds(), "error": err.Error()})
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(time.Duration(timeoutMs) * time.Millisecond))
	tlsConn := tls.Client(conn, &tls.Config{
		ServerName:         host,
		InsecureSkipVerify: true,
		MinVersion:         version,
		MaxVersion:         version,
	})
	err = tlsConn.Handshake()
	latency := time.Since(started).Milliseconds()
	result := map[string]any{"ok": err == nil, "address": address, "version": tlsVersionName(version), "latencyMs": latency}
	if err != nil {
		result["error"] = err.Error()
		return dpiAnnotate("tls", result)
	}
	state := tlsConn.ConnectionState()
	result["negotiated"] = tlsVersionName(state.Version)
	result["cipherSuite"] = state.CipherSuite
	return dpiAnnotate("tls", result)
}

func tlsVersionName(version uint16) string {
	switch version {
	case tls.VersionTLS13:
		return "TLS 1.3"
	case tls.VersionTLS12:
		return "TLS 1.2"
	case tls.VersionTLS11:
		return "TLS 1.1"
	case tls.VersionTLS10:
		return "TLS 1.0"
	default:
		return fmt.Sprintf("TLS 0x%x", version)
	}
}

func dpiHTTPReadProbe(rawURL string, timeoutMs int, readLimit int64) map[string]any {
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	if readLimit < 1 {
		readLimit = dpiLargeReadBytes
	}
	client := &http.Client{
		Timeout: time.Duration(timeoutMs) * time.Millisecond,
		Transport: &http.Transport{TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		}},
	}
	return dpiHTTPReadWithClient(client, rawURL, readLimit)
}

func dpiHTTPReadWithClient(client *http.Client, rawURL string, readLimit int64) map[string]any {
	req, err := newProbeHTTPRequest(rawURL)
	if err != nil {
		return dpiAnnotate("http", map[string]any{"ok": false, "latencyMs": int64(0), "targetBytes": readLimit, "error": err.Error()})
	}
	started := time.Now()
	resp, err := client.Do(req)
	latency := time.Since(started).Milliseconds()
	if err != nil {
		return dpiAnnotate("http", map[string]any{"ok": false, "latencyMs": latency, "targetBytes": readLimit, "error": err.Error()})
	}
	defer resp.Body.Close()
	copied, readErr := io.Copy(io.Discard, io.LimitReader(resp.Body, readLimit))
	result := map[string]any{
		"ok":          readErr == nil && resp.StatusCode < 500,
		"status":      resp.StatusCode,
		"latencyMs":   latency,
		"bytes":       copied,
		"targetBytes": readLimit,
	}
	if readErr != nil {
		result["error"] = readErr.Error()
	} else if resp.StatusCode >= 500 {
		result["error"] = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return dpiAnnotate("http", result)
}

func dpiReadProbeSet(run func(int64) map[string]any) map[string]any {
	probes := make([]map[string]any, 0, len(dpiReadProbeSizes))
	ok := true
	var firstBad map[string]any
	var totalBytes int64
	for _, size := range dpiReadProbeSizes {
		probe := run(size)
		probe["targetBytes"] = size
		probes = append(probes, probe)
		totalBytes += int64(number(probe["bytes"], 0))
		if !boolPayload(probe, "ok", false) && firstBad == nil {
			ok = false
			firstBad = probe
		}
	}
	result := map[string]any{
		"ok":     ok,
		"probes": probes,
		"bytes":  totalBytes,
	}
	if ok {
		result["code"] = "ok"
		result["label"] = "OK"
		result["detail"] = "Ответ читается на малом, среднем и крупном размере."
		return result
	}
	target := int64(number(firstBad["targetBytes"], 0))
	result["code"] = "read-stall"
	result["label"] = "обрыв чтения"
	result["detail"] = fmt.Sprintf("Проблема проявилась на размере %s: %s", dpiByteLabel(target), strings.TrimSpace(fmt.Sprint(firstBad["detail"])))
	if strings.TrimSpace(fmt.Sprint(firstBad["error"])) != "" {
		result["error"] = firstBad["error"]
	}
	return result
}

func dpiHTTPReadProbeSet(rawURL string, timeoutMs int) map[string]any {
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	client := &http.Client{
		Timeout: time.Duration(timeoutMs) * time.Millisecond,
		Transport: &http.Transport{TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		}},
	}
	return dpiReadProbeSet(func(size int64) map[string]any {
		return dpiHTTPReadWithClient(client, rawURL, size)
	})
}

func dpiByteLabel(bytes int64) string {
	if bytes >= 1024*1024 {
		return fmt.Sprintf("%.1f MB", float64(bytes)/(1024*1024))
	}
	if bytes >= 1024 {
		return fmt.Sprintf("%d KB", bytes/1024)
	}
	return fmt.Sprintf("%d B", bytes)
}

func dpiRedirectProbe(rawURL string, timeoutMs int) map[string]any {
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	client := &http.Client{
		Timeout: time.Duration(timeoutMs) * time.Millisecond,
		Transport: &http.Transport{TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		}},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	return dpiRedirectProbeWithClient(client, rawURL)
}

func dpiRedirectProbeWithClient(client *http.Client, rawURL string) map[string]any {
	current := rawURL
	startURL, _ := url.Parse(rawURL)
	hops := []map[string]any{}
	suspicious := false
	for i := 0; i < 6; i++ {
		req, err := newProbeHTTPRequest(current)
		if err != nil {
			return dpiAnnotate("http", map[string]any{"ok": false, "hops": hops, "error": err.Error()})
		}
		started := time.Now()
		resp, err := client.Do(req)
		latency := time.Since(started).Milliseconds()
		if err != nil {
			return dpiAnnotate("http", map[string]any{"ok": false, "hops": hops, "latencyMs": latency, "error": err.Error()})
		}
		location := resp.Header.Get("Location")
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 512))
		_ = resp.Body.Close()
		hop := map[string]any{"url": current, "status": resp.StatusCode, "latencyMs": latency}
		if location != "" {
			hop["location"] = location
		}
		hops = append(hops, hop)
		if resp.StatusCode < 300 || resp.StatusCode >= 400 || location == "" {
			break
		}
		next, err := url.Parse(location)
		if err != nil {
			suspicious = true
			break
		}
		base, _ := url.Parse(current)
		next = base.ResolveReference(next)
		if startURL != nil && !dpiSameOrSubdomain(next.Hostname(), startURL.Hostname()) {
			suspicious = true
		}
		current = next.String()
	}
	result := map[string]any{
		"ok":    true,
		"hops":  hops,
		"count": len(hops),
	}
	if suspicious {
		result["ok"] = false
		result["code"] = "redirect-suspicious"
		result["label"] = "чужой редирект"
		result["detail"] = "Цепочка редиректа уходит на другой домен. Это может быть нормальный CDN/login-flow или признак заглушки."
		return result
	}
	result["code"] = "ok"
	if len(hops) > 1 {
		result["label"] = fmt.Sprintf("%d редиректа", len(hops)-1)
	} else {
		result["label"] = "без редиректа"
	}
	return result
}

func dpiSameOrSubdomain(host string, root string) bool {
	host = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(host)), "www.")
	root = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(root)), "www.")
	return host == root || strings.HasSuffix(host, "."+root)
}

func dpiUDP443Probe(host string, timeoutMs int) map[string]any {
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 5000 {
		timeoutMs = 5000
	}
	address := net.JoinHostPort(host, "443")
	started := time.Now()
	conn, err := net.DialTimeout("udp4", address, time.Duration(timeoutMs)*time.Millisecond)
	if err != nil {
		return dpiAnnotate("udp", map[string]any{"ok": false, "address": address, "latencyMs": time.Since(started).Milliseconds(), "error": err.Error()})
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(time.Duration(timeoutMs) * time.Millisecond))
	_, err = conn.Write([]byte("RuOpenRay QUIC probe"))
	latency := time.Since(started).Milliseconds()
	if err != nil {
		return dpiAnnotate("udp", map[string]any{"ok": false, "address": address, "latencyMs": latency, "error": err.Error()})
	}
	result := map[string]any{
		"ok":        true,
		"code":      "udp-sent",
		"label":     "пакет отправлен",
		"address":   address,
		"latencyMs": latency,
		"detail":    "UDP не подтверждает доставку без полноценного QUIC-handshake, но локальная отправка на 443 не заблокирована ОС/маршрутом.",
	}
	return result
}

func dpiProbeMap(ok bool, latency int64, err error, extra map[string]any, stage string) map[string]any {
	result := map[string]any{"ok": ok}
	if latency > 0 {
		result["latencyMs"] = latency
	}
	for key, value := range extra {
		result[key] = value
	}
	if err != nil {
		result["error"] = err.Error()
	}
	return dpiAnnotate(stage, result)
}

func dpiAnnotate(stage string, result map[string]any) map[string]any {
	if boolPayload(result, "ok", false) {
		result["code"] = "ok"
		result["label"] = "OK"
		return result
	}
	if boolPayload(result, "skipped", false) {
		result["code"] = "skipped"
		result["label"] = "пропущено"
		return result
	}
	code, label, detail := dpiClassifyError(stage, fmt.Sprint(result["error"]))
	result["code"] = code
	result["label"] = label
	if strings.TrimSpace(detail) != "" {
		result["detail"] = detail
	}
	return result
}

func dpiClassifyError(stage string, errText string) (string, string, string) {
	value := strings.ToLower(strings.TrimSpace(errText))
	switch {
	case value == "" || value == "<nil>":
		return "fail", "нет ответа", "проверка не вернула успешный результат"
	case strings.Contains(value, "no such host") || strings.Contains(value, "server misbehaving") || strings.Contains(value, "name error"):
		return "dns-fail", "DNS FAIL", "домен не резолвится системным DNS роутера"
	case strings.Contains(value, "network is unreachable") || strings.Contains(value, "no route to host"):
		return "net-unreach", "NET UNREACH", "нет маршрута до цели или интерфейс не может отправить пакет"
	case strings.Contains(value, "timeout") || strings.Contains(value, "i/o timeout") || strings.Contains(value, "deadline exceeded"):
		if stage == "tcp" {
			return "tcp-timeout", "SYN DROP", "TCP-соединение не установилось до таймаута"
		}
		if stage == "tls" {
			return "tls-timeout", "TLS DROP", "TCP есть, но TLS-handshake завис или оборвался"
		}
		return "timeout", "TIMEOUT", "запрос не завершился до таймаута"
	case strings.Contains(value, "connection refused"):
		return "refused", "REFUSED", "порт ответил отказом соединения"
	case strings.Contains(value, "connection reset") || strings.Contains(value, "reset by peer"):
		if stage == "tls" || stage == "http" {
			return "tls-rst", "TLS RST", "соединение сброшено во время TLS/HTTP"
		}
		return "tcp-rst", "TCP RST", "TCP-соединение было сброшено"
	case strings.Contains(value, "connection aborted") || strings.Contains(value, "broken pipe") || strings.Contains(value, "unexpected eof") || strings.Contains(value, "server closed") || strings.Contains(value, "closed idle connection"):
		if stage == "tls" || stage == "http" {
			return "http-abort", "ABORT", "соединение оборвалось во время передачи данных"
		}
		return "tcp-abort", "TCP ABORT", "TCP-соединение было прервано"
	case strings.Contains(value, "handshake failure") || strings.Contains(value, "unrecognized name") || strings.Contains(value, "tls: alert"):
		return "tls-alert", "TLS ALERT", "сервер или промежуточный фильтр вернул TLS alert"
	case strings.Contains(value, "wrong version number") || strings.Contains(value, "record overflow") || strings.Contains(value, "decode error") || strings.Contains(value, "malformed") || strings.Contains(value, "first record does not look like a tls handshake"):
		return "tls-spoof", "TLS SPOOF", "ответ не похож на ожидаемый TLS-поток, возможна подмена или заглушка"
	case strings.Contains(value, "certificate") || strings.Contains(value, "unknown authority") || strings.Contains(value, "not valid for"):
		return "tls-mitm", "TLS MITM", "сертификат не похож на ожидаемый для домена"
	case strings.Contains(value, "http 403") || strings.Contains(value, "http 451"):
		return "http-block", "HTTP BLOCK", "сайт вернул статус, похожий на блокировку"
	case strings.Contains(value, "http 5"):
		return "http-target-error", "HTTP 5xx", "порт открыт, но сам сайт вернул серверную ошибку"
	default:
		return "fail", "ошибка", errText
	}
}

func dpiProbeVerdict(dns map[string]any, dnsCompare map[string]any, directTCP map[string]any, tls12 map[string]any, tls13 map[string]any, directHTTP map[string]any, directRead map[string]any, directRedirect map[string]any, proxyTCP map[string]any, proxyHTTP map[string]any, proxyRead map[string]any, proxyRedirect map[string]any) map[string]any {
	dnsOK := boolPayload(dns, "ok", false)
	directTCPOK := boolPayload(directTCP, "ok", false)
	tlsOK := boolPayload(tls12, "ok", false) || boolPayload(tls13, "ok", false) || boolPayload(tls12, "skipped", false)
	directHTTPOK := boolPayload(directHTTP, "ok", false)
	directReadOK := boolPayload(directRead, "ok", false)
	proxyTCPOK := boolPayload(proxyTCP, "ok", false)
	proxyHTTPOK := boolPayload(proxyHTTP, "ok", false)
	proxyReadOK := boolPayload(proxyRead, "ok", false)
	proxySelected := strings.TrimSpace(fmt.Sprint(proxyTCP["tag"])) != "" || strings.TrimSpace(fmt.Sprint(proxyHTTP["tag"])) != ""
	directHTTPStatus := number(directHTTP["status"], 0)
	if directHTTPStatus == 0 {
		directHTTPStatus = httpStatusFromError(fmt.Sprint(directHTTP["error"]))
	}
	switch {
	case !dnsOK:
		return map[string]any{"code": "dns-fail", "label": "DNS не отвечает", "detail": "Сначала проверьте DNS роутера: домен не превращается в IP до сетевых тестов."}
	case fmt.Sprint(dnsCompare["code"]) == "dns-mismatch":
		return map[string]any{"code": "dns-mismatch", "label": "DNS отличается от DoH", "detail": "Сетевые тесты можно читать дальше, но DNS роутера возвращает другой IP, чем внешний DoH. Для CDN это иногда нормально, для блокировок может быть симптомом."}
	case proxyHTTPOK && !directHTTPOK:
		return map[string]any{"code": "proxy-needed", "label": "нужен proxy", "detail": "Через выбранный proxy сайт открывается, напрямую нет. Это хороший кандидат для правила маршрутизации."}
	case proxyReadOK && directHTTPOK && !directReadOK:
		return map[string]any{"code": "read-stall", "label": "обрыв чтения напрямую", "detail": "HTTP отвечает, но тело ответа напрямую не дочитывается. Через proxy чтение проходит, похоже на DPI-обрыв потока."}
	case directReadOK && proxyHTTPOK && !proxyReadOK:
		return map[string]any{"code": "proxy-read-stall", "label": "proxy рвет чтение", "detail": "Напрямую тело ответа читается, а через выбранный proxy нет. Проверьте сервер, Reality/TLS-параметры или outbound."}
	case fmt.Sprint(directRedirect["code"]) == "redirect-suspicious":
		return map[string]any{"code": "redirect-suspicious", "label": "подозрительный редирект", "detail": "Прямой HTTP-ответ уходит на другой домен. Проверьте цепочку редиректа: это может быть нормальный CDN/login-flow или заглушка."}
	case fmt.Sprint(proxyRedirect["code"]) == "redirect-suspicious":
		return map[string]any{"code": "proxy-redirect-suspicious", "label": "редирект через proxy", "detail": "Через proxy цепочка уходит на другой домен. Возможно, сайт сам меняет endpoint, но стоит проверить результат."}
	case proxyHTTPOK && directHTTPOK:
		return map[string]any{"code": "both-ok", "label": "доступен", "detail": "Сайт открывается и напрямую, и через выбранный proxy. DPI-проблемы на этом URL не видно."}
	case directTCPOK && !tlsOK && proxyTCPOK:
		return map[string]any{"code": "tls-block", "label": "похоже на TLS-фильтр", "detail": "TCP-порт открыт, но TLS-handshake напрямую не проходит. Через proxy TCP доступен."}
	case !directTCPOK && proxyTCPOK:
		return map[string]any{"code": "tcp-block", "label": "TCP блокируется", "detail": "Напрямую порт не открывается, через proxy соединение есть."}
	case directHTTPOK && !proxySelected:
		return map[string]any{"code": "direct-ok-no-proxy", "label": "proxy не выбран", "detail": "Напрямую сайт открывается, но в конфигурации не найден proxy outbound для сравнения."}
	case directHTTPOK && !proxyHTTPOK:
		return map[string]any{"code": "direct-only", "label": "proxy не сработал", "detail": "Напрямую сайт открывается, но выбранный proxy не смог открыть URL. Проверьте сервер или outbound."}
	case directTCPOK && (directHTTPStatus == 403 || directHTTPStatus == 451):
		return map[string]any{"code": "http-block", "label": "HTTP блокировка", "detail": "Сеть дошла до HTTP, но статус похож на блокировку или отказ на стороне сайта."}
	case directTCPOK:
		return map[string]any{"code": "tcp-open", "label": "TCP открыт", "detail": "Базовый TCP проходит. Если сайт не работает, смотрите TLS/HTTP-этапы и правила Xray."}
	default:
		return map[string]any{"code": "down", "label": "не открылся", "detail": "DNS есть, но TCP/TLS/HTTP не подтвердили доступность."}
	}
}

func (s *serverState) dpiProbe(payload map[string]any) map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	rawURL, host, port, scheme, err := domainProbeURL(strings.TrimSpace(fmt.Sprint(payload["target"])), strings.TrimSpace(fmt.Sprint(payload["url"])))
	if err != nil {
		return map[string]any{"ok": false, "stderr": err.Error()}
	}
	timeoutMs := number(payload["timeoutMs"], 6000)
	if timeoutMs < 1000 {
		timeoutMs = 1000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	attempts := number(payload["attempts"], 2)
	if attempts < 1 {
		attempts = 1
	}
	if attempts > 4 {
		attempts = 4
	}

	dns := dpiDNSProbe(host, timeoutMs)
	dnsDoh := dpiDoHProbe(host, timeoutMs)
	dnsCompare := dpiCompareDNS(dns, dnsDoh)
	directTCP := dpiAnnotate("tcp", directTCPProbe(host, port, timeoutMs, attempts))
	tls12 := map[string]any{"ok": false, "skipped": true, "label": "пропущено", "code": "skipped", "detail": "TLS проверяется только для HTTPS на 443"}
	tls13 := map[string]any{"ok": false, "skipped": true, "label": "пропущено", "code": "skipped", "detail": "TLS проверяется только для HTTPS на 443"}
	if scheme == "https" && port == "443" {
		tls12 = dpiTLSProbe(host, port, tls.VersionTLS12, timeoutMs)
		tls13 = dpiTLSProbe(host, port, tls.VersionTLS13, timeoutMs)
	}
	directHTTP := dpiAnnotate("http", directHTTPProbe(rawURL, timeoutMs, attempts))
	directRead := dpiHTTPReadProbeSet(rawURL, timeoutMs)
	directRedirect := dpiRedirectProbe(rawURL, timeoutMs)
	udp443 := dpiUDP443Probe(host, timeoutMs)

	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	if tag == "<nil>" {
		tag = ""
	}
	outbound := map[string]any(nil)
	if tag != "" {
		outbound = findOutboundByTag(cfg, tag)
	}
	proxyTCP := dpiAnnotate("tcp", map[string]any{"ok": false, "tag": tag, "error": "выбранный proxy не найден"})
	proxyHTTP := dpiAnnotate("http", map[string]any{"ok": false, "tag": tag, "error": "выбранный proxy не найден"})
	proxyRead := dpiAnnotate("http", map[string]any{"ok": false, "tag": tag, "targetBytes": dpiLargeReadBytes, "error": "выбранный proxy не найден"})
	proxyRedirect := dpiAnnotate("http", map[string]any{"ok": false, "tag": tag, "error": "выбранный proxy не найден"})
	if tag == "" {
		proxyTCP = dpiAnnotate("tcp", map[string]any{"ok": false, "skipped": true, "detail": "Выберите proxy для сравнения с прямым доступом."})
		proxyHTTP = dpiAnnotate("http", map[string]any{"ok": false, "skipped": true, "detail": "Выберите proxy для сравнения с прямым доступом."})
		proxyRead = dpiAnnotate("http", map[string]any{"ok": false, "skipped": true, "targetBytes": dpiLargeReadBytes, "detail": "Выберите proxy для сравнения с прямым доступом."})
		proxyRedirect = dpiAnnotate("http", map[string]any{"ok": false, "skipped": true, "detail": "Выберите proxy для сравнения с прямым доступом."})
	}
	if outbound != nil {
		tcpLatency, tcpOK, tcpErr := s.tcpOutboundProbe(outbound, host, port, timeoutMs, attempts)
		proxyTCP = dpiProbeMap(tcpOK, tcpLatency, tcpErr, map[string]any{"tag": tag, "address": net.JoinHostPort(host, port), "attempts": attempts}, "tcp")
		latency, httpOK, httpErr := s.httpOutboundProbe(outbound, rawURL, timeoutMs, attempts)
		proxyHTTP = dpiProbeMap(httpOK, latency, httpErr, map[string]any{"tag": tag, "attempts": attempts}, "http")
		if httpErr != nil {
			if status := httpStatusFromError(httpErr.Error()); status > 0 {
				proxyHTTP["status"] = status
			}
		}
		proxyRead = s.httpOutboundReadProbeSet(outbound, rawURL, timeoutMs)
		proxyRead["tag"] = tag
		proxyRedirect = s.httpOutboundRedirectProbe(outbound, rawURL, timeoutMs)
		proxyRedirect["tag"] = tag
	}
	checks := map[string]any{
		"dns":            dns,
		"dnsDoh":         dnsDoh,
		"dnsCompare":     dnsCompare,
		"tcpDirect":      directTCP,
		"tls12":          tls12,
		"tls13":          tls13,
		"httpDirect":     directHTTP,
		"readDirect":     directRead,
		"redirectDirect": directRedirect,
		"udp443":         udp443,
		"tcpProxy":       proxyTCP,
		"httpProxy":      proxyHTTP,
		"readProxy":      proxyRead,
		"redirectProxy":  proxyRedirect,
	}
	return map[string]any{
		"ok":       true,
		"host":     host,
		"url":      rawURL,
		"endpoint": map[string]any{"host": host, "port": port, "scheme": scheme},
		"tag":      tag,
		"checks":   checks,
		"verdict":  dpiProbeVerdict(dns, dnsCompare, directTCP, tls12, tls13, directHTTP, directRead, directRedirect, proxyTCP, proxyHTTP, proxyRead, proxyRedirect),
	}
}
