package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	rsystem "github.com/AceAsket/RuOpenRay-Keenetic/internal/system"
)

const maxJSONBodyBytes = 2 * 1024 * 1024
const rememberSessionTTL = 30 * 24 * time.Hour

func writeJSON(w http.ResponseWriter, code int, payload any) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.Header().Set("cache-control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(payload)
}

func readJSON(w http.ResponseWriter, r *http.Request) (map[string]any, error) {
	if r.Body == nil {
		return map[string]any{}, nil
	}
	defer r.Body.Close()
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil || len(bytes.TrimSpace(body)) == 0 {
		return map[string]any{}, err
	}
	var payload map[string]any
	err = json.Unmarshal(body, &payload)
	return payload, err
}

func (s *serverState) handleAPI(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if recovered := recover(); recovered != nil {
			writeJSON(w, 500, map[string]any{"ok": false, "error": fmt.Sprint(recovered)})
		}
	}()
	path := strings.TrimPrefix(r.URL.Path, "/api")
	if path == "/login" && r.Method == http.MethodPost {
		payload, err := readJSON(w, r)
		if err != nil {
			writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		if subtle.ConstantTimeCompare([]byte(fmt.Sprint(payload["password"])), []byte(s.cfg.Password)) != 1 {
			writeJSON(w, 401, map[string]any{"ok": false, "error": "Неверный пароль"})
			return
		}
		remember, _ := payload["remember"].(bool)
		token := randomToken()
		if remember {
			token = signedRememberToken(s.cfg.Password, time.Now().Add(rememberSessionTTL))
		}
		s.addSession(token)
		cookie := &http.Cookie{Name: "openray_session", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode}
		if remember {
			cookie.Expires = time.Now().Add(rememberSessionTTL)
			cookie.MaxAge = int(rememberSessionTTL.Seconds())
		}
		http.SetCookie(w, cookie)
		writeJSON(w, 200, map[string]any{"ok": true, "token": token})
		return
	}
	if !s.authed(r) {
		writeJSON(w, 401, map[string]any{"ok": false, "error": "Требуется авторизация"})
		return
	}
	switch {
	case path == "/status" && r.Method == http.MethodGet:
		s.status(w)
	case path == "/config" && r.Method == http.MethodGet:
		cfg, err := s.readActiveConfig()
		respond(w, cfg, err)
	case path == "/config/draft" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.readConfigDraft())
	case path == "/config/draft" && r.Method == http.MethodPost:
		payload, err := readJSON(w, r)
		if err != nil {
			writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, 200, s.saveConfigDraft(payload))
	case path == "/config/draft" && r.Method == http.MethodDelete:
		writeJSON(w, 200, s.clearConfigDraft())
	case path == "/config/test" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		cfg, _ := payload["config"].(map[string]any)
		result := s.validateConfigWithGeoAudit(cfg)
		writeJSON(w, 200, result)
	case path == "/config/analyze" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		cfg, _ := payload["config"].(map[string]any)
		writeJSON(w, 200, s.analyzeConfig(cfg))
	case path == "/config/apply" && r.Method == http.MethodPost:
		s.applyConfig(w, r)
	case path == "/routing/disabled" && r.Method == http.MethodGet:
		writeJSON(w, 200, map[string]any{"ok": true, "rules": s.disabledRouteRules()})
	case path == "/routing/disabled" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.saveDisabledRouteRules(payload))
	case path == "/routing/names" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.routeNamesReport())
	case path == "/routing/names" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.saveRouteNames(payload))
	case path == "/routing/presets" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.routePresetsReport())
	case path == "/routing/presets" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.saveRoutePresets(payload))
	case path == "/routing/preset-sources/check" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.routePresetSourceCheck(payload))
	case path == "/routing/preset-sources" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.saveRoutePresetSource(payload))
	case path == "/routing/preset-sources/update" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.updateRoutePresetSources(payload))
	case path == "/routing/preset-sources/delete" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.deleteRoutePresetSource(payload))
	case path == "/routing/preset-sources/toggle" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.toggleRoutePresetSource(payload))
	case path == "/server-meta" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.serverMetaReport())
	case path == "/server-meta" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.saveServerMeta(payload))
	case path == "/service" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.serviceAction(fmt.Sprint(payload["action"])))
	case path == "/settings/password" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.changePassword(payload))
	case path == "/settings/logging" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.loggingSettings())
	case path == "/settings/logging" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.saveLoggingSettings(payload))
	case path == "/settings/logging/clear" && r.Method == http.MethodPost:
		writeJSON(w, 200, s.clearLogFiles())
	case path == "/settings/service" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.serviceSettings())
	case path == "/settings/service" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.saveServiceSettings(payload))
	case path == "/settings/keenetic" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.keeneticSettings())
	case path == "/settings/keenetic" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.saveKeeneticSettings(payload))
	case path == "/storage/report" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.storageReport())
	case path == "/storage/cleanup" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.cleanupStorage(payload))
	case path == "/install/plan" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.installPlan())
	case path == "/network/tcp-fast-open" && r.Method == http.MethodGet:
		writeJSON(w, 200, rsystem.TCPFastOpenStatus())
	case path == "/network/tcp-fast-open" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, rsystem.SetTCPFastOpen(boolPayload(payload, "enabled", true)))
	case path == "/firewall/status" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.firewallStatus())
	case path == "/firewall/snapshot" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.firewallSnapshot())
	case path == "/firewall/preview" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.previewFirewall(payload))
	case path == "/firewall/apply" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.applyFirewall(payload))
	case path == "/firewall/repair" && r.Method == http.MethodPost:
		writeJSON(w, 200, s.repairFirewall())
	case path == "/firewall/disable" && r.Method == http.MethodPost:
		writeJSON(w, 200, s.disableFirewall())
	case path == "/firewall/restore" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.restoreFirewallSnapshot(payload))
	case path == "/xray/stats" && r.Method == http.MethodGet:
		cfg, _ := s.readActiveConfig()
		writeJSON(w, 200, s.xrayTrafficStats(cfg, false))
	case path == "/xray/stats/settings" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.saveXrayStatsSettings(boolPayload(payload, "enabled", true)))
	case path == "/xray/stats/reset" && r.Method == http.MethodPost:
		cfg, _ := s.readActiveConfig()
		writeJSON(w, 200, s.xrayTrafficStats(cfg, true))
	case path == "/core/releases" && r.Method == http.MethodGet:
		releases, err := xrayCoreReleases()
		respond(w, map[string]any{"ok": true, "releases": releases, "asset": xrayAssetName(), "arch": systemArchitecture("github-release")}, err)
	case path == "/core/update" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.updateCore(strings.TrimSpace(fmt.Sprint(payload["version"])), boolPayload(payload, "backup", false)))
	case path == "/app/releases" && r.Method == http.MethodGet:
		release, err := appLatestRelease()
		respond(w, map[string]any{"ok": true, "version": appVersion, "asset": ruOpenRayAssetName(), "arch": systemArchitecture("github-release"), "release": release}, err)
	case path == "/app/update" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.updateApp(strings.TrimSpace(fmt.Sprint(payload["version"])), boolPayload(payload, "backup", false)))
	case path == "/diagnostics" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.diagnostics())
	case path == "/diagnostics/http-probe" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, routerHTTPProbe(payload))
	case path == "/diagnostics/domain-probe" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.domainProxyProbe(payload))
	case path == "/diagnostics/dpi-probe" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.dpiProbe(payload))
	case path == "/geo/status" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.geoStatus())
	case path == "/geo/catalog" && r.Method == http.MethodGet:
		full := r.URL.Query().Get("full") == "1" || r.URL.Query().Get("full") == "true" || r.URL.Query().Get("full") == "all"
		writeJSON(w, 200, s.geoCatalog(r.URL.Query().Get("kind"), r.URL.Query().Get("code"), full, r.URL.Query().Get("file")))
	case path == "/geo/catalog" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.saveGeoCatalogCategory(payload))
	case path == "/geo/audit" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.checkGeoAudit(payload))
	case path == "/geo/sources" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.saveGeoCustomSources(payload))
	case path == "/geo/preset-overrides" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.saveGeoPresetOverrides(payload))
	case path == "/geo/lists" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.saveGeoUserLists(payload))
	case path == "/geo/update" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.updateGeo(payload))
	case path == "/geo/upload" && r.Method == http.MethodPost:
		writeJSON(w, 200, s.uploadGeoFile(r))
	case path == "/geo/download" && r.Method == http.MethodGet:
		s.downloadGeoDat(w, r)
	case path == "/geo/delete" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.deleteGeoFiles(payload))
	case path == "/geo/schedule" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.saveGeoSchedule(payload))
	case path == "/geo/cleanup" && r.Method == http.MethodPost:
		writeJSON(w, 200, s.cleanupGeoBackups())
	case path == "/profiles" && r.Method == http.MethodGet:
		profiles, err := s.listProfiles()
		respond(w, profiles, err)
	case path == "/profiles" && r.Method == http.MethodPost:
		s.saveProfile(w, r)
	case path == "/profiles/get" && r.Method == http.MethodGet:
		s.getProfile(w, r)
	case path == "/profiles/delete" && r.Method == http.MethodPost:
		s.deleteProfile(w, r)
	case path == "/profiles/activate" && r.Method == http.MethodPost:
		s.activateProfile(w, r)
	case path == "/import" && r.Method == http.MethodPost:
		s.importLink(w, r)
	case path == "/import/preview" && r.Method == http.MethodPost:
		s.importPreview(w, r)
	case path == "/import/subscription" && r.Method == http.MethodPost:
		s.importSubscription(w, r)
	case path == "/subscriptions" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.subscriptionReport())
	case path == "/subscriptions/pool" && r.Method == http.MethodPost:
		s.saveSubscriptionPool(w, r)
	case path == "/subscriptions/delete" && r.Method == http.MethodPost:
		s.deleteSubscriptionPool(w, r)
	case path == "/subscriptions/select" && r.Method == http.MethodPost:
		s.selectSubscriptionCandidate(w, r)
	case path == "/subscriptions/check-candidate" && r.Method == http.MethodPost:
		s.checkSubscriptionCandidate(w, r)
	case path == "/subscriptions/export" && r.Method == http.MethodPost:
		s.exportSubscriptionCandidates(w, r)
	case path == "/subscriptions/refresh" && r.Method == http.MethodPost:
		s.refreshSubscriptionPool(w, r)
	case path == "/subscriptions/fallback" && r.Method == http.MethodPost:
		s.fallbackSubscription(w, r)
	case path == "/subscriptions/fallback-progress" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.subscriptionFallbackProgress(r.URL.Query().Get("tag")))
	case path == "/dhcp/leases" && r.Method == http.MethodGet:
		writeJSON(w, 200, dhcpLeaseReport(s.cfg.DataDir))
	case path == "/dns/check" && r.Method == http.MethodPost:
		s.checkDNS(w, r)
	case path == "/dns/diagnostics" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.dnsDiagnostics())
	case path == "/dns/lan-upstream" && r.Method == http.MethodGet:
		writeJSON(w, 200, s.lanDNSUpstreamStatus(nil))
	case path == "/dns/lan-upstream" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.applyLANDNSUpstream(payload))
	case path == "/outbounds/check" && r.Method == http.MethodPost:
		s.checkOutbounds(w, r)
	case path == "/outbounds/check-history/settings" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.saveOutboundCheckHistorySettings(payload))
	case path == "/sni/scan" && r.Method == http.MethodPost:
		s.scanSNI(w, r)
	case path == "/domain-monitor" && r.Method == http.MethodGet:
		s.domainMonitor(w, r)
	case path == "/domain-monitor" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.controlDomainMonitor(payload))
	case path == "/logs" && r.Method == http.MethodGet:
		w.Header().Set("content-type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte(s.readLogs(r.URL.Query())))
	case path == "/backup" && r.Method == http.MethodPost:
		backup, err := s.backupActive()
		respond(w, map[string]any{"ok": true, "path": backup}, err)
	case path == "/backup/full" && r.Method == http.MethodPost:
		backup, err := s.backupBundle()
		respond(w, map[string]any{"ok": true, "path": backup}, err)
	case path == "/backup/latest" && r.Method == http.MethodGet:
		backup, err := s.latestBackup()
		respond(w, map[string]any{"ok": true, "backup": backup}, err)
	case path == "/backup/restore" && r.Method == http.MethodPost:
		payload, _ := readJSON(w, r)
		writeJSON(w, 200, s.restoreBackup(strings.TrimSpace(fmt.Sprint(payload["path"]))))
	default:
		writeJSON(w, 404, map[string]any{"ok": false, "error": "Неизвестный API-маршрут"})
	}
}

func respond(w http.ResponseWriter, payload any, err error) {
	if err != nil {
		writeJSON(w, 500, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, payload)
}

func (s *serverState) authed(r *http.Request) bool {
	if header := r.Header.Get("Authorization"); strings.HasPrefix(strings.ToLower(header), "bearer ") {
		token := strings.TrimSpace(header[7:])
		return s.hasSession(token) || validRememberToken(s.cfg.Password, token, time.Now())
	}
	cookie, err := r.Cookie("openray_session")
	return err == nil && (s.hasSession(cookie.Value) || validRememberToken(s.cfg.Password, cookie.Value, time.Now()))
}

func randomToken() string {
	buf := make([]byte, 24)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

func signedRememberToken(password string, expiresAt time.Time) string {
	payload := fmt.Sprintf("%d.%s", expiresAt.Unix(), randomToken())
	encodedPayload := base64.RawURLEncoding.EncodeToString([]byte(payload))
	mac := hmac.New(sha256.New, []byte(password))
	mac.Write([]byte(encodedPayload))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return "remember.v1." + encodedPayload + "." + signature
}

func validRememberToken(password string, token string, now time.Time) bool {
	parts := strings.Split(token, ".")
	if len(parts) != 4 || parts[0] != "remember" || parts[1] != "v1" || parts[2] == "" || parts[3] == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(password))
	mac.Write([]byte(parts[2]))
	expected := mac.Sum(nil)
	got, err := base64.RawURLEncoding.DecodeString(parts[3])
	if err != nil || !hmac.Equal(got, expected) {
		return false
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	payloadParts := strings.SplitN(string(payloadBytes), ".", 2)
	if len(payloadParts) != 2 {
		return false
	}
	expiresUnix, err := strconv.ParseInt(payloadParts[0], 10, 64)
	if err != nil {
		return false
	}
	return now.Unix() <= expiresUnix
}
