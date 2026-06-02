#!/bin/sh
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
