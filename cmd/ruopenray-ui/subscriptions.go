package main

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	rproxy "github.com/AceAsket/RuOpenRay-Keenetic/internal/proxy"
	rsubscription "github.com/AceAsket/RuOpenRay-Keenetic/internal/subscription"
)

func (s *serverState) subscriptionStorePath() string {
	return filepath.Join(s.cfg.DataDir, "subscriptions.json")
}

func (s *serverState) readSubscriptionStore() rsubscription.Store {
	return rsubscription.LoadStore(s.subscriptionStorePath())
}

func (s *serverState) writeSubscriptionStore(store rsubscription.Store) error {
	return rsubscription.SaveStore(s.subscriptionStorePath(), store)
}

func (s *serverState) subscriptionReport() map[string]any {
	store := s.readSubscriptionStore()
	return map[string]any{"ok": true, "pools": rsubscription.PublicPools(store)}
}

func (s *serverState) saveSubscriptionPool(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	if tag == "" || tag == "<nil>" {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "Укажите стабильный outbound tag для подписки"})
		return
	}
	candidates := []map[string]any{}
	for _, item := range asArray(payload["outbounds"]) {
		if outbound, ok := item.(map[string]any); ok && fmt.Sprint(outbound["tag"]) != "" {
			candidates = append(candidates, outbound)
		}
	}
	if len(candidates) == 0 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "В подписке нет кандидатов для pool"})
		return
	}
	active := rsubscription.NormalizeActive(number(payload["active"], 0), len(candidates))
	pool := rsubscription.Pool{
		Tag:        tag,
		URL:        strings.TrimSpace(fmt.Sprint(payload["url"])),
		Active:     active,
		UpdatedAt:  time.Now().Format(time.RFC3339),
		Candidates: candidates,
	}
	store := rsubscription.UpsertPool(s.readSubscriptionStore(), pool)
	if err := s.writeSubscriptionStore(store); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "pool": rsubscription.PublicPool(pool)})
}

func (s *serverState) deleteSubscriptionPool(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	if tag == "" || tag == "<nil>" {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "Укажите подписку для удаления"})
		return
	}
	store, removed := rsubscription.RemovePool(s.readSubscriptionStore(), tag)
	if !removed {
		writeJSON(w, 404, map[string]any{"ok": false, "error": "Подписка не найдена"})
		return
	}
	if err := s.writeSubscriptionStore(store); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "tag": tag})
}

func (s *serverState) selectSubscriptionCandidate(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	store := s.readSubscriptionStore()
	poolIndex := rsubscription.FindPoolIndex(store, tag)
	if poolIndex < 0 {
		writeJSON(w, 404, map[string]any{"ok": false, "error": "Subscription pool не найден"})
		return
	}
	pool := store.Pools[poolIndex]
	if len(pool.Candidates) == 0 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "В pool нет серверов"})
		return
	}
	selected := number(payload["index"], -1)
	if selected < 0 || selected >= len(pool.Candidates) {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "Выбранный сервер подписки не найден"})
		return
	}

	cfg, err := s.readActiveConfig()
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	cfg["outbounds"] = rproxy.ReplaceOutboundByTag(asArray(cfg["outbounds"]), pool.Tag, rproxy.CloneOutboundWithTag(pool.Candidates[selected], pool.Tag))
	backup, _ := s.backupActive("subscription-select")
	if err := s.writeActiveConfig(cfg); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error(), "backup": backup})
		return
	}

	pool.Active = selected
	pool.UpdatedAt = time.Now().Format(time.RFC3339)
	store.Pools[poolIndex] = pool
	if err := s.writeSubscriptionStore(store); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error(), "backup": backup})
		return
	}
	restart := map[string]any{"ok": true, "stdout": "Xray не перезапущен"}
	if boolPayload(payload, "restart", true) {
		restart = s.serviceAction("restart")
	}
	writeJSON(w, 200, map[string]any{
		"ok": restart["ok"], "pool": rsubscription.PublicPool(pool),
		"selected": rproxy.OutboundSummary(pool.Candidates[selected]), "backup": backup, "restart": restart,
	})
}

type subscriptionCandidateCheckOptions struct {
	mode      string
	probeURL  string
	timeoutMs int
	attempts  int
	robust    bool
}

func normalizeSubscriptionCandidateCheckOptions(payload map[string]any) subscriptionCandidateCheckOptions {
	checkMode := strings.ToLower(firstNonEmpty(fmt.Sprint(payload["mode"]), "http"))
	if checkMode != "endpoint" && checkMode != "http" {
		checkMode = "http"
	}
	robust := boolPayload(payload, "robust", false)
	probeURL := firstNonEmpty(fmt.Sprint(payload["url"]), "https://www.gstatic.com/generate_204")
	timeoutMs := number(payload["timeoutMs"], 5000)
	attempts := number(payload["attempts"], 1)
	if timeoutMs < 300 {
		timeoutMs = 300
	}
	if robust && checkMode == "http" && timeoutMs < 5000 {
		timeoutMs = 5000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	if attempts < 1 {
		attempts = 1
	}
	if robust && (checkMode == "http" || checkMode == "endpoint") && attempts < 3 {
		attempts = 3
	}
	if attempts > 5 {
		attempts = 5
	}
	return subscriptionCandidateCheckOptions{
		mode:      checkMode,
		probeURL:  probeURL,
		timeoutMs: timeoutMs,
		attempts:  attempts,
		robust:    robust,
	}
}

func (s *serverState) checkSubscriptionCandidateResult(index int, candidate map[string]any, options subscriptionCandidateCheckOptions) map[string]any {
	summary := rproxy.OutboundSummary(candidate)
	result := map[string]any{
		"index":     index,
		"tag":       summary["tag"],
		"protocol":  summary["protocol"],
		"address":   summary["address"],
		"port":      summary["port"],
		"network":   summary["network"],
		"security":  summary["security"],
		"method":    options.mode,
		"url":       options.probeURL,
		"checkedAt": time.Now().Format(time.RFC3339),
	}
	ok := false
	var err error
	address := fmt.Sprint(summary["address"])
	portValue := number(summary["port"], 0)
	endpointTimeoutMs := options.timeoutMs
	if endpointTimeoutMs > 3000 {
		endpointTimeoutMs = 3000
	}
	if portValue > 0 && address != "" {
		pingTimeoutMs := endpointTimeoutMs
		if pingTimeoutMs > 1500 {
			pingTimeoutMs = 1500
		}
		ping := directPingProbe(address, pingTimeoutMs)
		result["ping"] = ping
		result["pingOk"] = ping["ok"] == true
		if pingLatency := number(ping["latencyMs"], 0); pingLatency > 0 {
			result["pingLatencyMs"] = pingLatency
		}
	}
	if options.mode == "endpoint" {
		latency, endpointOK, endpointErr := directEndpointTCPProbe(address, portValue, endpointTimeoutMs, options.attempts)
		ok = endpointOK
		err = endpointErr
		result["endpointOk"] = endpointOK
		if latency > 0 {
			result["endpointLatencyMs"] = latency
			result["latencyMs"] = latency
		}
	} else {
		latency, endpointOK, endpointErr := directEndpointTCPProbe(address, portValue, endpointTimeoutMs, 1)
		result["endpointOk"] = endpointOK
		if latency > 0 {
			result["endpointLatencyMs"] = latency
		}
		if endpointErr != nil {
			result["endpointError"] = endpointErr.Error()
		}
		latency, httpOK, httpErr := s.httpOutboundProbe(candidate, options.probeURL, options.timeoutMs, options.attempts)
		ok = httpOK
		err = httpErr
		result["httpOk"] = httpOK
		if latency > 0 {
			result["httpLatencyMs"] = latency
			result["latencyMs"] = latency
		}
	}
	result["ok"] = ok
	if err != nil {
		result["error"] = err.Error()
	}
	return result
}

func (s *serverState) checkSubscriptionCandidate(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	index := number(payload["index"], -1)
	store := s.readSubscriptionStore()
	poolIndex := rsubscription.FindPoolIndex(store, tag)
	if poolIndex < 0 {
		writeJSON(w, 404, map[string]any{"ok": false, "error": "Subscription pool не найден"})
		return
	}
	pool := store.Pools[poolIndex]
	if index < 0 || index >= len(pool.Candidates) {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "Сервер подписки не найден"})
		return
	}
	result := s.checkSubscriptionCandidateResult(index, pool.Candidates[index], normalizeSubscriptionCandidateCheckOptions(payload))
	saveError := ""
	if err := s.saveSubscriptionCandidateCheckResults(tag, []map[string]any{result}); err != nil {
		saveError = err.Error()
	}
	response := map[string]any{"ok": true, "tag": tag, "index": index, "result": result, "saved": saveError == ""}
	if saveError != "" {
		response["saveError"] = saveError
	}
	writeJSON(w, 200, response)
}

func subscriptionCandidateTag(poolTag string, candidate map[string]any, index int) string {
	prefix := slugID(poolTag, "subscription")
	base := slugID(fmt.Sprint(candidate["tag"]), fmt.Sprintf("server-%d", index+1))
	tag := strings.Trim(prefix+"-"+base, "-")
	if len(tag) > 96 {
		tag = strings.Trim(tag[:96], "-")
	}
	if tag == "" {
		return fmt.Sprintf("subscription-server-%d", index+1)
	}
	return tag
}

func (s *serverState) exportSubscriptionCandidates(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	store := s.readSubscriptionStore()
	poolIndex := rsubscription.FindPoolIndex(store, tag)
	if poolIndex < 0 {
		writeJSON(w, 404, map[string]any{"ok": false, "error": "Subscription pool не найден"})
		return
	}
	pool := store.Pools[poolIndex]
	if len(pool.Candidates) == 0 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "В pool нет серверов"})
		return
	}

	selected := []int{}
	if boolPayload(payload, "all", false) {
		for index := range pool.Candidates {
			selected = append(selected, index)
		}
	} else {
		seen := map[int]bool{}
		for _, value := range asArray(payload["indexes"]) {
			index := number(value, -1)
			if index >= 0 && index < len(pool.Candidates) && !seen[index] {
				selected = append(selected, index)
				seen[index] = true
			}
		}
	}
	if len(selected) == 0 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "Выберите хотя бы один сервер подписки"})
		return
	}

	outbounds := []map[string]any{}
	items := []map[string]any{}
	for _, index := range selected {
		candidate := pool.Candidates[index]
		cloned := rproxy.CloneOutboundWithTag(candidate, subscriptionCandidateTag(pool.Tag, candidate, index))
		outbounds = append(outbounds, cloned)
		items = append(items, rproxy.OutboundSummary(cloned))
	}
	writeJSON(w, 200, map[string]any{"ok": true, "tag": pool.Tag, "count": len(outbounds), "outbounds": outbounds, "items": items})
}

func subscriptionOutboundsFromURL(rawURL string) ([]map[string]any, int, error) {
	links, err := subscriptionLinks(rawURL)
	if err != nil {
		return nil, 0, err
	}
	outbounds := []map[string]any{}
	for _, link := range links {
		outbound, err := rproxy.ParseShareLink(link)
		if err == nil {
			outbounds = append(outbounds, outbound)
		}
	}
	return outbounds, len(links), nil
}

func sameSubscriptionCandidate(a map[string]any, b map[string]any) bool {
	left := rproxy.OutboundSummary(a)
	right := rproxy.OutboundSummary(b)
	if fmt.Sprint(left["tag"]) != "" && fmt.Sprint(left["tag"]) == fmt.Sprint(right["tag"]) {
		return true
	}
	return fmt.Sprint(left["address"]) == fmt.Sprint(right["address"]) && fmt.Sprint(left["port"]) == fmt.Sprint(right["port"])
}

func preserveSubscriptionActive(previous rsubscription.Pool, candidates []map[string]any) int {
	if len(candidates) == 0 {
		return 0
	}
	if previous.Active >= 0 && previous.Active < len(previous.Candidates) {
		active := previous.Candidates[previous.Active]
		for index, candidate := range candidates {
			if sameSubscriptionCandidate(active, candidate) {
				return index
			}
		}
	}
	return rsubscription.NormalizeActive(previous.Active, len(candidates))
}

func (s *serverState) refreshSubscriptionPool(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	store := s.readSubscriptionStore()
	poolIndex := rsubscription.FindPoolIndex(store, tag)
	if poolIndex < 0 {
		writeJSON(w, 404, map[string]any{"ok": false, "error": "Subscription pool не найден"})
		return
	}
	pool := store.Pools[poolIndex]
	rawURL := strings.TrimSpace(firstNonEmpty(fmt.Sprint(payload["url"]), pool.URL))
	if rawURL == "" || rawURL == "<nil>" {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "У подписки нет URL для обновления"})
		return
	}
	candidates, links, err := subscriptionOutboundsFromURL(rawURL)
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if len(candidates) == 0 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "В подписке не найдены поддерживаемые серверы", "links": links})
		return
	}
	before := len(pool.Candidates)
	pool.URL = rawURL
	pool.Candidates = candidates
	pool.Active = preserveSubscriptionActive(store.Pools[poolIndex], candidates)
	pool.UpdatedAt = time.Now().Format(time.RFC3339)
	store.Pools[poolIndex] = pool
	if err := s.writeSubscriptionStore(store); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "before": before, "links": links, "count": len(candidates), "pool": rsubscription.PublicPool(pool)})
}

func (s *serverState) setSubscriptionFallbackProgress(progress map[string]any) {
	s.fallbackMu.Lock()
	defer s.fallbackMu.Unlock()
	if progress == nil {
		s.fallbackProgress = nil
		return
	}
	next := map[string]any{}
	for key, value := range progress {
		next[key] = value
	}
	next["updatedAt"] = time.Now().Format(time.RFC3339)
	s.fallbackProgress = next
}

func (s *serverState) subscriptionFallbackProgress(tag string) map[string]any {
	s.fallbackMu.Lock()
	defer s.fallbackMu.Unlock()
	if s.fallbackProgress == nil {
		return map[string]any{"ok": true, "active": false}
	}
	if tag != "" && fmt.Sprint(s.fallbackProgress["tag"]) != tag {
		return map[string]any{"ok": true, "active": false}
	}
	next := map[string]any{"ok": true, "active": true}
	for key, value := range s.fallbackProgress {
		next[key] = value
	}
	return next
}

func (s *serverState) fallbackSubscription(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	payload["robust"] = true
	tag := strings.TrimSpace(fmt.Sprint(payload["tag"]))
	store := s.readSubscriptionStore()
	poolIndex := rsubscription.FindPoolIndex(store, tag)
	if poolIndex < 0 {
		writeJSON(w, 404, map[string]any{"ok": false, "error": "Subscription pool не найден"})
		return
	}
	pool := store.Pools[poolIndex]
	if len(pool.Candidates) == 0 {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "В pool нет кандидатов"})
		return
	}
	options := normalizeSubscriptionCandidateCheckOptions(payload)

	results := []map[string]any{}
	selected := -1
	s.setSubscriptionFallbackProgress(map[string]any{
		"tag": tag, "total": len(pool.Candidates), "checked": 0, "currentStep": 0,
	})
	defer s.setSubscriptionFallbackProgress(nil)
	for step := 1; step <= len(pool.Candidates); step++ {
		select {
		case <-r.Context().Done():
			return
		default:
		}
		index := (pool.Active + step) % len(pool.Candidates)
		candidate := pool.Candidates[index]
		summary := rproxy.OutboundSummary(candidate)
		s.setSubscriptionFallbackProgress(map[string]any{
			"tag": tag, "total": len(pool.Candidates), "checked": len(results),
			"currentStep": step, "currentIndex": index, "currentTag": summary["tag"],
			"currentAddress": summary["address"], "currentPort": summary["port"],
		})
		result := s.checkSubscriptionCandidateResult(index, candidate, options)
		ok := result["ok"] == true
		results = append(results, result)
		_ = s.saveSubscriptionCandidateCheckResults(tag, []map[string]any{result})
		select {
		case <-r.Context().Done():
			return
		default:
		}
		s.setSubscriptionFallbackProgress(map[string]any{
			"tag": tag, "total": len(pool.Candidates), "checked": len(results),
			"currentStep": step, "currentIndex": index, "currentTag": summary["tag"],
			"currentAddress": summary["address"], "currentPort": summary["port"], "lastOk": ok,
		})
		if ok {
			selected = index
			break
		}
	}
	if selected < 0 {
		writeJSON(w, 200, map[string]any{"ok": false, "pool": rsubscription.PublicPool(pool), "results": results, "error": "Живой кандидат не найден"})
		return
	}

	cfg, err := s.readActiveConfig()
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error(), "results": results})
		return
	}
	cfg["outbounds"] = rproxy.ReplaceOutboundByTag(asArray(cfg["outbounds"]), pool.Tag, rproxy.CloneOutboundWithTag(pool.Candidates[selected], pool.Tag))
	backup, _ := s.backupActive("subscription-fallback")
	if err := s.writeActiveConfig(cfg); err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error(), "backup": backup, "results": results})
		return
	}
	pool.Active = selected
	pool.UpdatedAt = time.Now().Format(time.RFC3339)
	store.Pools[poolIndex] = pool
	_ = s.writeSubscriptionStore(store)
	restart := map[string]any{"ok": true, "stdout": "Xray не перезапущен"}
	if boolPayload(payload, "restart", true) {
		restart = s.serviceAction("restart")
	}
	writeJSON(w, 200, map[string]any{"ok": restart["ok"], "pool": rsubscription.PublicPool(pool), "selected": rproxy.OutboundSummary(pool.Candidates[selected]), "results": results, "backup": backup, "restart": restart})
}

func (s *serverState) checkOutbounds(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	cfg, err := s.readActiveConfig()
	if err != nil {
		respond(w, nil, err)
		return
	}
	checkMode := strings.ToLower(firstNonEmpty(fmt.Sprint(payload["mode"]), "http"))
	if checkMode != "endpoint" && checkMode != "http" {
		checkMode = "http"
	}
	probeURL := firstNonEmpty(fmt.Sprint(payload["url"]), "https://www.gstatic.com/generate_204")
	timeoutMs := number(payload["timeoutMs"], 5000)
	if timeoutMs < 300 {
		timeoutMs = 300
	}
	if checkMode == "http" && timeoutMs < 5000 {
		timeoutMs = 5000
	}
	if timeoutMs > 15000 {
		timeoutMs = 15000
	}
	attempts := number(payload["attempts"], 1)
	if attempts < 1 {
		attempts = 1
	}
	if (checkMode == "http" || checkMode == "endpoint") && attempts < 3 {
		attempts = 3
	}
	if attempts > 5 {
		attempts = 5
	}
	filter := map[string]bool{}
	for _, tag := range asArray(payload["tags"]) {
		filter[fmt.Sprint(tag)] = true
	}

	results := []map[string]any{}
	for _, item := range asArray(cfg["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if !ok {
			continue
		}
		summary := rproxy.OutboundSummary(outbound)
		tag := fmt.Sprint(summary["tag"])
		if len(filter) > 0 && !filter[tag] {
			continue
		}
		protocol := fmt.Sprint(summary["protocol"])
		address := fmt.Sprint(summary["address"])
		portValue := number(summary["port"], 0)
		system := protocol == "freedom" || protocol == "blackhole" || protocol == "dns" || tag == "direct" || tag == "block" || tag == "dns-out"
		if system && len(filter) == 0 {
			continue
		}
		result := map[string]any{
			"tag": summary["tag"], "protocol": protocol, "address": address, "port": portValue,
			"network": summary["network"], "security": summary["security"], "checkedAt": time.Now().Format(time.RFC3339), "method": checkMode,
		}
		if system || address == "" || portValue <= 0 {
			result["ok"] = false
			result["skipped"] = true
			result["error"] = "Нет endpoint для проверки"
			results = append(results, result)
			continue
		}
		pingTimeoutMs := timeoutMs
		if pingTimeoutMs > 2000 {
			pingTimeoutMs = 2000
		}
		ping := directPingProbe(address, pingTimeoutMs)
		result["ping"] = ping
		result["pingOk"] = ping["ok"] == true
		if latency := number(ping["latencyMs"], 0); latency > 0 {
			result["pingLatencyMs"] = latency
		}
		best, checkOK, lastErr := directEndpointTCPProbe(address, portValue, timeoutMs, attempts)
		if best > 0 {
			result["endpointLatencyMs"] = best
		}
		result["endpointOk"] = checkOK
		if checkMode == "endpoint" {
			result["ok"] = checkOK
			if best > 0 {
				result["latencyMs"] = best
			}
			if !checkOK && lastErr != nil {
				result["error"] = lastErr.Error()
			}
			results = append(results, result)
			continue
		}
		httpBest, httpOK, httpErr := s.httpOutboundProbe(outbound, probeURL, timeoutMs, attempts)
		result["url"] = probeURL
		result["httpOk"] = httpOK
		result["ok"] = httpOK
		if httpBest > 0 {
			result["httpLatencyMs"] = httpBest
			result["latencyMs"] = httpBest
		}
		if !httpOK {
			if httpErr != nil {
				result["error"] = httpErr.Error()
			} else if lastErr != nil {
				result["error"] = lastErr.Error()
			} else {
				result["error"] = "HTTP probe failed"
			}
		}
		results = append(results, result)
	}
	response := map[string]any{"ok": true, "timeoutMs": timeoutMs, "attempts": attempts, "mode": checkMode, "url": probeURL, "results": results, "saved": true}
	if err := s.saveOutboundCheckResults(results); err != nil {
		response["saved"] = false
		response["saveError"] = err.Error()
	}
	writeJSON(w, 200, response)
}
