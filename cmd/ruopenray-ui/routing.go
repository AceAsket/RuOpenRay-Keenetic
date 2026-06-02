package main

import (
	"fmt"
	"net/url"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	rrouting "github.com/AceAsket/RuOpenRay-Keenetic/internal/routing"
)

func (s *serverState) disabledRouteRulesPath() string {
	return filepath.Join(s.cfg.DataDir, "disabled-routes.json")
}

func (s *serverState) disabledRouteRules() []map[string]any {
	return rrouting.LoadDisabledRules(s.disabledRouteRulesPath())
}

func (s *serverState) saveDisabledRouteRules(payload map[string]any) map[string]any {
	raw, _ := payload["rules"].([]any)
	rules, err := rrouting.SaveDisabledRules(s.disabledRouteRulesPath(), raw)
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}
	}
	return map[string]any{"ok": true, "rules": rules}
}

func routerHTTPProbe(payload map[string]any) map[string]any {
	rawURL := strings.TrimSpace(fmt.Sprint(payload["url"]))
	if rawURL == "" || rawURL == "<nil>" {
		rawURL = "https://www.gstatic.com/generate_204"
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return map[string]any{"ok": false, "error": "нужен http/https URL"}
	}
	timeoutSeconds := 8
	if rawTimeout := strings.TrimSpace(fmt.Sprint(payload["timeout"])); rawTimeout != "" && rawTimeout != "<nil>" {
		if parsedTimeout, err := strconv.Atoi(rawTimeout); err == nil {
			timeoutSeconds = parsedTimeout
		}
	}
	if timeoutSeconds < 2 {
		timeoutSeconds = 2
	}
	if timeoutSeconds > 30 {
		timeoutSeconds = 30
	}
	timeout := time.Duration(timeoutSeconds) * time.Second
	if curl, err := exec.LookPath("curl"); err == nil {
		result := runTimeout(timeout+time.Second, curl, "-L", "-k", "-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", strconv.Itoa(timeoutSeconds), rawURL)
		result["tool"] = "curl"
		result["url"] = rawURL
		result["status"] = strings.TrimSpace(fmt.Sprint(result["stdout"]))
		return result
	}
	if wget, err := exec.LookPath("wget"); err == nil {
		result := runTimeout(timeout+time.Second, wget, "-q", "-T", strconv.Itoa(timeoutSeconds), "-O", "/dev/null", rawURL)
		result["tool"] = "wget"
		result["url"] = rawURL
		return result
	}
	return map[string]any{"ok": false, "url": rawURL, "error": "на роутере не найден curl или wget"}
}
