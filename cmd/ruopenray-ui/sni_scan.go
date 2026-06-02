package main

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"sort"
	"strings"
	"time"
)

func (s *serverState) scanSNI(w http.ResponseWriter, r *http.Request) {
	payload, _ := readJSON(w, r)
	target := strings.TrimSpace(fmt.Sprint(payload["target"]))
	if target == "" || target == "<nil>" {
		writeJSON(w, 400, map[string]any{"ok": false, "error": "Укажите IP или домен для поиска"})
		return
	}
	targetIP, err := resolveIPv4(target)
	if err != nil {
		writeJSON(w, 400, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	cidr := number(payload["cidr"], 24)
	if cidr < 24 {
		cidr = 24
	}
	if cidr > 32 {
		cidr = 32
	}
	timeoutMs := number(payload["timeoutMs"], 1500)
	if timeoutMs < 500 {
		timeoutMs = 500
	}
	if timeoutMs > 8000 {
		timeoutMs = 8000
	}
	threads := number(payload["threads"], 64)
	if threads < 1 {
		threads = 1
	}
	if threads > 128 {
		threads = 128
	}
	limit := number(payload["limit"], 256)
	if limit < 1 {
		limit = 1
	}
	if limit > 1024 {
		limit = 1024
	}

	ips, network := cidrHosts(targetIP, cidr, limit)
	jobs := make(chan net.IP)
	results := make(chan map[string]any, len(ips))
	for worker := 0; worker < threads; worker++ {
		go func() {
			for ip := range jobs {
				results <- probeSNI(ip, targetIP, timeoutMs)
			}
		}()
	}
	for _, ip := range ips {
		jobs <- ip
	}
	close(jobs)

	found := []map[string]any{}
	for completed := 0; completed < len(ips); completed++ {
		if item := <-results; item != nil {
			found = append(found, item)
		}
	}
	sort.Slice(found, func(i, j int) bool {
		return number(found[i]["proximity"], 0) > number(found[j]["proximity"], 0)
	})
	writeJSON(w, 200, map[string]any{
		"ok": true, "target": target, "targetIp": targetIP.String(), "cidr": cidr, "network": network,
		"scanned": len(ips), "results": found,
	})
}

func resolveIPv4(value string) (net.IP, error) {
	if ip := net.ParseIP(value).To4(); ip != nil {
		return ip, nil
	}
	ips, err := net.LookupIP(value)
	if err != nil {
		return nil, err
	}
	for _, ip := range ips {
		if v4 := ip.To4(); v4 != nil {
			return v4, nil
		}
	}
	return nil, fmt.Errorf("IPv4 для %s не найден", value)
}

func cidrHosts(target net.IP, cidr int, limit int) ([]net.IP, string) {
	mask := net.CIDRMask(cidr, 32)
	networkIP := target.Mask(mask).To4()
	ones, bits := mask.Size()
	total := 1 << (bits - ones)
	if total > limit {
		total = limit
	}
	base := ipToUint32(networkIP)
	ips := make([]net.IP, 0, total)
	for offset := 0; offset < total; offset++ {
		ip := uint32ToIP(base + uint32(offset))
		if cidr < 31 && (offset == 0 || offset == (1<<(bits-ones))-1) {
			continue
		}
		if ip.Equal(target) {
			continue
		}
		ips = append(ips, ip)
	}
	return ips, fmt.Sprintf("%s/%d", networkIP.String(), cidr)
}

func probeSNI(ip net.IP, target net.IP, timeoutMs int) map[string]any {
	started := time.Now()
	dialer := &net.Dialer{Timeout: time.Duration(timeoutMs) * time.Millisecond}
	conn, err := tls.DialWithDialer(dialer, "tcp", net.JoinHostPort(ip.String(), "443"), &tls.Config{
		InsecureSkipVerify: true,
		NextProtos:         []string{"h2", "http/1.1"},
	})
	latency := time.Since(started).Milliseconds()
	if err != nil {
		return nil
	}
	defer conn.Close()
	state := conn.ConnectionState()
	if len(state.PeerCertificates) == 0 {
		return nil
	}
	cert := state.PeerCertificates[0]
	domain := cert.Subject.CommonName
	if domain == "" && len(cert.DNSNames) > 0 {
		domain = cert.DNSNames[0]
	}
	if domain == "" {
		domain = ip.String()
	}
	return map[string]any{
		"ip": ip.String(), "domain": domain, "issuer": cert.Issuer.CommonName,
		"dnsNames": cert.DNSNames, "latencyMs": latency, "proximity": proximity(ip, target),
	}
}

func ipToUint32(ip net.IP) uint32 {
	v := ip.To4()
	return uint32(v[0])<<24 | uint32(v[1])<<16 | uint32(v[2])<<8 | uint32(v[3])
}

func uint32ToIP(value uint32) net.IP {
	return net.IPv4(byte(value>>24), byte(value>>16), byte(value>>8), byte(value))
}

func proximity(ip net.IP, target net.IP) int {
	diff := int64(ipToUint32(ip)) - int64(ipToUint32(target))
	if diff < 0 {
		diff = -diff
	}
	score := 100 - int(diff*100/256)
	if score < 0 {
		return 0
	}
	return score
}
