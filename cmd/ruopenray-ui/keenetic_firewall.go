package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	keeneticRedirectHookPath    = "/opt/etc/ndm/netfilter.d/90-ruopenray-redirect.sh"
	keeneticRedirectDisablePath = "/opt/etc/ruopenray-ui/disable-keenetic-redirect.sh"
)

const keeneticRedirectHookScript = `#!/bin/sh
# RuOpenRay Keenetic REDIRECT hook. Author: AceAsket.
IPT="/opt/sbin/iptables"
[ -x "$IPT" ] || IPT="/opt/bin/iptables"
[ -x "$IPT" ] || IPT="iptables"
LAN_IF="${RUOPENRAY_LAN_IF:-br0}"
PORT="${RUOPENRAY_TRANSPARENT_PORT:-52345}"
CHAIN="RUOPENRAY"
QUIC_CHAIN="RUOPENRAY_QUIC"
BLOCK_QUIC="${RUOPENRAY_BLOCK_QUIC:-1}"

cleanup() {
  while "$IPT" -t nat -D PREROUTING -i "$LAN_IF" -p tcp --dport 80 -j "$CHAIN" 2>/dev/null; do :; done
  while "$IPT" -t nat -D PREROUTING -i "$LAN_IF" -p tcp --dport 443 -j "$CHAIN" 2>/dev/null; do :; done
  while "$IPT" -t filter -D FORWARD -i "$LAN_IF" -p udp --dport 443 -j "$QUIC_CHAIN" 2>/dev/null; do :; done
  "$IPT" -t nat -F "$CHAIN" 2>/dev/null || true
  "$IPT" -t nat -X "$CHAIN" 2>/dev/null || true
  "$IPT" -t filter -F "$QUIC_CHAIN" 2>/dev/null || true
  "$IPT" -t filter -X "$QUIC_CHAIN" 2>/dev/null || true
}

add_private_returns() {
  table="$1"
  chain="$2"
  "$IPT" -t "$table" -A "$chain" -d 0.0.0.0/8 -j RETURN
  "$IPT" -t "$table" -A "$chain" -d 10.0.0.0/8 -j RETURN
  "$IPT" -t "$table" -A "$chain" -d 127.0.0.0/8 -j RETURN
  "$IPT" -t "$table" -A "$chain" -d 169.254.0.0/16 -j RETURN
  "$IPT" -t "$table" -A "$chain" -d 172.16.0.0/12 -j RETURN
  "$IPT" -t "$table" -A "$chain" -d 192.168.0.0/16 -j RETURN
  "$IPT" -t "$table" -A "$chain" -d 224.0.0.0/4 -j RETURN
}

cleanup
"$IPT" -t nat -N "$CHAIN"
add_private_returns nat "$CHAIN"
"$IPT" -t nat -A "$CHAIN" -p tcp -j REDIRECT --to-ports "$PORT"
"$IPT" -t nat -I PREROUTING 1 -i "$LAN_IF" -p tcp --dport 443 -j "$CHAIN"
"$IPT" -t nat -I PREROUTING 1 -i "$LAN_IF" -p tcp --dport 80 -j "$CHAIN"

if [ "$BLOCK_QUIC" = "1" ]; then
  "$IPT" -t filter -N "$QUIC_CHAIN"
  add_private_returns filter "$QUIC_CHAIN"
  "$IPT" -t filter -A "$QUIC_CHAIN" -p udp -j REJECT
  "$IPT" -t filter -I FORWARD 1 -i "$LAN_IF" -p udp --dport 443 -j "$QUIC_CHAIN"
fi
`

const keeneticRedirectDisableScript = `#!/bin/sh
# Disable RuOpenRay Keenetic REDIRECT rules. Author: AceAsket.
IPT="/opt/sbin/iptables"
[ -x "$IPT" ] || IPT="/opt/bin/iptables"
[ -x "$IPT" ] || IPT="iptables"
LAN_IF="${RUOPENRAY_LAN_IF:-br0}"
CHAIN="RUOPENRAY"
QUIC_CHAIN="RUOPENRAY_QUIC"

while "$IPT" -t nat -D PREROUTING -i "$LAN_IF" -p tcp --dport 80 -j "$CHAIN" 2>/dev/null; do :; done
while "$IPT" -t nat -D PREROUTING -i "$LAN_IF" -p tcp --dport 443 -j "$CHAIN" 2>/dev/null; do :; done
while "$IPT" -t filter -D FORWARD -i "$LAN_IF" -p udp --dport 443 -j "$QUIC_CHAIN" 2>/dev/null; do :; done
"$IPT" -t nat -F "$CHAIN" 2>/dev/null || true
"$IPT" -t nat -X "$CHAIN" 2>/dev/null || true
"$IPT" -t filter -F "$QUIC_CHAIN" 2>/dev/null || true
"$IPT" -t filter -X "$QUIC_CHAIN" 2>/dev/null || true
`

func keeneticExecutable(candidates ...string) string {
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if strings.Contains(candidate, "/") {
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() && info.Mode()&0o111 != 0 {
				return candidate
			}
			continue
		}
		if commandExists(candidate) {
			return candidate
		}
	}
	return ""
}

func keeneticIptablesPath() string {
	return keeneticExecutable("/opt/sbin/iptables", "/opt/bin/iptables", "iptables")
}

func keeneticTPROXYTargetStatus() map[string]any {
	required := []string{"TPROXY"}
	body, err := os.ReadFile("/proc/net/ip_tables_targets")
	if err != nil {
		return map[string]any{
			"ok":          false,
			"required":    required,
			"installed":   []string{},
			"missing":     required,
			"unsupported": true,
			"detail":      "TPROXY target is not available on this Keenetic kernel",
			"error":       err.Error(),
		}
	}
	available := false
	for _, line := range strings.Split(string(body), "\n") {
		if strings.TrimSpace(line) == "TPROXY" {
			available = true
			break
		}
	}
	if available {
		return map[string]any{
			"ok":        true,
			"required":  required,
			"installed": required,
			"missing":   []string{},
			"detail":    "TPROXY target is available",
		}
	}
	return map[string]any{
		"ok":          false,
		"required":    required,
		"installed":   []string{},
		"missing":     required,
		"unsupported": true,
		"detail":      "TPROXY target is unavailable on Keenetic; RuOpenRay uses TCP REDIRECT instead",
	}
}

func parseKeeneticRedirectPort(text string) int {
	for _, marker := range []string{"--to-ports ", "--to-port "} {
		index := strings.Index(text, marker)
		if index < 0 {
			continue
		}
		rest := text[index+len(marker):]
		end := 0
		for end < len(rest) && rest[end] >= '0' && rest[end] <= '9' {
			end++
		}
		if end > 0 {
			if port, err := strconv.Atoi(rest[:end]); err == nil && port > 0 && port < 65536 {
				return port
			}
		}
	}
	return 52345
}

func parseKeeneticRedirectPorts(prerouting string) []string {
	seen := map[string]bool{}
	ports := []string{}
	for _, line := range strings.Split(prerouting, "\n") {
		if !strings.Contains(line, "-j RUOPENRAY") || !strings.Contains(line, "--dport ") {
			continue
		}
		parts := strings.Fields(line)
		for index, part := range parts {
			if part == "--dport" && index+1 < len(parts) {
				port := strings.Trim(parts[index+1], " ")
				if port != "" && !seen[port] {
					seen[port] = true
					ports = append(ports, port)
				}
			}
		}
	}
	if len(ports) == 0 {
		return []string{"80", "443"}
	}
	return ports
}

func parseKeeneticLANInterface(prerouting string) string {
	for _, line := range strings.Split(prerouting, "\n") {
		if !strings.Contains(line, "-j RUOPENRAY") || !strings.Contains(line, " -i ") {
			continue
		}
		parts := strings.Fields(line)
		for index, part := range parts {
			if part == "-i" && index+1 < len(parts) {
				return strings.TrimSpace(parts[index+1])
			}
		}
	}
	return "br0"
}

func keeneticScriptEnv(lanInterface string, transparentPort int, blockQuic bool) string {
	block := "0"
	if blockQuic {
		block = "1"
	}
	return "RUOPENRAY_LAN_IF=" + singleQuote(lanInterface) +
		" RUOPENRAY_TRANSPARENT_PORT=" + singleQuote(strconv.Itoa(transparentPort)) +
		" RUOPENRAY_BLOCK_QUIC=" + singleQuote(block)
}

func writeExecutableFile(path string, body string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(body), 0o755)
}

func (s *serverState) keeneticFirewallStatus() map[string]any {
	iptables := keeneticIptablesPath()
	available := runtime.GOOS != "windows" && iptables != ""
	natChain := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	natPrerouting := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	filterChain := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	filterForward := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	if available {
		natChain = runTimeout(5*time.Second, iptables, "-t", "nat", "-S", "RUOPENRAY")
		natPrerouting = runTimeout(5*time.Second, iptables, "-t", "nat", "-S", "PREROUTING")
		filterChain = runTimeout(5*time.Second, iptables, "-t", "filter", "-S", "RUOPENRAY_QUIC")
		filterForward = runTimeout(5*time.Second, iptables, "-t", "filter", "-S", "FORWARD")
	}
	natChainText := fmt.Sprint(natChain["stdout"])
	natPreroutingText := fmt.Sprint(natPrerouting["stdout"])
	filterChainText := fmt.Sprint(filterChain["stdout"])
	filterForwardText := fmt.Sprint(filterForward["stdout"])
	active := natChain["ok"] == true &&
		strings.Contains(natChainText, "REDIRECT") &&
		strings.Contains(natPreroutingText, "--dport 80") &&
		strings.Contains(natPreroutingText, "--dport 443") &&
		strings.Contains(natPreroutingText, "-j RUOPENRAY")
	blockQuic := filterChain["ok"] == true &&
		strings.Contains(filterChainText, "REJECT") &&
		strings.Contains(filterForwardText, "-j RUOPENRAY_QUIC")
	persistent := false
	if _, err := os.Stat(keeneticRedirectHookPath); err == nil {
		persistent = true
	}
	disableScript := false
	if _, err := os.Stat(keeneticRedirectDisablePath); err == nil {
		disableScript = true
	}
	lanInterface := parseKeeneticLANInterface(natPreroutingText)
	transparentPort := parseKeeneticRedirectPort(natChainText)
	ports := parseKeeneticRedirectPorts(natPreroutingText)
	status := map[string]any{
		"ok":              true,
		"available":       available,
		"platform":        s.cfg.Platform,
		"routerMode":      "redirect",
		"bypassMode":      "off",
		"deviceMode":      "all",
		"portMode":        "custom",
		"ports":           ports,
		"transparentPort": transparentPort,
		"lanInterface":    lanInterface,
		"dnsIntercept":    false,
		"blockQuic":       blockQuic,
		"persistent":      persistent,
		"active":          active,
		"hotplug":         persistent,
		"hookPath":        keeneticRedirectHookPath,
		"disablePath":     keeneticRedirectDisablePath,
		"disableScript":   disableScript,
		"iptablesPath":    iptables,
		"iptables": map[string]any{
			"natChain":      natChain,
			"natPrerouting": natPrerouting,
			"filterChain":   filterChain,
			"filterForward": filterForward,
		},
		"tproxyModules":       keeneticTPROXYTargetStatus(),
		"killSwitchNftset":    map[string]any{"available": false, "active": false, "count": 0, "domains": []string{}},
		"killSwitchDNSBlock":  map[string]any{"available": false, "active": false, "count": 0, "domains": []string{}},
		"directNftset":        map[string]any{"available": false, "active": false, "count": 0, "domains": []string{}},
		"proxyNftset":         map[string]any{"available": false, "active": false, "count": 0, "domains": []string{}},
		"needsPolicyFix":      false,
		"supportedTransports": []string{"tcp"},
	}
	if !available {
		status["message"] = "iptables is unavailable in Entware; install it with: opkg install iptables"
	}
	return status
}

func (s *serverState) previewKeeneticFirewall(payload map[string]any) map[string]any {
	transparentPort := int(numberAny(payload["transparentPort"]))
	if transparentPort <= 0 || transparentPort > 65535 {
		transparentPort = 52345
	}
	lanInterface := strings.TrimSpace(fmt.Sprint(payload["lanInterface"]))
	if lanInterface == "" || lanInterface == "<nil>" {
		lanInterface = "br0"
	}
	blockQuic := boolPayload(payload, "blockQuic", true)
	env := keeneticScriptEnv(lanInterface, transparentPort, blockQuic)
	preview := strings.Join([]string{
		"opkg install iptables",
		"mkdir -p /opt/etc/ndm/netfilter.d /opt/etc/ruopenray-ui",
		"install -m 0755 keenetic-redirect.sh " + keeneticRedirectHookPath,
		"install -m 0755 keenetic-disable-redirect.sh " + keeneticRedirectDisablePath,
		env + " " + keeneticRedirectHookPath,
	}, "\n")
	return map[string]any{
		"ok": true,
		"meta": map[string]any{
			"routerMode":      "redirect",
			"bypassMode":      "off",
			"deviceMode":      "all",
			"portMode":        "custom",
			"ports":           []string{"80", "443"},
			"transparentPort": transparentPort,
			"lanInterface":    lanInterface,
			"blockQuic":       blockQuic,
			"dnsIntercept":    false,
		},
		"nft":     preview,
		"preview": preview,
		"status":  s.firewallStatus(),
	}
}

func (s *serverState) applyKeeneticFirewall(payload map[string]any) map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": false, "available": false, "error": "Keenetic firewall can only be applied on the router"}
	}
	if keeneticIptablesPath() == "" {
		return map[string]any{"ok": false, "available": false, "error": "iptables not found; install Entware package: opkg install iptables", "status": s.firewallStatus()}
	}
	transparentPort := int(numberAny(payload["transparentPort"]))
	if transparentPort <= 0 || transparentPort > 65535 {
		transparentPort = 52345
	}
	lanInterface := strings.TrimSpace(fmt.Sprint(payload["lanInterface"]))
	if lanInterface == "" || lanInterface == "<nil>" {
		lanInterface = "br0"
	}
	blockQuic := boolPayload(payload, "blockQuic", true)
	if err := writeExecutableFile(keeneticRedirectHookPath, keeneticRedirectHookScript); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "status": s.firewallStatus()}
	}
	if err := writeExecutableFile(keeneticRedirectDisablePath, keeneticRedirectDisableScript); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "status": s.firewallStatus()}
	}
	step := runTimeout(15*time.Second, "sh", "-c", keeneticScriptEnv(lanInterface, transparentPort, blockQuic)+" "+singleQuote(keeneticRedirectHookPath))
	status := s.firewallStatus()
	ok := step["ok"] == true && status["active"] == true && status["persistent"] == true
	if blockQuic {
		ok = ok && status["blockQuic"] == true
	}
	return map[string]any{
		"ok":     ok,
		"steps":  []map[string]any{step},
		"status": status,
		"meta": map[string]any{
			"routerMode":      "redirect",
			"bypassMode":      "off",
			"deviceMode":      "all",
			"portMode":        "custom",
			"ports":           []string{"80", "443"},
			"transparentPort": transparentPort,
			"lanInterface":    lanInterface,
			"blockQuic":       blockQuic,
			"dnsIntercept":    false,
		},
	}
}

func (s *serverState) disableKeeneticFirewall() map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": false, "available": false, "error": "Keenetic firewall can only be disabled on the router"}
	}
	_ = writeExecutableFile(keeneticRedirectDisablePath, keeneticRedirectDisableScript)
	step := runTimeout(15*time.Second, "sh", "-c", "RUOPENRAY_LAN_IF='br0' "+singleQuote(keeneticRedirectDisablePath))
	_ = os.Remove(keeneticRedirectHookPath)
	status := s.firewallStatus()
	return map[string]any{"ok": step["ok"] == true && status["active"] != true && status["persistent"] != true, "steps": []map[string]any{step}, "status": status}
}
