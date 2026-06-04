package main

import (
	"encoding/json"
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
	keeneticFirewallMetaPath    = "/opt/etc/ruopenray-ui/keenetic-firewall.json"
)

const keeneticRedirectHookScript = `#!/bin/sh
# RuOpenRay Keenetic proxy hook. Author: AceAsket.
IPT="/opt/sbin/iptables"
[ -x "$IPT" ] || IPT="/opt/bin/iptables"
[ -x "$IPT" ] || IPT="iptables"
IP6T="/opt/sbin/ip6tables"
[ -x "$IP6T" ] || IP6T="/opt/bin/ip6tables"
[ -x "$IP6T" ] || IP6T="ip6tables"
LAN_IF="${RUOPENRAY_LAN_IF:-br0}"
MODE="${RUOPENRAY_ROUTER_MODE:-redirect}"
PORT="${RUOPENRAY_TRANSPARENT_PORT:-52345}"
CHAIN="RUOPENRAY"
TPROXY_CHAIN="RUOPENRAY_TPROXY"
QUIC_CHAIN="RUOPENRAY_QUIC"
DNS_CHAIN="RUOPENRAY_DNS_GUARD"
IPV6_CHAIN="RUOPENRAY_IPV6"
BLOCK_QUIC="${RUOPENRAY_BLOCK_QUIC:-1}"
DNS_INTERCEPT="${RUOPENRAY_DNS_INTERCEPT:-0}"
IPV6_MODE="${RUOPENRAY_IPV6_MODE:-observe}"
TPROXY_MARK="${RUOPENRAY_TPROXY_MARK:-0x111}"
TPROXY_TABLE="${RUOPENRAY_TPROXY_TABLE:-111}"
PORTS="${RUOPENRAY_PORTS:-80 443}"
PORT_EXCLUDE="${RUOPENRAY_PORT_EXCLUDE:-}"
IP_EXCLUDE="${RUOPENRAY_IP_EXCLUDE:-}"
DSCP_PROXY="${RUOPENRAY_DSCP_PROXY:-}"
DEVICE_MODE="${RUOPENRAY_DEVICE_MODE:-all}"
DEVICES="${RUOPENRAY_DEVICES:-}"

load_tproxy_modules() {
  KVER="$(uname -r)"
  insmod "/lib/modules/$KVER/xt_socket.ko" 2>/dev/null || true
  insmod "/lib/modules/$KVER/xt_TPROXY.ko" 2>/dev/null || true
}

remove_jump_rules() {
  table="$1"
  chain="$2"
  target="$3"
  "$IPT" -t "$table" -S "$chain" 2>/dev/null | while IFS= read -r line; do
    case "$line" in
      *" -j $target"*)
        rule="${line#-A $chain }"
        "$IPT" -t "$table" -D "$chain" $rule 2>/dev/null || true
      ;;
    esac
  done
}

remove_ip6_jump_rules() {
  "$IP6T" -t filter -S FORWARD 2>/dev/null | while IFS= read -r line; do
    case "$line" in
      *" -j $IPV6_CHAIN"*)
        rule="${line#-A FORWARD }"
        "$IP6T" -t filter -D FORWARD $rule 2>/dev/null || true
      ;;
    esac
  done
}

cleanup() {
  remove_jump_rules nat PREROUTING "$CHAIN"
  remove_jump_rules mangle PREROUTING "$TPROXY_CHAIN"
  remove_jump_rules filter FORWARD "$QUIC_CHAIN"
  remove_jump_rules filter FORWARD "$DNS_CHAIN"
  remove_ip6_jump_rules
  while "$IPT" -t nat -D PREROUTING -i "$LAN_IF" -p tcp --dport 80 -j "$CHAIN" 2>/dev/null; do :; done
  while "$IPT" -t nat -D PREROUTING -i "$LAN_IF" -p tcp --dport 443 -j "$CHAIN" 2>/dev/null; do :; done
  while "$IPT" -t nat -D PREROUTING -i "$LAN_IF" -p tcp -j "$CHAIN" 2>/dev/null; do :; done
  while "$IPT" -t mangle -D PREROUTING -i "$LAN_IF" -p tcp -j "$TPROXY_CHAIN" 2>/dev/null; do :; done
  while "$IPT" -t mangle -D PREROUTING -i "$LAN_IF" -p udp -j "$TPROXY_CHAIN" 2>/dev/null; do :; done
  for item in $PORTS; do
    while "$IPT" -t nat -D PREROUTING -i "$LAN_IF" -p tcp --dport "$item" -j "$CHAIN" 2>/dev/null; do :; done
    while "$IPT" -t mangle -D PREROUTING -i "$LAN_IF" -p tcp --dport "$item" -j "$TPROXY_CHAIN" 2>/dev/null; do :; done
    while "$IPT" -t mangle -D PREROUTING -i "$LAN_IF" -p udp --dport "$item" -j "$TPROXY_CHAIN" 2>/dev/null; do :; done
  done
  while "$IPT" -t filter -D FORWARD -i "$LAN_IF" -p udp --dport 443 -j "$QUIC_CHAIN" 2>/dev/null; do :; done
  while "$IPT" -t filter -D FORWARD -i "$LAN_IF" -p udp --dport 53 -j "$DNS_CHAIN" 2>/dev/null; do :; done
  "$IPT" -t nat -F "$CHAIN" 2>/dev/null || true
  "$IPT" -t nat -X "$CHAIN" 2>/dev/null || true
  "$IPT" -t mangle -F "$TPROXY_CHAIN" 2>/dev/null || true
  "$IPT" -t mangle -X "$TPROXY_CHAIN" 2>/dev/null || true
  "$IPT" -t filter -F "$QUIC_CHAIN" 2>/dev/null || true
  "$IPT" -t filter -X "$QUIC_CHAIN" 2>/dev/null || true
  "$IPT" -t filter -F "$DNS_CHAIN" 2>/dev/null || true
  "$IPT" -t filter -X "$DNS_CHAIN" 2>/dev/null || true
  "$IP6T" -t filter -F "$IPV6_CHAIN" 2>/dev/null || true
  "$IP6T" -t filter -X "$IPV6_CHAIN" 2>/dev/null || true
  ip rule del fwmark "$TPROXY_MARK" lookup "$TPROXY_TABLE" 2>/dev/null || true
  ip route flush table "$TPROXY_TABLE" 2>/dev/null || true
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

add_external_ip_returns() {
  table="$1"
  chain="$2"
  for target in $IP_EXCLUDE; do
    [ -n "$target" ] || continue
    "$IPT" -t "$table" -A "$chain" -d "$target" -j RETURN
  done
}

add_port_exclude_returns() {
  table="$1"
  chain="$2"
  for item in $PORT_EXCLUDE; do
    [ -n "$item" ] || continue
    "$IPT" -t "$table" -A "$chain" -p tcp --dport "$item" -j RETURN
    "$IPT" -t "$table" -A "$chain" -p udp --dport "$item" -j RETURN 2>/dev/null || true
  done
}

add_device_returns() {
  table="$1"
  chain="$2"
  [ "$DEVICE_MODE" = "exclude" ] || return 0
  for source in $DEVICES; do
    [ -n "$source" ] || continue
    "$IPT" -t "$table" -A "$chain" -s "$source" -j RETURN
  done
}

add_prerouting_jump() {
  table="$1"
  proto="$2"
  dport="$3"
  target="$4"
  if [ "$DEVICE_MODE" = "selected" ]; then
    for source in $DEVICES; do
      [ -n "$source" ] || continue
      if [ -n "$dport" ]; then
        "$IPT" -t "$table" -I PREROUTING 1 -i "$LAN_IF" -s "$source" -p "$proto" --dport "$dport" -j "$target"
      else
        "$IPT" -t "$table" -I PREROUTING 1 -i "$LAN_IF" -s "$source" -p "$proto" -j "$target"
      fi
    done
    return 0
  fi
  if [ -n "$dport" ]; then
    "$IPT" -t "$table" -I PREROUTING 1 -i "$LAN_IF" -p "$proto" --dport "$dport" -j "$target"
  else
    "$IPT" -t "$table" -I PREROUTING 1 -i "$LAN_IF" -p "$proto" -j "$target"
  fi
}

add_forward_quic_jump() {
  if [ "$DEVICE_MODE" = "selected" ]; then
    for source in $DEVICES; do
      [ -n "$source" ] || continue
      "$IPT" -t filter -I FORWARD 1 -i "$LAN_IF" -s "$source" -p udp --dport 443 -j "$QUIC_CHAIN"
    done
    return 0
  fi
  "$IPT" -t filter -I FORWARD 1 -i "$LAN_IF" -p udp --dport 443 -j "$QUIC_CHAIN"
}

add_forward_dns_guard_jump() {
  if [ "$DEVICE_MODE" = "selected" ]; then
    for source in $DEVICES; do
      [ -n "$source" ] || continue
      "$IPT" -t filter -I FORWARD 1 -i "$LAN_IF" -s "$source" -p udp --dport 53 -j "$DNS_CHAIN"
    done
    return 0
  fi
  "$IPT" -t filter -I FORWARD 1 -i "$LAN_IF" -p udp --dport 53 -j "$DNS_CHAIN"
}

add_forward_ipv6_jump() {
  command -v "$IP6T" >/dev/null 2>&1 || return 0
  "$IP6T" -t filter -I FORWARD 1 -i "$LAN_IF" -j "$IPV6_CHAIN" 2>/dev/null || true
}

port_list_covers_53() {
  [ "$PORTS" = "all" ] && return 0
  for item in $PORTS; do
    case "$item" in
      53) return 0 ;;
      *:*)
        start="${item%%:*}"
        end="${item#*:}"
        [ "$start" -le 53 ] 2>/dev/null && [ "$end" -ge 53 ] 2>/dev/null && return 0
      ;;
    esac
  done
  return 1
}

cleanup

if [ "$MODE" = "tproxy" ]; then
  load_tproxy_modules
  ip route add local 0.0.0.0/0 dev lo table "$TPROXY_TABLE" 2>/dev/null || true
  ip rule add fwmark "$TPROXY_MARK" lookup "$TPROXY_TABLE" 2>/dev/null || true
  "$IPT" -t mangle -N "$TPROXY_CHAIN"
  add_private_returns mangle "$TPROXY_CHAIN"
  add_external_ip_returns mangle "$TPROXY_CHAIN"
  add_port_exclude_returns mangle "$TPROXY_CHAIN"
  add_device_returns mangle "$TPROXY_CHAIN"
  "$IPT" -t mangle -A "$TPROXY_CHAIN" -p tcp -m socket --transparent -j MARK --set-mark "$TPROXY_MARK"
  "$IPT" -t mangle -A "$TPROXY_CHAIN" -p udp -m socket --transparent -j MARK --set-mark "$TPROXY_MARK"
  "$IPT" -t mangle -A "$TPROXY_CHAIN" -p tcp -m mark ! --mark 0 -j CONNMARK --save-mark
  "$IPT" -t mangle -A "$TPROXY_CHAIN" -p udp -m mark ! --mark 0 -j CONNMARK --save-mark
  if [ -n "$DSCP_PROXY" ]; then
    "$IPT" -t mangle -A "$TPROXY_CHAIN" -p tcp -j DSCP --set-dscp "$DSCP_PROXY" 2>/dev/null || true
    "$IPT" -t mangle -A "$TPROXY_CHAIN" -p udp -j DSCP --set-dscp "$DSCP_PROXY" 2>/dev/null || true
  fi
  "$IPT" -t mangle -A "$TPROXY_CHAIN" -p tcp -j TPROXY --on-ip 127.0.0.1 --on-port "$PORT" --tproxy-mark "$TPROXY_MARK"
  "$IPT" -t mangle -A "$TPROXY_CHAIN" -p udp -j TPROXY --on-ip 127.0.0.1 --on-port "$PORT" --tproxy-mark "$TPROXY_MARK"
  if [ "$PORTS" = "all" ]; then
    add_prerouting_jump mangle udp "" "$TPROXY_CHAIN"
    add_prerouting_jump mangle tcp "" "$TPROXY_CHAIN"
  else
    for item in $PORTS; do
      add_prerouting_jump mangle udp "$item" "$TPROXY_CHAIN"
      add_prerouting_jump mangle tcp "$item" "$TPROXY_CHAIN"
    done
    if [ "$DNS_INTERCEPT" = "1" ] && ! port_list_covers_53; then
      add_prerouting_jump mangle udp 53 "$TPROXY_CHAIN"
      add_prerouting_jump mangle tcp 53 "$TPROXY_CHAIN"
    fi
  fi
else
  "$IPT" -t nat -N "$CHAIN"
  add_private_returns nat "$CHAIN"
  add_external_ip_returns nat "$CHAIN"
  add_port_exclude_returns nat "$CHAIN"
  add_device_returns nat "$CHAIN"
  "$IPT" -t nat -A "$CHAIN" -p tcp -j REDIRECT --to-ports "$PORT"
  if [ "$PORTS" = "all" ]; then
    add_prerouting_jump nat tcp "" "$CHAIN"
  else
    for item in $PORTS; do
      add_prerouting_jump nat tcp "$item" "$CHAIN"
    done
    if [ "$DNS_INTERCEPT" = "1" ] && ! port_list_covers_53; then
      add_prerouting_jump nat tcp 53 "$CHAIN"
    fi
  fi
fi

if [ "$DNS_INTERCEPT" = "1" ] && [ "$MODE" != "tproxy" ]; then
  "$IPT" -t filter -N "$DNS_CHAIN"
  add_private_returns filter "$DNS_CHAIN"
  add_device_returns filter "$DNS_CHAIN"
  "$IPT" -t filter -A "$DNS_CHAIN" -p udp -j REJECT
  add_forward_dns_guard_jump
fi

if [ "$BLOCK_QUIC" = "1" ]; then
  "$IPT" -t filter -N "$QUIC_CHAIN"
  add_private_returns filter "$QUIC_CHAIN"
  add_device_returns filter "$QUIC_CHAIN"
  "$IPT" -t filter -A "$QUIC_CHAIN" -p udp -j REJECT
  add_forward_quic_jump
fi

if [ "$IPV6_MODE" = "disable" ]; then
  if command -v "$IP6T" >/dev/null 2>&1; then
    "$IP6T" -t filter -N "$IPV6_CHAIN" 2>/dev/null || true
    "$IP6T" -t filter -F "$IPV6_CHAIN" 2>/dev/null || true
    "$IP6T" -t filter -A "$IPV6_CHAIN" -j REJECT 2>/dev/null || true
    add_forward_ipv6_jump
  fi
fi
`

const keeneticRedirectDisableScript = `#!/bin/sh
# Disable RuOpenRay Keenetic proxy rules. Author: AceAsket.
IPT="/opt/sbin/iptables"
[ -x "$IPT" ] || IPT="/opt/bin/iptables"
[ -x "$IPT" ] || IPT="iptables"
IP6T="/opt/sbin/ip6tables"
[ -x "$IP6T" ] || IP6T="/opt/bin/ip6tables"
[ -x "$IP6T" ] || IP6T="ip6tables"
LAN_IF="${RUOPENRAY_LAN_IF:-br0}"
CHAIN="RUOPENRAY"
TPROXY_CHAIN="RUOPENRAY_TPROXY"
QUIC_CHAIN="RUOPENRAY_QUIC"
DNS_CHAIN="RUOPENRAY_DNS_GUARD"
IPV6_CHAIN="RUOPENRAY_IPV6"
TPROXY_MARK="${RUOPENRAY_TPROXY_MARK:-0x111}"
TPROXY_TABLE="${RUOPENRAY_TPROXY_TABLE:-111}"

remove_jump_rules() {
  table="$1"
  chain="$2"
  target="$3"
  "$IPT" -t "$table" -S "$chain" 2>/dev/null | while IFS= read -r line; do
    case "$line" in
      *" -j $target"*)
        rule="${line#-A $chain }"
        "$IPT" -t "$table" -D "$chain" $rule 2>/dev/null || true
      ;;
    esac
  done
}

remove_jump_rules nat PREROUTING "$CHAIN"
remove_jump_rules mangle PREROUTING "$TPROXY_CHAIN"
remove_jump_rules filter FORWARD "$QUIC_CHAIN"
remove_jump_rules filter FORWARD "$DNS_CHAIN"
"$IP6T" -t filter -S FORWARD 2>/dev/null | while IFS= read -r line; do
  case "$line" in
    *" -j $IPV6_CHAIN"*)
      rule="${line#-A FORWARD }"
      "$IP6T" -t filter -D FORWARD $rule 2>/dev/null || true
    ;;
  esac
done
while "$IPT" -t nat -D PREROUTING -i "$LAN_IF" -p tcp --dport 80 -j "$CHAIN" 2>/dev/null; do :; done
while "$IPT" -t nat -D PREROUTING -i "$LAN_IF" -p tcp --dport 443 -j "$CHAIN" 2>/dev/null; do :; done
while "$IPT" -t nat -D PREROUTING -i "$LAN_IF" -p tcp -j "$CHAIN" 2>/dev/null; do :; done
while "$IPT" -t mangle -D PREROUTING -i "$LAN_IF" -p tcp -j "$TPROXY_CHAIN" 2>/dev/null; do :; done
while "$IPT" -t mangle -D PREROUTING -i "$LAN_IF" -p udp -j "$TPROXY_CHAIN" 2>/dev/null; do :; done
while "$IPT" -t filter -D FORWARD -i "$LAN_IF" -p udp --dport 53 -j "$DNS_CHAIN" 2>/dev/null; do :; done
for item in 1 2 3 4 5 6 7 8 9 10; do
  while "$IPT" -t mangle -D PREROUTING -i "$LAN_IF" -p tcp -j "$TPROXY_CHAIN" 2>/dev/null; do :; done
  while "$IPT" -t mangle -D PREROUTING -i "$LAN_IF" -p udp -j "$TPROXY_CHAIN" 2>/dev/null; do :; done
done
while "$IPT" -t filter -D FORWARD -i "$LAN_IF" -p udp --dport 443 -j "$QUIC_CHAIN" 2>/dev/null; do :; done
"$IPT" -t nat -F "$CHAIN" 2>/dev/null || true
"$IPT" -t nat -X "$CHAIN" 2>/dev/null || true
"$IPT" -t mangle -F "$TPROXY_CHAIN" 2>/dev/null || true
"$IPT" -t mangle -X "$TPROXY_CHAIN" 2>/dev/null || true
"$IPT" -t filter -F "$QUIC_CHAIN" 2>/dev/null || true
"$IPT" -t filter -X "$QUIC_CHAIN" 2>/dev/null || true
"$IPT" -t filter -F "$DNS_CHAIN" 2>/dev/null || true
"$IPT" -t filter -X "$DNS_CHAIN" 2>/dev/null || true
"$IP6T" -t filter -F "$IPV6_CHAIN" 2>/dev/null || true
"$IP6T" -t filter -X "$IPV6_CHAIN" 2>/dev/null || true
ip rule del fwmark "$TPROXY_MARK" lookup "$TPROXY_TABLE" 2>/dev/null || true
ip route flush table "$TPROXY_TABLE" 2>/dev/null || true
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

func keeneticIP6TablesPath() string {
	return keeneticExecutable("/opt/sbin/ip6tables", "/opt/bin/ip6tables", "ip6tables")
}

func keeneticTPROXYTargetStatus() map[string]any {
	required := []string{"TPROXY"}
	modulePaths := keeneticTPROXYModulePaths()
	modulesPresent := len(modulePaths["missing"]) == 0
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
			"modules":     modulePaths,
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
			"modules":   modulePaths,
		}
	}
	return map[string]any{
		"ok":          false,
		"required":    required,
		"installed":   []string{},
		"missing":     required,
		"unsupported": !modulesPresent,
		"loadable":    modulesPresent,
		"detail":      "TPROXY target is not loaded; RuOpenRay can load xt_socket/xt_TPROXY on Keenetic if kernel modules are present",
		"modules":     modulePaths,
	}
}

func keeneticTPROXYModulesPresent() bool {
	return len(keeneticTPROXYModulePaths()["missing"]) == 0
}

func keeneticTPROXYModulePaths() map[string][]string {
	kernel := strings.TrimSpace(fmt.Sprint(runTimeout(3*time.Second, "uname", "-r")["stdout"]))
	if kernel == "" || kernel == "<nil>" {
		return map[string][]string{"present": []string{}, "missing": []string{"kernel"}}
	}
	present := []string{}
	missing := []string{}
	for _, path := range []string{
		"/lib/modules/" + kernel + "/xt_socket.ko",
		"/lib/modules/" + kernel + "/xt_TPROXY.ko",
	} {
		if _, err := os.Stat(path); err != nil {
			missing = append(missing, path)
		} else {
			present = append(present, path)
		}
	}
	return map[string][]string{"present": present, "missing": missing}
}

func (s *serverState) loadFirewallTPROXYModules() map[string]any {
	if !s.cfg.isKeenetic() {
		return map[string]any{"ok": false, "error": "TPROXY module loading is only available on Keenetic", "status": s.firewallStatus()}
	}
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": false, "error": "TPROXY modules can only be loaded on the router", "status": s.firewallStatus()}
	}
	before := keeneticTPROXYTargetStatus()
	paths := keeneticTPROXYModulePaths()
	steps := []map[string]any{}
	for _, path := range paths["present"] {
		steps = append(steps, runTimeout(5*time.Second, "insmod", path))
	}
	after := keeneticTPROXYTargetStatus()
	status := s.firewallStatus()
	return map[string]any{
		"ok":            after["ok"] == true,
		"before":        before,
		"tproxyModules": after,
		"steps":         steps,
		"status":        status,
	}
}

func parseKeeneticRedirectPort(text string) int {
	for _, marker := range []string{"--to-ports ", "--to-port ", "--on-port "} {
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

func parseKeeneticAllPorts(prerouting string) bool {
	for _, line := range strings.Split(prerouting, "\n") {
		if !strings.Contains(line, "-j RUOPENRAY") || strings.Contains(line, "--dport ") {
			continue
		}
		if strings.Contains(line, " -p tcp ") || strings.Contains(line, " -p udp ") {
			return true
		}
	}
	return false
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

func parseKeeneticSources(text string) []string {
	seen := map[string]bool{}
	sources := []string{}
	for _, line := range strings.Split(text, "\n") {
		if !strings.Contains(line, " -s ") {
			continue
		}
		parts := strings.Fields(line)
		for index, part := range parts {
			if part == "-s" && index+1 < len(parts) {
				source := strings.TrimSpace(parts[index+1])
				if source != "" && !seen[source] {
					seen[source] = true
					sources = append(sources, source)
				}
			}
		}
	}
	return sources
}

func parseKeeneticDeviceScope(prerouting string, chain string) (string, []string) {
	unique := func(items []string) []string {
		seen := map[string]bool{}
		out := []string{}
		for _, item := range items {
			item = strings.TrimSpace(item)
			if item != "" && !seen[item] {
				seen[item] = true
				out = append(out, item)
			}
		}
		return out
	}
	excluded := []string{}
	for _, line := range strings.Split(chain, "\n") {
		if strings.Contains(line, " -s ") && strings.Contains(line, " -j RETURN") {
			excluded = append(excluded, parseKeeneticSources(line)...)
		}
	}
	if len(excluded) > 0 {
		return "exclude", unique(excluded)
	}
	selected := []string{}
	for _, line := range strings.Split(prerouting, "\n") {
		if strings.Contains(line, "-j RUOPENRAY") && strings.Contains(line, " -s ") {
			selected = append(selected, parseKeeneticSources(line)...)
		}
	}
	if len(selected) > 0 {
		return "selected", unique(selected)
	}
	return "all", []string{}
}

func parseKeeneticRuleCounters(text string) map[string]any {
	packets := int64(0)
	bytes := int64(0)
	for _, line := range strings.Split(text, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		pkts, ok := parseNumber(fields[0])
		if !ok {
			continue
		}
		size, ok := parseNumber(fields[1])
		if !ok {
			continue
		}
		packets += pkts
		bytes += size
	}
	return map[string]any{"packets": packets, "bytes": bytes}
}

func parseKeeneticTargetCounters(text string, target string) map[string]any {
	packets := int64(0)
	bytes := int64(0)
	for _, line := range strings.Split(text, "\n") {
		if !strings.Contains(line, target) {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		pkts, ok := parseNumber(fields[0])
		if !ok {
			continue
		}
		size, ok := parseNumber(fields[1])
		if !ok {
			continue
		}
		packets += pkts
		bytes += size
	}
	return map[string]any{"packets": packets, "bytes": bytes}
}

func counterPackets(counter map[string]any) int64 {
	if counter == nil {
		return 0
	}
	return numberAny(counter["packets"])
}

func (s *serverState) transparentInboundStatus(port int, routerMode string) map[string]any {
	result := map[string]any{"ok": false, "port": port, "found": false, "tcpOpen": false, "detail": "transparent inbound not found in active Xray config"}
	cfg, err := s.readActiveConfig()
	if err != nil {
		result["error"] = err.Error()
		result["detail"] = "active Xray config is not readable"
		return result
	}
	for _, item := range asArray(cfg["inbounds"]) {
		inbound, ok := item.(map[string]any)
		if !ok || number(inbound["port"], 0) != port {
			continue
		}
		protocol := strings.TrimSpace(fmt.Sprint(inbound["protocol"]))
		tag := strings.TrimSpace(fmt.Sprint(inbound["tag"]))
		settings, _ := inbound["settings"].(map[string]any)
		streamSettings, _ := inbound["streamSettings"].(map[string]any)
		sockopt, _ := streamSettings["sockopt"].(map[string]any)
		tproxyMode := strings.TrimSpace(fmt.Sprint(sockopt["tproxy"]))
		network := strings.TrimSpace(fmt.Sprint(settings["network"]))
		listen := strings.TrimSpace(fmt.Sprint(inbound["listen"]))
		if listen == "" || listen == "<nil>" || listen == "0.0.0.0" || listen == "::" {
			listen = "127.0.0.1"
		}
		found := protocol == "dokodemo-door" && (strings.Contains(tag, "transparent") || settings["followRedirect"] == true || tproxyMode == "tproxy" || tproxyMode == "redirect")
		if !found {
			continue
		}
		tcpOpen := tcpPortOpen("127.0.0.1:"+fmt.Sprint(port), 250*time.Millisecond)
		okResult := true
		detail := "transparent inbound is present"
		if routerMode == "tproxy" && tproxyMode != "tproxy" {
			okResult = false
			detail = "transparent inbound exists, but streamSettings.sockopt.tproxy is not tproxy"
		}
		if !tcpOpen {
			okResult = false
			detail = "transparent inbound exists, but TCP port is not open"
		}
		result = map[string]any{
			"ok":         okResult,
			"port":       port,
			"found":      true,
			"tag":        tag,
			"protocol":   protocol,
			"listen":     listen,
			"network":    network,
			"tproxyMode": tproxyMode,
			"follow":     settings["followRedirect"] == true,
			"tcpOpen":    tcpOpen,
			"detail":     detail,
		}
		return result
	}
	return result
}

func (s *serverState) keeneticFirewallPreflight(status map[string]any) map[string]any {
	routerMode := strings.TrimSpace(fmt.Sprint(status["routerMode"]))
	if routerMode != "tproxy" {
		routerMode = "redirect"
	}
	transparentPort := number(status["transparentPort"], 52345)
	service := s.xrayServiceStatus()
	inbound := s.transparentInboundStatus(transparentPort, routerMode)
	tproxyModules := mapValue(status["tproxyModules"])
	counters := mapValue(status["counters"])
	active := boolPayload(status, "active", false)
	checks := []map[string]any{}
	add := func(id, label string, ok bool, level string, detail string) {
		checks = append(checks, map[string]any{"id": id, "label": label, "ok": ok, "level": level, "detail": detail})
	}
	available := boolPayload(status, "available", false)
	add("iptables", "iptables", available, ternaryLevel(available, "ok", "error"), firstNonEmpty(fmt.Sprint(status["iptablesPath"]), "iptables not found"))
	xrayRunning := boolPayload(service, "running", false)
	add("xray-service", "Xray service", xrayRunning, ternaryLevel(xrayRunning, "ok", "error"), firstNonEmpty(fmt.Sprint(service["detail"]), fmt.Sprint(service["script"])))
	inboundOK := boolPayload(inbound, "ok", false)
	add("transparent-inbound", "Transparent inbound", inboundOK, ternaryLevel(inboundOK, "ok", "error"), fmt.Sprint(inbound["detail"]))
	if routerMode == "tproxy" {
		modulesOK := boolPayload(tproxyModules, "ok", false)
		modulesLoadable := boolPayload(tproxyModules, "loadable", false)
		add("tproxy-modules", "TPROXY target", modulesOK || modulesLoadable, ternaryLevel(modulesOK, "ok", ternaryLevel(modulesLoadable, "warn", "error")), fmt.Sprint(tproxyModules["detail"]))
		ipRule := boolPayload(status, "ipRule", false)
		ipRoute := boolPayload(status, "ipRoute", false)
		policyOK := ipRule && ipRoute
		level := "ok"
		detail := fmt.Sprintf("ip rule: %v; route table 111: %v", ipRule, ipRoute)
		if !policyOK {
			level = "warn"
			if active {
				level = "error"
			}
		}
		add("policy-routing", "Policy routing", policyOK, level, detail)
		jump := mapValue(counters["tproxyJump"])
		chain := mapValue(counters["tproxyChain"])
		seen := counterPackets(jump) > 0 || counterPackets(chain) > 0
		add("tproxy-counters", "TPROXY counters", seen || !active, ternaryLevel(seen, "ok", "warn"), fmt.Sprintf("jump packets: %d; chain packets: %d", counterPackets(jump), counterPackets(chain)))
	} else {
		jump := mapValue(counters["redirectJump"])
		chain := mapValue(counters["redirectChain"])
		seen := counterPackets(jump) > 0 || counterPackets(chain) > 0
		add("redirect-counters", "REDIRECT counters", seen || !active, ternaryLevel(seen, "ok", "warn"), fmt.Sprintf("jump packets: %d; chain packets: %d", counterPackets(jump), counterPackets(chain)))
	}
	persistent := boolPayload(status, "persistent", false)
	add("persistent-hook", "Persistent hook", persistent, ternaryLevel(persistent, "ok", "warn"), fmt.Sprint(status["hookPath"]))
	ok := true
	runtimeOK := active
	warnings := 0
	for _, check := range checks {
		if fmt.Sprint(check["level"]) == "error" {
			ok = false
			runtimeOK = false
		}
		if fmt.Sprint(check["level"]) == "warn" {
			warnings++
		}
	}
	if !active {
		runtimeOK = false
	}
	summary := "ready"
	if !ok {
		summary = "blocked"
	} else if warnings > 0 {
		summary = "warnings"
	}
	return map[string]any{
		"ok":                 ok,
		"runtimeOk":          runtimeOK,
		"summary":            summary,
		"warnings":           warnings,
		"checks":             checks,
		"service":            service,
		"transparentInbound": inbound,
	}
}

func ternaryLevel(condition bool, yes string, no string) string {
	if condition {
		return yes
	}
	return no
}

func (s *serverState) keeneticFirewallPorts(payload map[string]any) []string {
	if fmt.Sprint(payload["portMode"]) == "all" {
		return []string{"all"}
	}
	ports := stringList(payload["ports"])
	if len(ports) == 0 {
		ports = []string{"80", "443"}
	}
	for _, port := range s.keeneticExternalFirewallLists(payload)["portProxy"] {
		ports = append(ports, port)
	}
	return unique(ports)
}

func unique(values []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func keeneticFirewallPortMode(payload map[string]any, ports []string) string {
	if fmt.Sprint(payload["portMode"]) == "all" || (len(ports) == 1 && ports[0] == "all") {
		return "all"
	}
	return "custom"
}

func keeneticFirewallDeviceMode(payload map[string]any, devices []string) string {
	mode := strings.TrimSpace(fmt.Sprint(payload["deviceMode"]))
	if (mode == "selected" || mode == "exclude") && len(devices) > 0 {
		return mode
	}
	return "all"
}

func keeneticPortsEnvValue(ports []string) string {
	if len(ports) == 1 && ports[0] == "all" {
		return "all"
	}
	return strings.Join(ports, " ")
}

func keeneticScriptEnv(routerMode string, lanInterface string, transparentPort int, ports []string, blockQuic bool, dnsIntercept bool, ipv6Mode string, deviceMode string, devices []string, ipExclude []string, portExclude []string, dscpProxy int) string {
	block := "0"
	if blockQuic {
		block = "1"
	}
	dns := "0"
	if dnsIntercept {
		dns = "1"
	}
	if routerMode != "tproxy" {
		routerMode = "redirect"
	}
	if ipv6Mode != "disable" && ipv6Mode != "allow" {
		ipv6Mode = "observe"
	}
	return "RUOPENRAY_ROUTER_MODE=" + singleQuote(routerMode) +
		" RUOPENRAY_LAN_IF=" + singleQuote(lanInterface) +
		" RUOPENRAY_TRANSPARENT_PORT=" + singleQuote(strconv.Itoa(transparentPort)) +
		" RUOPENRAY_PORTS=" + singleQuote(keeneticPortsEnvValue(ports)) +
		" RUOPENRAY_DNS_INTERCEPT=" + singleQuote(dns) +
		" RUOPENRAY_IPV6_MODE=" + singleQuote(ipv6Mode) +
		" RUOPENRAY_IP_EXCLUDE=" + singleQuote(strings.Join(ipExclude, " ")) +
		" RUOPENRAY_PORT_EXCLUDE=" + singleQuote(strings.Join(portExclude, " ")) +
		" RUOPENRAY_DSCP_PROXY=" + singleQuote(func() string {
		if dscpProxy <= 0 {
			return ""
		}
		return strconv.Itoa(dscpProxy)
	}()) +
		" RUOPENRAY_DEVICE_MODE=" + singleQuote(deviceMode) +
		" RUOPENRAY_DEVICES=" + singleQuote(strings.Join(devices, " ")) +
		" RUOPENRAY_BLOCK_QUIC=" + singleQuote(block)
}

func (s *serverState) keeneticFirewallMeta(payload map[string]any, routerMode string, lanInterface string, transparentPort int, ports []string, blockQuic bool) map[string]any {
	devices := stringList(payload["devices"])
	deviceMode := keeneticFirewallDeviceMode(payload, devices)
	portMode := keeneticFirewallPortMode(payload, ports)
	externalLists := s.keeneticExternalFirewallLists(payload)
	settings := s.normalizeKeeneticSettings(map[string]any{})
	dscpProxy := 0
	if fmt.Sprint(settings["dscpMode"]) == "tproxy" && routerMode == "tproxy" {
		dscpProxy = number(settings["dscpProxy"], 63)
	}
	dnsIntercept := boolPayload(payload, "dnsIntercept", false)
	ipv6Mode := cleanKeeneticMode(settings["ipv6Mode"], "observe", "observe", "disable", "allow")
	if portMode == "all" {
		ports = []string{}
	}
	return map[string]any{
		"routerMode":          routerMode,
		"bypassMode":          "off",
		"deviceMode":          deviceMode,
		"devices":             devices,
		"portMode":            portMode,
		"ports":               ports,
		"transparentPort":     transparentPort,
		"lanInterface":        lanInterface,
		"blockQuic":           blockQuic,
		"dnsIntercept":        dnsIntercept,
		"ipv6Mode":            ipv6Mode,
		"keeneticIpExclude":   externalLists["ipExclude"],
		"keeneticPortProxy":   externalLists["portProxy"],
		"keeneticPortExclude": externalLists["portExclude"],
		"dscpProxy":           dscpProxy,
	}
}

func readKeeneticFirewallMeta() map[string]any {
	body, err := os.ReadFile(keeneticFirewallMetaPath)
	if err != nil {
		return map[string]any{}
	}
	meta := map[string]any{}
	if err := json.Unmarshal(body, &meta); err != nil {
		return map[string]any{}
	}
	return meta
}

func writeKeeneticFirewallMeta(meta map[string]any) error {
	if err := os.MkdirAll(filepath.Dir(keeneticFirewallMetaPath), 0o755); err != nil {
		return err
	}
	body, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	body = append(body, '\n')
	return os.WriteFile(keeneticFirewallMetaPath, body, 0o644)
}

func writeExecutableFile(path string, body string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(body), 0o755)
}

func (s *serverState) keeneticFirewallStatus() map[string]any {
	iptables := keeneticIptablesPath()
	ip6tables := keeneticIP6TablesPath()
	available := runtime.GOOS != "windows" && iptables != ""
	natChain := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	natPrerouting := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	mangleChain := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	manglePrerouting := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	filterChain := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	dnsGuardChain := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	filterForward := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	natChainCounters := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	natPreroutingCounters := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	mangleChainCounters := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	manglePreroutingCounters := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	filterForwardCounters := map[string]any{"ok": false, "stderr": "iptables unavailable"}
	ipv6Chain := map[string]any{"ok": false, "stderr": "ip6tables unavailable"}
	ipv6Forward := map[string]any{"ok": false, "stderr": "ip6tables unavailable"}
	ipRules := map[string]any{"ok": false, "stderr": "ip unavailable"}
	ipRoutes := map[string]any{"ok": false, "stderr": "ip unavailable"}
	if available {
		natChain = runTimeout(5*time.Second, iptables, "-t", "nat", "-S", "RUOPENRAY")
		natPrerouting = runTimeout(5*time.Second, iptables, "-t", "nat", "-S", "PREROUTING")
		mangleChain = runTimeout(5*time.Second, iptables, "-t", "mangle", "-S", "RUOPENRAY_TPROXY")
		manglePrerouting = runTimeout(5*time.Second, iptables, "-t", "mangle", "-S", "PREROUTING")
		filterChain = runTimeout(5*time.Second, iptables, "-t", "filter", "-S", "RUOPENRAY_QUIC")
		dnsGuardChain = runTimeout(5*time.Second, iptables, "-t", "filter", "-S", "RUOPENRAY_DNS_GUARD")
		filterForward = runTimeout(5*time.Second, iptables, "-t", "filter", "-S", "FORWARD")
		natChainCounters = runTimeout(5*time.Second, iptables, "-t", "nat", "-vnL", "RUOPENRAY")
		natPreroutingCounters = runTimeout(5*time.Second, iptables, "-t", "nat", "-vnL", "PREROUTING")
		mangleChainCounters = runTimeout(5*time.Second, iptables, "-t", "mangle", "-vnL", "RUOPENRAY_TPROXY")
		manglePreroutingCounters = runTimeout(5*time.Second, iptables, "-t", "mangle", "-vnL", "PREROUTING")
		filterForwardCounters = runTimeout(5*time.Second, iptables, "-t", "filter", "-vnL", "FORWARD")
		ipRules = runTimeout(5*time.Second, "ip", "rule", "show")
		ipRoutes = runTimeout(5*time.Second, "ip", "route", "show", "table", "111")
	}
	if runtime.GOOS != "windows" && ip6tables != "" {
		ipv6Chain = runTimeout(5*time.Second, ip6tables, "-t", "filter", "-S", "RUOPENRAY_IPV6")
		ipv6Forward = runTimeout(5*time.Second, ip6tables, "-t", "filter", "-S", "FORWARD")
	}
	natChainText := fmt.Sprint(natChain["stdout"])
	natPreroutingText := fmt.Sprint(natPrerouting["stdout"])
	mangleChainText := fmt.Sprint(mangleChain["stdout"])
	manglePreroutingText := fmt.Sprint(manglePrerouting["stdout"])
	filterChainText := fmt.Sprint(filterChain["stdout"])
	dnsGuardChainText := fmt.Sprint(dnsGuardChain["stdout"])
	filterForwardText := fmt.Sprint(filterForward["stdout"])
	natChainCountersText := fmt.Sprint(natChainCounters["stdout"])
	natPreroutingCountersText := fmt.Sprint(natPreroutingCounters["stdout"])
	mangleChainCountersText := fmt.Sprint(mangleChainCounters["stdout"])
	manglePreroutingCountersText := fmt.Sprint(manglePreroutingCounters["stdout"])
	filterForwardCountersText := fmt.Sprint(filterForwardCounters["stdout"])
	ipv6ChainText := fmt.Sprint(ipv6Chain["stdout"])
	ipv6ForwardText := fmt.Sprint(ipv6Forward["stdout"])
	redirectActive := natChain["ok"] == true &&
		strings.Contains(natChainText, "REDIRECT") &&
		strings.Contains(natPreroutingText, "-j RUOPENRAY")
	tproxyActive := mangleChain["ok"] == true &&
		strings.Contains(mangleChainText, "TPROXY") &&
		strings.Contains(manglePreroutingText, "-j RUOPENRAY_TPROXY")
	active := redirectActive || tproxyActive
	blockQuic := filterChain["ok"] == true &&
		strings.Contains(filterChainText, "REJECT") &&
		strings.Contains(filterForwardText, "-j RUOPENRAY_QUIC")
	dnsInterceptActive := strings.Contains(natPreroutingText, "--dport 53") && strings.Contains(natPreroutingText, "-j RUOPENRAY") ||
		strings.Contains(manglePreroutingText, "--dport 53") && strings.Contains(manglePreroutingText, "-j RUOPENRAY_TPROXY") ||
		dnsGuardChain["ok"] == true && strings.Contains(dnsGuardChainText, "REJECT") && strings.Contains(filterForwardText, "-j RUOPENRAY_DNS_GUARD")
	ipv6DisabledActive := ipv6Chain["ok"] == true &&
		(strings.Contains(ipv6ChainText, "REJECT") || strings.Contains(ipv6ChainText, "DROP")) &&
		strings.Contains(ipv6ForwardText, "-j RUOPENRAY_IPV6")
	persistent := false
	if _, err := os.Stat(keeneticRedirectHookPath); err == nil {
		persistent = true
	}
	disableScript := false
	if _, err := os.Stat(keeneticRedirectDisablePath); err == nil {
		disableScript = true
	}
	lanInterface := parseKeeneticLANInterface(natPreroutingText)
	if tproxyActive {
		lanInterface = parseKeeneticLANInterface(manglePreroutingText)
	}
	transparentPort := parseKeeneticRedirectPort(natChainText + "\n" + mangleChainText)
	ports := parseKeeneticRedirectPorts(natPreroutingText)
	portMode := "custom"
	if parseKeeneticAllPorts(natPreroutingText) {
		portMode = "all"
		ports = []string{}
	}
	if tproxyActive {
		ports = parseKeeneticRedirectPorts(manglePreroutingText)
		portMode = "custom"
		if parseKeeneticAllPorts(manglePreroutingText) {
			portMode = "all"
			ports = []string{}
		}
	}
	routerMode := "redirect"
	if tproxyActive {
		routerMode = "tproxy"
	}
	deviceMode, devices := parseKeeneticDeviceScope(natPreroutingText, natChainText)
	if tproxyActive {
		deviceMode, devices = parseKeeneticDeviceScope(manglePreroutingText, mangleChainText)
	}
	ipRulesText := fmt.Sprint(ipRules["stdout"])
	ipRoutesText := fmt.Sprint(ipRoutes["stdout"])
	ipRuleActive := strings.Contains(ipRulesText, "fwmark 0x111") && strings.Contains(ipRulesText, "lookup 111")
	ipRouteActive := strings.Contains(ipRoutesText, "local") && strings.Contains(ipRoutesText, "dev lo")
	counters := map[string]any{
		"redirectChain": parseKeeneticRuleCounters(natChainCountersText),
		"redirectJump":  parseKeeneticTargetCounters(natPreroutingCountersText, "RUOPENRAY"),
		"tproxyChain":   parseKeeneticRuleCounters(mangleChainCountersText),
		"tproxyJump":    parseKeeneticTargetCounters(manglePreroutingCountersText, "RUOPENRAY_TPROXY"),
		"quicGuardJump": parseKeeneticTargetCounters(filterForwardCountersText, "RUOPENRAY_QUIC"),
		"dnsGuardJump":  parseKeeneticTargetCounters(filterForwardCountersText, "RUOPENRAY_DNS_GUARD"),
		"raw":           map[string]any{"natChain": natChainCounters, "natPrerouting": natPreroutingCounters, "mangleChain": mangleChainCounters, "manglePrerouting": manglePreroutingCounters, "filterForward": filterForwardCounters},
	}
	meta := readKeeneticFirewallMeta()
	if value := strings.TrimSpace(fmt.Sprint(meta["routerMode"])); !active && value != "" && value != "<nil>" {
		routerMode = value
	}
	if value := strings.TrimSpace(fmt.Sprint(meta["lanInterface"])); value != "" && value != "<nil>" {
		lanInterface = value
	}
	if value := int(numberAny(meta["transparentPort"])); value > 0 && value < 65536 {
		transparentPort = value
	}
	if value := strings.TrimSpace(fmt.Sprint(meta["portMode"])); value == "all" || value == "custom" {
		portMode = value
		if value == "all" {
			ports = []string{}
		} else if metaPorts := stringList(meta["ports"]); len(metaPorts) > 0 {
			ports = metaPorts
		}
	}
	if value := strings.TrimSpace(fmt.Sprint(meta["deviceMode"])); value == "selected" || value == "exclude" || value == "all" {
		deviceMode = value
		devices = stringList(meta["devices"])
	}
	dnsIntercept := dnsInterceptActive
	if _, ok := meta["dnsIntercept"]; ok {
		dnsIntercept = boolPayload(meta, "dnsIntercept", dnsInterceptActive)
	}
	ipv6Mode := "observe"
	if value := strings.TrimSpace(fmt.Sprint(meta["ipv6Mode"])); value == "disable" || value == "allow" || value == "observe" {
		ipv6Mode = value
	} else if settings := s.normalizeKeeneticSettings(map[string]any{}); strings.TrimSpace(fmt.Sprint(settings["ipv6Mode"])) != "" {
		ipv6Mode = cleanKeeneticMode(settings["ipv6Mode"], "observe", "observe", "disable", "allow")
	}
	keeneticSettings := s.keeneticSettings()
	ipExclude := []string{}
	portProxy := []string{}
	portExclude := []string{}
	if values := stringList(meta["keeneticIpExclude"]); len(values) > 0 {
		ipExclude = values
	} else if values, ok := keeneticSettings["ipExclude"].([]string); ok {
		ipExclude = values
	}
	if values := stringList(meta["keeneticPortProxy"]); len(values) > 0 {
		portProxy = values
	} else if values, ok := keeneticSettings["portProxy"].([]string); ok {
		portProxy = values
	}
	if values := stringList(meta["keeneticPortExclude"]); len(values) > 0 {
		portExclude = values
	} else if values, ok := keeneticSettings["portExclude"].([]string); ok {
		portExclude = values
	}
	status := map[string]any{
		"ok":                  true,
		"available":           available,
		"platform":            s.cfg.Platform,
		"routerMode":          routerMode,
		"bypassMode":          "off",
		"deviceMode":          deviceMode,
		"devices":             devices,
		"portMode":            portMode,
		"ports":               ports,
		"transparentPort":     transparentPort,
		"lanInterface":        lanInterface,
		"dnsIntercept":        dnsIntercept,
		"ipv6Mode":            ipv6Mode,
		"ipv6Active":          ipv6DisabledActive,
		"ipv6Available":       ip6tables != "",
		"keeneticIpExclude":   ipExclude,
		"keeneticPortProxy":   portProxy,
		"keeneticPortExclude": portExclude,
		"dscpProxy":           number(meta["dscpProxy"], 0),
		"keeneticSettings":    keeneticSettings,
		"blockQuic":           blockQuic,
		"persistent":          persistent,
		"active":              active,
		"hotplug":             persistent,
		"hookPath":            keeneticRedirectHookPath,
		"disablePath":         keeneticRedirectDisablePath,
		"metaPath":            keeneticFirewallMetaPath,
		"disableScript":       disableScript,
		"iptablesPath":        iptables,
		"ipRule":              routerMode != "tproxy" || ipRuleActive,
		"ipRoute":             routerMode != "tproxy" || ipRouteActive,
		"iptables": map[string]any{
			"natChain":         natChain,
			"natPrerouting":    natPrerouting,
			"mangleChain":      mangleChain,
			"manglePrerouting": manglePrerouting,
			"filterChain":      filterChain,
			"dnsGuardChain":    dnsGuardChain,
			"filterForward":    filterForward,
			"ipv6Chain":        ipv6Chain,
			"ipv6Forward":      ipv6Forward,
		},
		"counters":            counters,
		"ipRules":             ipRules,
		"ipRoutes":            ipRoutes,
		"tproxyModules":       keeneticTPROXYTargetStatus(),
		"killSwitchNftset":    map[string]any{"available": false, "active": false, "count": 0, "domains": []string{}},
		"killSwitchDNSBlock":  map[string]any{"available": false, "active": false, "count": 0, "domains": []string{}},
		"directNftset":        map[string]any{"available": false, "active": false, "count": 0, "domains": []string{}},
		"proxyNftset":         map[string]any{"available": false, "active": false, "count": 0, "domains": []string{}},
		"needsPolicyFix":      routerMode == "tproxy" && (!ipRuleActive || !ipRouteActive),
		"supportedTransports": []string{"tcp", "udp"},
	}
	if !available {
		status["message"] = "iptables is unavailable in Entware; install it with: opkg install iptables"
	}
	status["preflight"] = s.keeneticFirewallPreflight(status)
	return status
}

func (s *serverState) previewKeeneticFirewall(payload map[string]any) map[string]any {
	transparentPort := int(numberAny(payload["transparentPort"]))
	if transparentPort <= 0 || transparentPort > 65535 {
		transparentPort = 52345
	}
	routerMode := strings.TrimSpace(fmt.Sprint(payload["routerMode"]))
	if routerMode != "tproxy" {
		routerMode = "redirect"
	}
	lanInterface := strings.TrimSpace(fmt.Sprint(payload["lanInterface"]))
	if lanInterface == "" || lanInterface == "<nil>" {
		lanInterface = "br0"
	}
	blockQuic := boolPayload(payload, "blockQuic", true)
	ports := s.keeneticFirewallPorts(payload)
	meta := s.keeneticFirewallMeta(payload, routerMode, lanInterface, transparentPort, ports, blockQuic)
	devices := stringList(meta["devices"])
	ipExclude := stringList(meta["keeneticIpExclude"])
	portExclude := stringList(meta["keeneticPortExclude"])
	dscpProxy := number(meta["dscpProxy"], 0)
	env := keeneticScriptEnv(routerMode, lanInterface, transparentPort, ports, blockQuic, boolPayload(meta, "dnsIntercept", false), fmt.Sprint(meta["ipv6Mode"]), fmt.Sprint(meta["deviceMode"]), devices, ipExclude, portExclude, dscpProxy)
	preview := strings.Join([]string{
		"opkg install iptables",
		"mkdir -p /opt/etc/ndm/netfilter.d /opt/etc/ruopenray-ui",
		"install -m 0755 keenetic-redirect.sh " + keeneticRedirectHookPath,
		"install -m 0755 keenetic-disable-redirect.sh " + keeneticRedirectDisablePath,
		"install -m 0644 keenetic-firewall.json " + keeneticFirewallMetaPath,
		env + " " + keeneticRedirectHookPath,
	}, "\n")
	return map[string]any{
		"ok":      true,
		"meta":    meta,
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
	routerMode := strings.TrimSpace(fmt.Sprint(payload["routerMode"]))
	if routerMode != "tproxy" {
		routerMode = "redirect"
	}
	if routerMode == "tproxy" {
		tproxy := keeneticTPROXYTargetStatus()
		if tproxy["ok"] != true && tproxy["loadable"] != true {
			return map[string]any{"ok": false, "available": false, "error": "TPROXY kernel module is unavailable on this Keenetic", "status": s.firewallStatus(), "tproxyModules": tproxy}
		}
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
	ports := s.keeneticFirewallPorts(payload)
	meta := s.keeneticFirewallMeta(payload, routerMode, lanInterface, transparentPort, ports, blockQuic)
	if err := writeExecutableFile(keeneticRedirectHookPath, keeneticRedirectHookScript); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "status": s.firewallStatus()}
	}
	if err := writeExecutableFile(keeneticRedirectDisablePath, keeneticRedirectDisableScript); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "status": s.firewallStatus()}
	}
	if err := writeKeeneticFirewallMeta(meta); err != nil {
		return map[string]any{"ok": false, "error": err.Error(), "status": s.firewallStatus()}
	}
	devices := stringList(meta["devices"])
	ipExclude := stringList(meta["keeneticIpExclude"])
	portExclude := stringList(meta["keeneticPortExclude"])
	dscpProxy := number(meta["dscpProxy"], 0)
	step := runTimeout(15*time.Second, "sh", "-c", keeneticScriptEnv(routerMode, lanInterface, transparentPort, ports, blockQuic, boolPayload(meta, "dnsIntercept", false), fmt.Sprint(meta["ipv6Mode"]), fmt.Sprint(meta["deviceMode"]), devices, ipExclude, portExclude, dscpProxy)+" "+singleQuote(keeneticRedirectHookPath))
	status := s.firewallStatus()
	ok := step["ok"] == true && status["active"] == true && status["persistent"] == true && status["routerMode"] == routerMode
	if routerMode == "tproxy" {
		ok = ok && status["ipRule"] == true && status["ipRoute"] == true
	}
	if blockQuic {
		ok = ok && status["blockQuic"] == true
	}
	return map[string]any{
		"ok":     ok,
		"steps":  []map[string]any{step},
		"status": status,
		"meta":   meta,
	}
}

func (s *serverState) disableKeeneticFirewall() map[string]any {
	if runtime.GOOS == "windows" {
		return map[string]any{"ok": false, "available": false, "error": "Keenetic firewall can only be disabled on the router"}
	}
	_ = writeExecutableFile(keeneticRedirectDisablePath, keeneticRedirectDisableScript)
	step := runTimeout(15*time.Second, "sh", "-c", "RUOPENRAY_LAN_IF='br0' "+singleQuote(keeneticRedirectDisablePath))
	_ = os.Remove(keeneticRedirectHookPath)
	_ = os.Remove(keeneticFirewallMetaPath)
	status := s.firewallStatus()
	return map[string]any{"ok": step["ok"] == true && status["active"] != true && status["persistent"] != true, "steps": []map[string]any{step}, "status": status}
}
