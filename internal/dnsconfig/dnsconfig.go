package dnsconfig

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const DefaultXrayDnsmasqTarget = "127.0.0.1#10535"

func NormalizeDnsmasqServer(value string) string {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return ""
	}
	if strings.Contains(raw, "#") {
		return raw
	}
	if strings.HasPrefix(raw, "[") {
		if strings.Contains(raw, "]:") {
			return strings.Replace(raw, "]:", "]#", 1)
		}
		return raw + "#53"
	}
	if host, port, err := net.SplitHostPort(raw); err == nil && host != "" && port != "" {
		return strings.Trim(host, "[]") + "#" + port
	}
	if strings.Count(raw, ":") == 1 {
		parts := strings.Split(raw, ":")
		if parts[0] != "" && parts[1] != "" {
			return parts[0] + "#" + parts[1]
		}
	}
	return raw + "#53"
}

func LANCommandPlan(mode, upstream string, restart bool) (map[string]any, error) {
	commands := [][]string{}
	display := []string{}
	warnings := []string{}
	switch mode {
	case "system":
		commands = append(commands,
			[]string{"uci", "-q", "delete", "dhcp.@dnsmasq[0].noresolv"},
			[]string{"uci", "-q", "delete", "dhcp.@dnsmasq[0].server"},
		)
	case "xray":
		server := NormalizeDnsmasqServer(upstream)
		if server == "" {
			server = DefaultXrayDnsmasqTarget
		}
		commands = append(commands,
			[]string{"uci", "set", "dhcp.@dnsmasq[0].noresolv=1"},
			[]string{"uci", "-q", "delete", "dhcp.@dnsmasq[0].server"},
			[]string{"uci", "add_list", "dhcp.@dnsmasq[0].server=" + server},
		)
		warnings = append(warnings, "Если Xray DNS inbound не запущен, устройства в LAN временно потеряют DNS.")
	case "upstream":
		server := NormalizeDnsmasqServer(upstream)
		if server == "" {
			return nil, errors.New("укажите адрес внешнего DNS или Pi-hole")
		}
		commands = append(commands,
			[]string{"uci", "set", "dhcp.@dnsmasq[0].noresolv=1"},
			[]string{"uci", "-q", "delete", "dhcp.@dnsmasq[0].server"},
			[]string{"uci", "add_list", "dhcp.@dnsmasq[0].server=" + server},
		)
	default:
		return nil, errors.New("неизвестный режим LAN DNS")
	}
	commands = append(commands, []string{"uci", "commit", "dhcp"})
	if restart {
		commands = append(commands, []string{"/etc/init.d/dnsmasq", "restart"})
		warnings = append(warnings, "dnsmasq будет перезапущен, DNS может пропасть на несколько секунд.")
	}
	for _, command := range commands {
		display = append(display, shellCommandLine(command))
	}
	return map[string]any{"mode": mode, "commands": display, "argv": commands, "warnings": warnings}, nil
}

func PlanCommands(plan map[string]any) [][]string {
	commands := [][]string{}
	if typed, ok := plan["argv"].([][]string); ok {
		return typed
	}
	for _, raw := range anySlice(plan["argv"]) {
		row := stringSlice(raw)
		if len(row) > 0 {
			commands = append(commands, row)
		}
	}
	return commands
}

func CleanCheckHost(value string) string {
	clean := strings.TrimSpace(value)
	if clean == "" || clean == "<nil>" {
		return "example.com"
	}
	if strings.Contains(clean, "://") {
		if parsed, err := url.Parse(clean); err == nil && parsed.Hostname() != "" {
			clean = parsed.Hostname()
		}
	}
	clean = strings.Trim(clean, " .\t\r\n")
	if clean == "" {
		return "example.com"
	}
	return clean
}

func ResolveViaServer(server string, host string) ([]string, []string, error) {
	server = strings.TrimSpace(server)
	if server == "" || server == "<nil>" {
		server = "system"
	}
	if strings.HasPrefix(strings.ToLower(server), "https://") {
		a, errA := dohLookup(server, host, 1)
		aaaa, errAAAA := dohLookup(server, host, 28)
		if errA != nil && errAAAA != nil {
			return nil, nil, errA
		}
		return a, aaaa, nil
	}
	resolver, err := resolverForServer(server)
	if err != nil {
		return nil, nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var a []string
	var aaaa []string
	if ips, err := resolver.LookupIP(ctx, "ip4", host); err == nil {
		for _, ip := range ips {
			a = append(a, ip.String())
		}
	}
	if ips, err := resolver.LookupIP(ctx, "ip6", host); err == nil {
		for _, ip := range ips {
			aaaa = append(aaaa, ip.String())
		}
	}
	if len(a) == 0 && len(aaaa) == 0 {
		return a, aaaa, errors.New("DNS-сервер ответил, но A/AAAA-записей не найдено")
	}
	return a, aaaa, nil
}

func resolverForServer(server string) (*net.Resolver, error) {
	server = strings.TrimSpace(server)
	if server == "" || server == "system" {
		return net.DefaultResolver, nil
	}
	network := "udp"
	target := server
	if strings.HasPrefix(strings.ToLower(server), "tcp://") {
		network = "tcp"
		target = strings.TrimPrefix(server, "tcp://")
	} else if strings.HasPrefix(strings.ToLower(server), "udp://") {
		target = strings.TrimPrefix(server, "udp://")
	}
	if strings.Contains(target, "://") {
		return nil, fmt.Errorf("тип DNS-сервера пока не поддержан: %s", server)
	}
	if _, _, err := net.SplitHostPort(target); err != nil {
		target = net.JoinHostPort(target, "53")
	}
	dialer := &net.Dialer{Timeout: 4 * time.Second}
	return &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, network, target)
		},
	}, nil
}

func dohLookup(endpoint string, host string, qtype uint16) ([]string, error) {
	query, err := dnsWireQuery(host, qtype)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 7*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(query))
	if err != nil {
		return nil, err
	}
	req.Header.Set("accept", "application/dns-message")
	req.Header.Set("content-type", "application/dns-message")
	req.Header.Set("user-agent", "RuOpenRay UI")
	if req.URL != nil && req.URL.User != nil {
		user := req.URL.User.Username()
		password, _ := req.URL.User.Password()
		req.SetBasicAuth(user, password)
	}
	resp, err := (&http.Client{Timeout: 8 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("DoH HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return nil, err
	}
	return parseDNSWireAnswers(body, qtype)
}

func dnsWireQuery(host string, qtype uint16) ([]byte, error) {
	var id [2]byte
	_, _ = rand.Read(id[:])
	buf := bytes.NewBuffer(nil)
	buf.Write(id[:])
	buf.Write([]byte{0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00})
	for _, label := range strings.Split(strings.Trim(host, "."), ".") {
		if label == "" || len(label) > 63 {
			return nil, fmt.Errorf("некорректный домен для DNS-проверки: %s", host)
		}
		buf.WriteByte(byte(len(label)))
		buf.WriteString(label)
	}
	buf.WriteByte(0)
	var tail [4]byte
	binary.BigEndian.PutUint16(tail[0:2], qtype)
	binary.BigEndian.PutUint16(tail[2:4], 1)
	buf.Write(tail[:])
	return buf.Bytes(), nil
}

func parseDNSWireAnswers(message []byte, qtype uint16) ([]string, error) {
	if len(message) < 12 {
		return nil, errors.New("короткий DNS-ответ")
	}
	rcode := message[3] & 0x0f
	if rcode != 0 && rcode != 3 {
		return nil, fmt.Errorf("DNS rcode %d", rcode)
	}
	qd := int(binary.BigEndian.Uint16(message[4:6]))
	an := int(binary.BigEndian.Uint16(message[6:8]))
	offset := 12
	for i := 0; i < qd; i++ {
		next, err := skipDNSName(message, offset)
		if err != nil {
			return nil, err
		}
		offset = next + 4
		if offset > len(message) {
			return nil, errors.New("поврежденный DNS-вопрос")
		}
	}
	var out []string
	for i := 0; i < an; i++ {
		next, err := skipDNSName(message, offset)
		if err != nil {
			return nil, err
		}
		offset = next
		if offset+10 > len(message) {
			return nil, errors.New("поврежденная DNS-запись")
		}
		typ := binary.BigEndian.Uint16(message[offset : offset+2])
		class := binary.BigEndian.Uint16(message[offset+2 : offset+4])
		rdlen := int(binary.BigEndian.Uint16(message[offset+8 : offset+10]))
		offset += 10
		if offset+rdlen > len(message) {
			return nil, errors.New("поврежденные DNS-данные")
		}
		rdata := message[offset : offset+rdlen]
		if class == 1 && typ == qtype {
			if typ == 1 && rdlen == net.IPv4len {
				out = append(out, net.IP(rdata).String())
			}
			if typ == 28 && rdlen == net.IPv6len {
				out = append(out, net.IP(rdata).String())
			}
		}
		offset += rdlen
	}
	return out, nil
}

func skipDNSName(message []byte, offset int) (int, error) {
	for {
		if offset >= len(message) {
			return offset, errors.New("поврежденное DNS-имя")
		}
		length := int(message[offset])
		if length == 0 {
			return offset + 1, nil
		}
		if length&0xc0 == 0xc0 {
			if offset+1 >= len(message) {
				return offset, errors.New("поврежденный DNS-pointer")
			}
			return offset + 2, nil
		}
		if length&0xc0 != 0 {
			return offset, errors.New("неподдерживаемое DNS-имя")
		}
		offset += 1 + length
	}
}

func shellCommandLine(args []string) string {
	quoted := make([]string, 0, len(args))
	for _, arg := range args {
		if arg == "" || strings.ContainsAny(arg, " \t'\"") {
			quoted = append(quoted, "'"+strings.ReplaceAll(arg, "'", "'\"'\"'")+"'")
			continue
		}
		quoted = append(quoted, arg)
	}
	return strings.Join(quoted, " ")
}

func anySlice(value any) []any {
	if value == nil {
		return nil
	}
	if typed, ok := value.([]any); ok {
		return typed
	}
	return nil
}

func stringSlice(value any) []string {
	if value == nil {
		return nil
	}
	if typed, ok := value.([]string); ok {
		return typed
	}
	raw, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		out = append(out, fmt.Sprint(item))
	}
	return out
}
