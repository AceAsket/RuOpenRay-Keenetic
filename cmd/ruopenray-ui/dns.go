package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/AceAsket/RuOpenRay-Keenetic/internal/dnsconfig"
)

func (s *serverState) lanDNSUpstreamStatus(plan map[string]any) map[string]any {
	if s.cfg.isKeenetic() {
		return s.keeneticLANDNSUpstreamStatus(plan)
	}
	available := runtime.GOOS != "windows" && commandExists("uci")
	xrayTarget := s.xrayDNSUpstreamTarget()
	targetOwner := ""
	targetConflict := false
	targetFound := false
	if cfg, err := s.readActiveConfig(); err == nil {
		host, port, found := xrayDNSInboundEndpoint(cfg)
		if found {
			targetFound = true
			xrayTarget = fmt.Sprintf("%s#%d", host, port)
			targetOwner = udpPortOwner(host, port)
			targetConflict = targetOwner != "" && !strings.Contains(targetOwner, "/xray")
		}
	}
	suggestedPort, conflictOwner := suggestedXrayDNSPort()
	if targetConflict {
		conflictOwner = targetOwner
	}
	dnsPortConflict := targetConflict || (!targetFound && conflictOwner != "")
	result := map[string]any{
		"ok":                   true,
		"available":            available,
		"mode":                 "unknown",
		"noresolv":             false,
		"servers":              []string{},
		"routerLan":            "192.168.1.1",
		"xrayTarget":           xrayTarget,
		"suggestedXrayPort":    suggestedPort,
		"suggestedXrayTarget":  fmt.Sprintf("127.0.0.1#%d", suggestedPort),
		"dnsPortConflict":      dnsPortConflict,
		"dnsPortConflictOwner": conflictOwner,
		"xrayPortConflict":     targetConflict,
		"xrayPortOwner":        targetOwner,
	}
	if !available {
		result["mode"] = "manual"
		result["hint"] = "UCI недоступен, настройте dnsmasq вручную."
		if plan != nil {
			result["plan"] = plan
		}
		return result
	}
	noresolv := strings.TrimSpace(fmt.Sprint(run("uci", "-q", "get", "dhcp.@dnsmasq[0].noresolv")["stdout"])) == "1"
	servers := dnsmasqServerList()
	lanIP := firstLine(fmt.Sprint(run("uci", "-q", "get", "network.lan.ipaddr")["stdout"]), "")
	if lanIP == "" || lanIP == "<nil>" {
		lanIP = "192.168.1.1"
	}
	if strings.Contains(lanIP, "/") {
		lanIP = strings.SplitN(lanIP, "/", 2)[0]
	}
	mode := "system"
	if noresolv && len(servers) == 1 && servers[0] == xrayTarget {
		mode = "xray"
	} else if noresolv && len(servers) > 0 {
		mode = "upstream"
	}
	result["mode"] = mode
	result["noresolv"] = noresolv
	result["servers"] = servers
	result["routerLan"] = lanIP
	result["readiness"] = s.lanDNSReadiness()
	if plan != nil {
		result["plan"] = plan
	}
	return result
}

func (s *serverState) keeneticLANDNSUpstreamStatus(plan map[string]any) map[string]any {
	xrayTarget := s.xrayDNSUpstreamTarget()
	targetOwner := ""
	targetConflict := false
	targetFound := false
	if cfg, err := s.readActiveConfig(); err == nil {
		host, port, found := xrayDNSInboundEndpoint(cfg)
		if found {
			targetFound = true
			xrayTarget = fmt.Sprintf("%s#%d", host, port)
			targetOwner = udpPortOwner(host, port)
			targetConflict = targetOwner != "" && !strings.Contains(targetOwner, "/xray")
		}
	}
	suggestedPort, conflictOwner := suggestedXrayDNSPort()
	if targetConflict {
		conflictOwner = targetOwner
	}
	dnsPortConflict := targetConflict || (!targetFound && conflictOwner != "")
	servers := keeneticNameServers()
	mode := "system"
	if len(servers) == 0 {
		mode = "unknown"
	}
	result := map[string]any{
		"ok":                   true,
		"available":            true,
		"configurable":         false,
		"platform":             "keenetic",
		"adapter":              "keenetic-dns-proxy",
		"mode":                 mode,
		"noresolv":             false,
		"servers":              servers,
		"routerLan":            keeneticRouterLANAddress(),
		"xrayTarget":           xrayTarget,
		"suggestedXrayPort":    suggestedPort,
		"suggestedXrayTarget":  fmt.Sprintf("127.0.0.1#%d", suggestedPort),
		"dnsPortConflict":      dnsPortConflict,
		"dnsPortConflictOwner": conflictOwner,
		"xrayPortConflict":     targetConflict,
		"xrayPortOwner":        targetOwner,
		"readiness":            s.lanDNSReadiness(),
		"hint":                 "KeeneticOS DNS proxy обнаружен. Автоматическое изменение DNS в KeeneticOS пока выключено; используйте перехват DNS в firewall или настройте DNS в родной панели Keenetic.",
	}
	if plan != nil {
		result["plan"] = plan
	}
	return result
}

func keeneticRouterLANAddress() string {
	for _, command := range [][]string{
		{"/bin/ndmc", "-c", "show interface Home"},
		{"/bin/ndmc", "-c", "show interface Bridge0"},
		{"ndmc", "-c", "show interface Home"},
	} {
		if strings.Contains(command[0], "/") {
			if _, err := os.Stat(command[0]); err != nil {
				continue
			}
		} else if !commandExists(command[0]) {
			continue
		}
		out := runTimeout(3*time.Second, command[0], command[1:]...)
		if address := parseKeeneticInterfaceAddress(fmt.Sprint(out["stdout"])); address != "" {
			return address
		}
	}
	return "192.168.1.1"
}

func parseKeeneticInterfaceAddress(text string) string {
	for _, line := range strings.Split(text, "\n") {
		key, value, ok := strings.Cut(strings.TrimSpace(strings.TrimPrefix(line, "\x1b[K")), ":")
		if ok && strings.TrimSpace(strings.ToLower(key)) == "address" {
			address := strings.TrimSpace(value)
			if net.ParseIP(address) != nil {
				return address
			}
		}
	}
	return ""
}

func keeneticNameServers() []string {
	servers := []string{}
	seen := map[string]bool{}
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" || value == "<nil>" || seen[value] {
			return
		}
		seen[value] = true
		servers = append(servers, value)
	}
	for _, command := range [][]string{
		{"/bin/ndmc", "-c", "show ip name-server"},
		{"ndmc", "-c", "show ip name-server"},
	} {
		if strings.Contains(command[0], "/") {
			if _, err := os.Stat(command[0]); err != nil {
				continue
			}
		} else if !commandExists(command[0]) {
			continue
		}
		out := runTimeout(3*time.Second, command[0], command[1:]...)
		if out["ok"] != true {
			continue
		}
		for _, server := range parseKeeneticNameServers(fmt.Sprint(out["stdout"])) {
			add(server)
		}
		if len(servers) > 0 {
			return servers
		}
	}
	return servers
}

func parseKeeneticNameServers(text string) []string {
	servers := []string{}
	for _, line := range strings.Split(text, "\n") {
		key, value, ok := strings.Cut(strings.TrimSpace(strings.TrimPrefix(line, "\x1b[K")), ":")
		if ok && strings.TrimSpace(strings.ToLower(key)) == "address" {
			server := strings.TrimSpace(value)
			if server != "" {
				servers = append(servers, server)
			}
		}
	}
	return servers
}

func (s *serverState) dnsDiagnostics() map[string]any {
	host := "raw.githubusercontent.com"
	lan := s.lanDNSUpstreamStatus(nil)
	readiness, _ := lan["readiness"].(map[string]any)
	systemProbe := dnsProbe("system", host)
	autoServers := resolvNameservers("/tmp/resolv.conf.d/resolv.conf.auto")
	resolvServers := resolvNameservers("/etc/resolv.conf")
	autoProbes := make([]map[string]any, 0, len(autoServers))
	for _, server := range autoServers {
		autoProbes = append(autoProbes, dnsProbe(server, host))
	}
	xrayProbe := map[string]any{"ok": false, "server": "", "skipped": true}
	if fmt.Sprint(lan["mode"]) == "xray" {
		target := dnsTargetToServer(fmt.Sprint(lan["xrayTarget"]))
		if target != "" {
			xrayProbe = dnsProbe(target, "example.com")
			xrayProbe["skipped"] = false
		}
	}
	warnings := []string{}
	if lan["dnsPortConflict"] == true {
		owner := strings.TrimSpace(fmt.Sprint(lan["dnsPortConflictOwner"]))
		if owner == "" || owner == "<nil>" {
			owner = "другой процесс"
		}
		warnings = append(warnings, fmt.Sprintf("Порт DNS для Xray занят: %s. Подготовьте DNS-вход заново, чтобы RuOpenRay выбрал свободный порт.", owner))
	}
	if fmt.Sprint(lan["mode"]) == "xray" && readiness["ready"] != true {
		warnings = append(warnings, "dnsmasq направлен в Xray DNS, но Xray DNS еще не готов. LAN-клиенты могут остаться без DNS.")
	}
	if systemProbe["ok"] != true && anyDNSProbeOK(autoProbes) {
		warnings = append(warnings, "Системный DNS роутера не ответил, но WAN DNS из OpenWrt работает. Это обычно значит, что локальный DNS смотрит в неработающий 127.0.0.1/::1.")
	}
	if systemProbe["ok"] != true && !anyDNSProbeOK(autoProbes) {
		warnings = append(warnings, "Роутер сейчас не может резолвить домены системным DNS. Обновление geo и загрузки с GitHub могут не работать.")
	}
	summary := "DNS выглядит рабочим"
	if len(warnings) > 0 {
		summary = warnings[0]
	}
	return map[string]any{
		"ok":            len(warnings) == 0,
		"host":          host,
		"summary":       summary,
		"warnings":      warnings,
		"system":        systemProbe,
		"autoServers":   autoServers,
		"autoProbes":    autoProbes,
		"resolvServers": resolvServers,
		"lan":           lan,
		"xrayDns":       xrayProbe,
	}
}

func dnsProbe(server, host string) map[string]any {
	server = strings.TrimSpace(server)
	if server == "" {
		server = "system"
	}
	start := time.Now()
	a, aaaa, err := dnsconfig.ResolveViaServer(server, dnsconfig.CleanCheckHost(host))
	elapsed := time.Since(start).Milliseconds()
	addresses := append([]string{}, a...)
	addresses = append(addresses, aaaa...)
	result := map[string]any{
		"server":     server,
		"host":       host,
		"ok":         err == nil,
		"durationMs": elapsed,
		"a":          a,
		"aaaa":       aaaa,
		"addresses":  addresses,
	}
	if err != nil {
		result["error"] = err.Error()
	}
	return result
}

func anyDNSProbeOK(probes []map[string]any) bool {
	for _, probe := range probes {
		if probe["ok"] == true {
			return true
		}
	}
	return false
}

func resolvNameservers(path string) []string {
	body, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	seen := map[string]bool{}
	servers := []string{}
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 || fields[0] != "nameserver" {
			continue
		}
		server := strings.TrimSpace(fields[1])
		if server == "" || seen[server] {
			continue
		}
		seen[server] = true
		servers = append(servers, server)
	}
	return servers
}

func dnsTargetToServer(target string) string {
	target = strings.TrimSpace(target)
	if target == "" || target == "<nil>" {
		return ""
	}
	if strings.Contains(target, "#") {
		parts := strings.Split(target, "#")
		host := strings.Join(parts[:len(parts)-1], "#")
		port := parts[len(parts)-1]
		if host == "" || port == "" {
			return target
		}
		return net.JoinHostPort(strings.Trim(host, "[]"), port)
	}
	return target
}

func dnsmasqServerList() []string {
	out := fmt.Sprint(run("uci", "-q", "get", "dhcp.@dnsmasq[0].server")["stdout"])
	fields := strings.Fields(strings.TrimSpace(out))
	servers := []string{}
	for _, item := range fields {
		item = strings.Trim(item, "'\" \t\r\n")
		if item != "" && item != "<nil>" {
			servers = append(servers, item)
		}
	}
	return servers
}

func (s *serverState) applyLANDNSUpstream(payload map[string]any) map[string]any {
	if s.cfg.isKeenetic() {
		mode := strings.TrimSpace(fmt.Sprint(payload["mode"]))
		if mode == "" {
			mode = "xray"
		}
		upstream := fmt.Sprint(payload["upstream"])
		if mode == "xray" && strings.TrimSpace(upstream) == "" {
			upstream = s.xrayDNSUpstreamTarget()
		}
		plan := map[string]any{
			"mode":     mode,
			"upstream": upstream,
			"commands": []string{
				"# KeeneticOS DNS proxy is read-only in RuOpenRay for now.",
				"# Use Firewall -> DNS intercept, or configure DNS manually in Keenetic Web UI.",
			},
		}
		status := s.keeneticLANDNSUpstreamStatus(plan)
		if boolPayload(payload, "dryRun", false) {
			status["ok"] = true
			status["dryRun"] = true
			return status
		}
		status["ok"] = false
		status["error"] = "Автоматическое изменение DNS в KeeneticOS пока выключено. Используйте перехват DNS в firewall или настройте DNS вручную в панели Keenetic."
		return status
	}
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return map[string]any{"ok": false, "available": false, "error": "UCI недоступен на этой системе"}
	}
	mode := strings.TrimSpace(fmt.Sprint(payload["mode"]))
	if mode == "" {
		mode = "xray"
	}
	restart := true
	if value, ok := payload["restart"].(bool); ok {
		restart = value
	}
	dryRun := boolPayload(payload, "dryRun", false)
	upstream := fmt.Sprint(payload["upstream"])
	if mode == "xray" && strings.TrimSpace(upstream) == "" {
		upstream = s.xrayDNSUpstreamTarget()
	}
	plan, err := dnsconfig.LANCommandPlan(mode, upstream, restart)
	if err != nil {
		status := s.lanDNSUpstreamStatus(plan)
		status["ok"] = false
		status["error"] = err.Error()
		return status
	}
	if dryRun {
		status := s.lanDNSUpstreamStatus(plan)
		status["ok"] = true
		status["dryRun"] = true
		return status
	}
	readiness := s.lanDNSReadiness()
	if mode == "xray" && readiness["ready"] != true {
		status := s.lanDNSUpstreamStatus(plan)
		status["ok"] = false
		status["readiness"] = readiness
		status["error"] = "DNS-вход Xray еще не готов. Сначала примените конфигурацию Xray и убедитесь, что порт " + fmt.Sprint(readiness["targetTCP"]) + " слушает."
		return status
	}
	steps := []map[string]any{}
	for _, command := range dnsconfig.PlanCommands(plan) {
		if len(command) == 0 {
			continue
		}
		if command[0] == "/etc/init.d/dnsmasq" {
			steps = append(steps, runTimeout(15*time.Second, command[0], command[1:]...))
			continue
		}
		steps = append(steps, run(command[0], command[1:]...))
	}
	ok := true
	for _, step := range steps {
		if step["ok"] != true {
			ok = false
		}
	}
	status := s.lanDNSUpstreamStatus(plan)
	status["ok"] = ok
	status["steps"] = steps
	return status
}

func (s *serverState) lanDNSReadiness() map[string]any {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ready": false, "error": err.Error()}
	}
	targetHost, targetPort, inboundReady := xrayDNSInboundEndpoint(cfg)
	targetTCP := fmt.Sprintf("%s:%d", targetHost, targetPort)
	targetUDP := targetTCP
	outboundReady := false
	ruleReady := false
	for _, item := range anySlice(cfg["outbounds"]) {
		outbound, ok := item.(map[string]any)
		if ok && fmt.Sprint(outbound["tag"]) == "dns-out" && fmt.Sprint(outbound["protocol"]) == "dns" {
			outboundReady = true
		}
	}
	for _, item := range anySlice(getNested(cfg, "routing", "rules")) {
		rule, ok := item.(map[string]any)
		if !ok || fmt.Sprint(rule["outboundTag"]) != "dns-out" {
			continue
		}
		for _, tag := range stringSlice(rule["inboundTag"]) {
			if tag == "ruopenray_dns_in" {
				ruleReady = true
				break
			}
		}
	}
	portReady := tcpPortOpen(targetTCP, 700*time.Millisecond)
	udpOwner := udpPortOwner(targetHost, targetPort)
	return map[string]any{
		"ready":       inboundReady && outboundReady && ruleReady && portReady,
		"inbound":     inboundReady,
		"outbound":    outboundReady,
		"rule":        ruleReady,
		"port":        portReady,
		"target":      fmt.Sprintf("%s#%d", targetHost, targetPort),
		"targetTCP":   targetTCP,
		"targetUDP":   targetUDP,
		"udpOwner":    udpOwner,
		"udpConflict": udpOwner != "" && !strings.Contains(udpOwner, "/xray"),
	}
}

func (s *serverState) xrayDNSUpstreamTarget() string {
	cfg, err := s.readActiveConfig()
	if err != nil {
		return dnsconfig.DefaultXrayDnsmasqTarget
	}
	host, port, _ := xrayDNSInboundEndpoint(cfg)
	return fmt.Sprintf("%s#%d", host, port)
}

func xrayDNSInboundEndpoint(cfg map[string]any) (string, int, bool) {
	host := "127.0.0.1"
	port := defaultXrayDNSPort()
	for _, item := range anySlice(cfg["inbounds"]) {
		inbound, ok := item.(map[string]any)
		if !ok || fmt.Sprint(inbound["tag"]) != "ruopenray_dns_in" {
			continue
		}
		listen := strings.TrimSpace(fmt.Sprint(inbound["listen"]))
		switch listen {
		case "", "<nil>", "0.0.0.0", "::":
			host = "127.0.0.1"
		default:
			host = listen
		}
		if value := number(inbound["port"], 0); value > 0 && value < 65536 {
			port = value
		}
		return host, port, true
	}
	return host, port, false
}

func defaultXrayDNSPort() int {
	return dnsPortFromTarget(dnsconfig.DefaultXrayDnsmasqTarget, 10535)
}

func suggestedXrayDNSPort() (int, string) {
	candidates := []int{defaultXrayDNSPort(), 15353, 53530, 5353}
	seen := map[int]bool{}
	var conflictOwner string
	checked := []int{}
	for _, port := range candidates {
		if port <= 0 || port > 65535 || seen[port] {
			continue
		}
		seen[port] = true
		checked = append(checked, port)
		owner := udpPortOwner("127.0.0.1", port)
		if len(checked) == 1 && owner != "" && !strings.Contains(owner, "/xray") {
			conflictOwner = owner
		}
		if owner == "" || strings.Contains(owner, "/xray") {
			return port, conflictOwner
		}
	}
	return checked[len(checked)-1], conflictOwner
}

func setXrayDNSInboundPort(cfg map[string]any, port int) bool {
	if port <= 0 || port > 65535 {
		return false
	}
	for _, item := range anySlice(cfg["inbounds"]) {
		inbound, ok := item.(map[string]any)
		if ok && fmt.Sprint(inbound["tag"]) == "ruopenray_dns_in" {
			inbound["port"] = port
			return true
		}
	}
	return false
}

func (s *serverState) guardXrayDNSPortBeforeStart() map[string]any {
	if runtime.GOOS == "windows" || s.cfg.ServiceName != "xray" {
		return map[string]any{"ok": true, "skipped": true}
	}
	cfg, err := s.readActiveConfig()
	if err != nil {
		return map[string]any{"ok": true, "skipped": true, "message": err.Error()}
	}
	host, port, found := xrayDNSInboundEndpoint(cfg)
	if !found {
		return map[string]any{"ok": true, "skipped": true}
	}
	owner := udpPortOwner(host, port)
	if owner == "" || strings.Contains(owner, "/xray") {
		return map[string]any{"ok": true, "port": port, "owner": owner}
	}
	nextPort, _ := suggestedXrayDNSPort()
	if nextPort == port || nextPort <= 0 || nextPort > 65535 {
		message := fmt.Sprintf("DNS-вход Xray не сможет стартовать: UDP %s:%d занят процессом %s, свободный порт не найден.", host, port, owner)
		return map[string]any{"ok": false, "port": port, "owner": owner, "stderr": message, "message": message}
	}
	if !setXrayDNSInboundPort(cfg, nextPort) {
		message := "DNS-вход Xray найден, но RuOpenRay не смог изменить его порт."
		return map[string]any{"ok": false, "port": port, "owner": owner, "stderr": message, "message": message}
	}
	if err := s.writeActiveConfig(cfg); err != nil {
		message := "Не удалось сохранить новый порт DNS-входа Xray: " + err.Error()
		return map[string]any{"ok": false, "port": port, "owner": owner, "stderr": message, "message": message}
	}
	oldTarget := fmt.Sprintf("%s#%d", host, port)
	newTarget := fmt.Sprintf("%s#%d", host, nextPort)
	dnsmasq := s.repointDnsmasqTarget(oldTarget, newTarget)
	dnsmasqOK := dnsmasq["ok"] == true
	message := fmt.Sprintf("DNS-вход Xray перенесен с %s на %s: старый порт занят процессом %s.", oldTarget, newTarget, owner)
	if !dnsmasqOK {
		message += " dnsmasq не удалось перенастроить автоматически: " + fmt.Sprint(dnsmasq["stderr"])
	}
	return map[string]any{
		"ok":        true,
		"migrated":  true,
		"from":      oldTarget,
		"to":        newTarget,
		"port":      nextPort,
		"owner":     owner,
		"dnsmasqOk": dnsmasqOK,
		"dnsmasq":   dnsmasq,
		"stdout":    message,
		"message":   message,
	}
}

func (s *serverState) repointDnsmasqTarget(oldTarget, newTarget string) map[string]any {
	if runtime.GOOS == "windows" || !commandExists("uci") {
		return map[string]any{"ok": true, "skipped": true}
	}
	servers := dnsmasqServerList()
	usesOldTarget := false
	for _, server := range servers {
		if server == oldTarget {
			usesOldTarget = true
			break
		}
	}
	if !usesOldTarget {
		return map[string]any{"ok": true, "skipped": true, "message": "dnsmasq не был направлен на старый DNS-вход"}
	}
	steps := []map[string]any{
		run("uci", "-q", "del_list", "dhcp.@dnsmasq[0].server="+oldTarget),
		run("uci", "add_list", "dhcp.@dnsmasq[0].server="+newTarget),
		run("uci", "commit", "dhcp"),
	}
	if _, err := os.Stat("/etc/init.d/dnsmasq"); err == nil {
		steps = append(steps, runTimeout(15*time.Second, "/etc/init.d/dnsmasq", "restart"))
	}
	ok := true
	for _, step := range steps {
		if step["ok"] != true {
			ok = false
		}
	}
	return map[string]any{"ok": ok, "from": oldTarget, "to": newTarget, "steps": steps, "stdout": concatCommandOutput(steps...)}
}

func dnsPortFromTarget(target string, fallback int) int {
	target = strings.TrimSpace(target)
	if target == "" {
		return fallback
	}
	if strings.Contains(target, "#") {
		parts := strings.Split(target, "#")
		return number(parts[len(parts)-1], fallback)
	}
	if host, port, err := net.SplitHostPort(target); err == nil && host != "" && port != "" {
		return number(port, fallback)
	}
	if strings.Count(target, ":") == 1 {
		parts := strings.Split(target, ":")
		return number(parts[1], fallback)
	}
	return fallback
}

func tcpPortOpen(address string, timeout time.Duration) bool {
	conn, err := net.DialTimeout("tcp", address, timeout)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func udpPortOwner(_ string, port int) string {
	if runtime.GOOS == "windows" || port <= 0 || port > 65535 {
		return ""
	}
	needle := fmt.Sprintf(":%d", port)
	result := runTimeout(2*time.Second, "sh", "-c", fmt.Sprintf("(netstat -lnup 2>/dev/null || ss -lunp 2>/dev/null) | grep ':%d'", port))
	text := strings.TrimSpace(fmt.Sprint(result["stdout"]))
	if text == "" || !strings.Contains(text, needle) {
		return ""
	}
	lines := strings.Split(text, "\n")
	chosen := strings.TrimSpace(lines[0])
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && !strings.Contains(line, "/xray") {
			chosen = line
			break
		}
	}
	fields := strings.Fields(chosen)
	if len(fields) == 0 {
		return chosen
	}
	return fields[len(fields)-1]
}

func (s *serverState) checkDNS(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	server := strings.TrimSpace(fmt.Sprint(payload["server"]))
	host := dnsconfig.CleanCheckHost(firstNonEmpty(fmt.Sprint(payload["host"]), "example.com"))
	warnings := []string{}
	if !strings.HasPrefix(server, "https://") {
		warnings = append(warnings, "DNS не DoH: DNS-запросы могут быть видны провайдеру")
	}
	a, aaaa, err := dnsconfig.ResolveViaServer(server, host)
	if err != nil {
		writeJSON(w, 200, map[string]any{"ok": false, "server": server, "host": host, "addresses": []string{}, "a": []string{}, "aaaa": []string{}, "warnings": warnings, "error": err.Error()})
		return
	}
	addresses := append([]string{}, a...)
	addresses = append(addresses, aaaa...)
	writeJSON(w, 200, map[string]any{"ok": true, "server": server, "host": host, "addresses": addresses, "a": a, "aaaa": aaaa, "warnings": warnings})
}
