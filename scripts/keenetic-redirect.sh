#!/bin/sh
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
