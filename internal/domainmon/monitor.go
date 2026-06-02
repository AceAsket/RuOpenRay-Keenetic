package domainmon

import (
	"net"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
)

var (
	b4sniTimePattern      = regexp.MustCompile(`^\d{1,2}:\d{2}:\d{2}\.\d{3}$`)
	privateIPPattern      = regexp.MustCompile(`\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::(\d+))?\b`)
	sourceEndpointPattern = regexp.MustCompile(`(?i)\bfrom\s+(?:tcp|udp):((?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?)\b`)
	dnsmasqQueryPattern   = regexp.MustCompile(`(?i)\bquery\[[^\]]+\]\s+([^\s]+)\s+from\s+((?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}))\b`)
	targetPattern         = regexp.MustCompile(`(?i)\b(tcp|udp):([^:/\s,\[\]\(\)]+)(?::(\d+))?`)
	domainPattern         = regexp.MustCompile(`(?i)(?:sniffed domain[:\s]+|querying(?: DNS for)?[:\s]+|got answer[:\s]+|domain\s+)([a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?)\.?`)
	outboundPattern       = regexp.MustCompile(`\[([A-Za-z0-9_.:-]+)\](?:\s|$)`)
	private172Pattern     = regexp.MustCompile(`^172\.(1[6-9]|2\d|3[01])\.`)
	logLineTimePattern    = regexp.MustCompile(`\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?`)
)

type Event struct {
	Time            string `json:"time"`
	Timestamp       int64  `json:"timestamp"`
	Protocol        string `json:"protocol"`
	SourceIP        string `json:"sourceIp"`
	SourcePort      string `json:"sourcePort"`
	SourceDevice    string `json:"sourceDevice,omitempty"`
	DestinationIP   string `json:"destinationIp"`
	DestinationPort string `json:"destinationPort"`
	Host            string `json:"host"`
	Outbound        string `json:"outbound,omitempty"`
	Source          string `json:"source"`
	Raw             string `json:"raw"`
}

type Device struct {
	IP   string `json:"ip"`
	Name string `json:"name"`
	Hits int    `json:"hits"`
}

type Aggregate struct {
	Host       string   `json:"host"`
	Hits       int      `json:"hits"`
	TCP        int      `json:"tcp"`
	UDP        int      `json:"udp"`
	FirstSeen  string   `json:"firstSeen"`
	LastSeen   string   `json:"lastSeen"`
	LastSeenTs int64    `json:"lastSeenTs"`
	Protocols  []string `json:"protocols"`
	Outbounds  []string `json:"outbounds"`
	Devices    []Device `json:"devices"`
	Samples    []Event  `json:"samples"`

	deviceHits map[string]*Device
	protocols  map[string]bool
	outbounds  map[string]bool
	firstTs    int64
}

func TrimEvents(events []Event, limit int) []Event {
	if len(events) <= limit {
		return events
	}
	return events[len(events)-limit:]
}

func ParseB4SNILines(content string, devices map[string]string) []Event {
	var events []Event
	now := time.Now()
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, ",")
		if len(parts) < 5 || !b4sniTimePattern.MatchString(strings.TrimSpace(parts[0])) {
			continue
		}
		protocol := strings.ToUpper(strings.TrimSpace(parts[1]))
		if protocol != "TCP" && protocol != "UDP" {
			continue
		}
		sourceIP, sourcePort := splitHostPortLast(strings.TrimSpace(parts[2]))
		destIP, destPort := splitHostPortLast(strings.TrimSpace(parts[3]))
		host := normalizeHost(strings.Join(parts[4:], ","))
		if host == "" {
			continue
		}
		ts := parseB4SNITimestamp(strings.TrimSpace(parts[0]), now)
		events = append(events, Event{
			Time:            formatTime(ts, strings.TrimSpace(parts[0])),
			Timestamp:       ts.UnixNano(),
			Protocol:        protocol,
			SourceIP:        sourceIP,
			SourcePort:      sourcePort,
			SourceDevice:    devices[sourceIP],
			DestinationIP:   destIP,
			DestinationPort: destPort,
			Host:            host,
			Source:          "b4sni",
			Raw:             line,
		})
	}
	return events
}

func ParseXrayDomainLines(content string, devices map[string]string) []Event {
	var events []Event
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		sourceIP, sourcePort := "", ""
		if match := sourceEndpointPattern.FindStringSubmatch(line); len(match) > 1 {
			sourceIP, sourcePort = splitHostPortLast(match[1])
		} else if match := privateIPPattern.FindStringSubmatch(line); len(match) > 0 {
			sourceIP, sourcePort = splitHostPortLast(match[0])
		}
		outbound := ""
		for _, match := range outboundPattern.FindAllStringSubmatch(line, -1) {
			if len(match) <= 1 || isXrayLogLevel(match[1]) || isXrayConnectionID(match[1]) {
				continue
			}
			outbound = match[1]
		}
		timestamp := parseLogLineTime(line)
		if timestamp == 0 {
			timestamp = time.Now().UnixNano()
		}
		if match := domainPattern.FindStringSubmatch(line); len(match) > 1 {
			host := normalizeHost(match[1])
			if host != "" && net.ParseIP(host) == nil {
				events = append(events, Event{
					Time:         formatTime(time.Unix(0, timestamp), ""),
					Timestamp:    timestamp,
					Protocol:     "DNS",
					SourceIP:     sourceIP,
					SourcePort:   sourcePort,
					SourceDevice: devices[sourceIP],
					Host:         host,
					Outbound:     outbound,
					Source:       "xray-dns",
					Raw:          line,
				})
				continue
			}
		}
		matches := targetPattern.FindAllStringSubmatch(line, -1)
		if len(matches) == 0 {
			continue
		}
		var host, port, protocol string
		for i := len(matches) - 1; i >= 0; i-- {
			candidate := normalizeHost(matches[i][2])
			if candidate == "" || isPrivateIP(candidate) {
				continue
			}
			host = candidate
			port = strings.TrimSpace(matches[i][3])
			protocol = strings.ToUpper(matches[i][1])
			if strings.ContainsAny(candidate, ".-") {
				break
			}
		}
		if host == "" {
			continue
		}
		events = append(events, Event{
			Time:            formatTime(time.Unix(0, timestamp), ""),
			Timestamp:       timestamp,
			Protocol:        protocol,
			SourceIP:        sourceIP,
			SourcePort:      sourcePort,
			SourceDevice:    devices[sourceIP],
			DestinationIP:   ipHost(host),
			DestinationPort: port,
			Host:            host,
			Outbound:        outbound,
			Source:          "xray",
			Raw:             line,
		})
	}
	return events
}

func ParseDnsmasqLines(content string, devices map[string]string) []Event {
	var events []Event
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		match := dnsmasqQueryPattern.FindStringSubmatch(line)
		if len(match) != 3 {
			continue
		}
		host := normalizeHost(match[1])
		if host == "" || net.ParseIP(host) != nil || strings.HasSuffix(host, ".arpa") {
			continue
		}
		sourceIP := strings.TrimSpace(match[2])
		timestamp := parseLogLineTime(line)
		if timestamp == 0 {
			timestamp = time.Now().UnixNano()
		}
		events = append(events, Event{
			Time:         formatTime(time.Unix(0, timestamp), ""),
			Timestamp:    timestamp,
			Protocol:     "DNS",
			SourceIP:     sourceIP,
			SourceDevice: devices[sourceIP],
			Host:         host,
			Source:       "dnsmasq",
			Raw:          line,
		})
	}
	return events
}

func AggregateDomainEvents(events []Event) []Aggregate {
	byHost := map[string]*Aggregate{}
	for i := len(events) - 1; i >= 0; i-- {
		event := events[i]
		if event.Host == "" {
			continue
		}
		item := byHost[event.Host]
		if item == nil {
			item = &Aggregate{
				Host:       event.Host,
				FirstSeen:  event.Time,
				LastSeen:   event.Time,
				LastSeenTs: event.Timestamp,
				firstTs:    event.Timestamp,
				deviceHits: map[string]*Device{},
				protocols:  map[string]bool{},
				outbounds:  map[string]bool{},
			}
			byHost[event.Host] = item
		}
		item.Hits++
		if event.Protocol == "TCP" {
			item.TCP++
		}
		if event.Protocol == "UDP" {
			item.UDP++
		}
		if event.Protocol != "" {
			item.protocols[event.Protocol] = true
		}
		if event.Outbound != "" {
			item.outbounds[event.Outbound] = true
		}
		if event.Timestamp >= item.LastSeenTs {
			item.LastSeenTs = event.Timestamp
			item.LastSeen = event.Time
		}
		if item.firstTs == 0 || event.Timestamp <= item.firstTs {
			item.firstTs = event.Timestamp
			item.FirstSeen = event.Time
		}
		deviceKey := firstNonEmpty(event.SourceIP, "router")
		device := item.deviceHits[deviceKey]
		if device == nil {
			device = &Device{IP: event.SourceIP, Name: firstNonEmpty(event.SourceDevice, event.SourceIP, "router")}
			item.deviceHits[deviceKey] = device
		}
		device.Hits++
		if len(item.Samples) < 3 {
			item.Samples = append(item.Samples, event)
		}
	}
	out := make([]Aggregate, 0, len(byHost))
	for _, item := range byHost {
		item.Protocols = sortedKeys(item.protocols)
		item.Outbounds = sortedKeys(item.outbounds)
		for _, device := range item.deviceHits {
			item.Devices = append(item.Devices, *device)
		}
		sort.SliceStable(item.Devices, func(i, j int) bool { return item.Devices[i].Hits > item.Devices[j].Hits })
		item.deviceHits = nil
		item.protocols = nil
		item.outbounds = nil
		out = append(out, *item)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Hits == out[j].Hits {
			return out[i].LastSeenTs > out[j].LastSeenTs
		}
		return out[i].Hits > out[j].Hits
	})
	if len(out) > 160 {
		out = out[:160]
	}
	return out
}

func AggregateDevices(events []Event) []map[string]any {
	return AggregateDevicesWithKnown(events, nil)
}

func AggregateDevicesWithKnown(events []Event, known []Device) []map[string]any {
	type deviceAgg struct {
		ip        string
		name      string
		hits      int
		domains   map[string]int
		protocols map[string]bool
	}
	byDevice := map[string]*deviceAgg{}
	for _, device := range known {
		key := firstNonEmpty(device.IP, "router")
		if byDevice[key] != nil {
			continue
		}
		byDevice[key] = &deviceAgg{ip: device.IP, name: firstNonEmpty(device.Name, device.IP, "router"), domains: map[string]int{}, protocols: map[string]bool{}}
	}
	for _, event := range events {
		key := firstNonEmpty(event.SourceIP, "router")
		item := byDevice[key]
		if item == nil {
			item = &deviceAgg{ip: event.SourceIP, name: firstNonEmpty(event.SourceDevice, event.SourceIP, "router"), domains: map[string]int{}, protocols: map[string]bool{}}
			byDevice[key] = item
		} else if item.name == "" || item.name == item.ip {
			item.name = firstNonEmpty(event.SourceDevice, item.name, item.ip, "router")
		}
		item.hits++
		if event.Host != "" {
			item.domains[event.Host]++
		}
		if event.Protocol != "" {
			item.protocols[event.Protocol] = true
		}
	}
	out := []map[string]any{}
	for _, item := range byDevice {
		top := make([]map[string]any, 0, len(item.domains))
		for host, hits := range item.domains {
			top = append(top, map[string]any{"host": host, "hits": hits})
		}
		sort.SliceStable(top, func(i, j int) bool { return top[i]["hits"].(int) > top[j]["hits"].(int) })
		if len(top) > 5 {
			top = top[:5]
		}
		out = append(out, map[string]any{"ip": item.ip, "name": item.name, "hits": item.hits, "protocols": sortedKeys(item.protocols), "topDomains": top})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i]["hits"].(int) > out[j]["hits"].(int) })
	return out
}

func Stats(events []Event, domains []Aggregate) map[string]any {
	tcp, udp := 0, 0
	for _, event := range events {
		if event.Protocol == "TCP" {
			tcp++
		}
		if event.Protocol == "UDP" {
			udp++
		}
	}
	topDomain := ""
	topHits := 0
	if len(domains) > 0 {
		topDomain = domains[0].Host
		topHits = domains[0].Hits
	}
	return map[string]any{"total": len(events), "tcp": tcp, "udp": udp, "uniqueDomains": len(domains), "topDomain": topDomain, "topHits": topHits}
}

func parseB4SNITimestamp(value string, now time.Time) time.Time {
	parsed, err := time.ParseInLocation("15:04:05.000", value, time.Local)
	if err != nil {
		return now
	}
	ts := time.Date(now.Year(), now.Month(), now.Day(), parsed.Hour(), parsed.Minute(), parsed.Second(), parsed.Nanosecond(), time.Local)
	if ts.After(now.Add(1 * time.Hour)) {
		ts = ts.Add(-24 * time.Hour)
	}
	return ts
}

func parseLogLineTime(line string) int64 {
	if match := logLineTimePattern.FindString(line); match != "" {
		for _, layout := range []string{"2006/01/02 15:04:05.999999", "2006/01/02 15:04:05"} {
			if ts, err := time.ParseInLocation(layout, match, time.Local); err == nil {
				return ts.UnixNano()
			}
		}
	}
	if len(line) >= 24 {
		if ts, err := time.ParseInLocation("Mon Jan _2 15:04:05 2006", line[:24], time.Local); err == nil {
			return ts.UnixNano()
		}
	}
	return 0
}

func isXrayLogLevel(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "debug", "info", "warning", "error":
		return true
	default:
		return false
	}
}

func isXrayConnectionID(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	for _, char := range value {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}

func splitHostPortLast(value string) (string, string) {
	value = strings.TrimSpace(strings.Trim(value, "[]"))
	if value == "" {
		return "", ""
	}
	index := strings.LastIndex(value, ":")
	if index <= 0 || index == len(value)-1 {
		return value, ""
	}
	return strings.Trim(value[:index], "[]"), value[index+1:]
}

func normalizeHost(value string) string {
	value = strings.TrimSpace(strings.Trim(value, "[]()\"'"))
	value = strings.TrimRight(value, ".,;")
	if value == "" || value == "127.0.0.1" || value == "::1" || strings.EqualFold(value, "localhost") {
		return ""
	}
	if strings.Contains(value, "://") {
		if parsed, err := url.Parse(value); err == nil {
			value = parsed.Hostname()
		}
	}
	if strings.Contains(value, ":") {
		host, _ := splitHostPortLast(value)
		value = host
	}
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" || strings.ContainsAny(value, "/\\") {
		return ""
	}
	return value
}

func isPrivateIP(value string) bool {
	return strings.HasPrefix(value, "10.") || strings.HasPrefix(value, "192.168.") || private172Pattern.MatchString(value)
}

func ipHost(value string) string {
	if net.ParseIP(value) != nil {
		return value
	}
	return ""
}

func formatTime(ts time.Time, fallback string) string {
	if !ts.IsZero() {
		return ts.Format("15:04:05")
	}
	if fallback != "" {
		return strings.Split(fallback, ".")[0]
	}
	return ""
}

func sortedKeys(values map[string]bool) []string {
	out := make([]string, 0, len(values))
	for key := range values {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
