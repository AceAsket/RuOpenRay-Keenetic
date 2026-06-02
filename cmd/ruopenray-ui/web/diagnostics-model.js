export function createDiagnosticsModel({
  state,
  routeRules,
  describeRouteRule,
  isIpLiteral,
}) {
  function domainDiagnosticRows() {
    return routeRules()
      .map((rule, index) => ({ rule, index, info: describeRouteRule(rule) }))
      .filter(({ info }) => info.kind === 'domain')
      .slice(0, 18);
  }
  
  function isPrivateIp(value = '') {
    return /^10\./.test(value) || /^192\.168\./.test(value) || /^172\.(1[6-9]|2\d|3[01])\./.test(value);
  }
  
  function cleanLogHost(value = '') {
    const host = String(value)
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .replace(/[),;]+$/, '')
      .trim();
    if (!host || host === '127.0.0.1' || host === '::1') return '';
    if (/^\d+$/.test(host)) return '';
    return host;
  }
  
  function logEvents() {
    const lines = String(state.logs || '').split('\n').filter(Boolean);
    return lines.map((line) => {
      const privateIp = line.match(/\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/);
      const targets = [...line.matchAll(/\b(?:tcp|udp):([^/\s,[\]()]+)(?::\d+)?/gi)]
        .map((match) => cleanLogHost(match[1]))
        .filter((host) => host && !isPrivateIp(host));
      const domain = targets.reverse().find((host) => /[a-zа-яё-]/i.test(host) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) || '';
      const ipTarget = targets.find((host) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) || '';
      const protocol = line.match(/\b(udp|tcp):/i)?.[1]?.toLowerCase() || '';
      const outboundMatches = [...line.matchAll(/\[(proxy|direct|block|[A-Za-z0-9_.:-]+)\](?:\s|$)/g)]
        .map((match) => match[1])
        .filter((value) => value && !/^\d+$/.test(value) && !/^(debug|info|warning|error)$/i.test(value));
      const outbound = outboundMatches.at(-1) || '';
      return { line, deviceIp: privateIp?.[0] || '', domain, ipTarget, protocol, outbound };
    }).filter((event) => event.deviceIp || event.domain || event.ipTarget);
  }
  
  function aggregateLogDevices() {
    const map = new Map();
    for (const event of logEvents()) {
      const key = event.deviceIp || 'router';
      const item = map.get(key) || { ip: key, hits: 0, domains: new Map(), protocols: new Set() };
      item.hits += 1;
      if (event.domain) item.domains.set(event.domain, (item.domains.get(event.domain) || 0) + 1);
      if (event.protocol) item.protocols.add(event.protocol);
      map.set(key, item);
    }
    return [...map.values()]
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 18)
      .map((item) => ({
        ...item,
        topDomains: [...item.domains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      }));
  }
  
  function aggregateLogDomains() {
    const map = new Map();
    for (const event of logEvents()) {
      const key = event.domain || event.ipTarget;
      if (!key) continue;
      const item = map.get(key) || { host: key, hits: 0, devices: new Set(), protocols: new Set(), outbound: new Set() };
      item.hits += 1;
      if (event.deviceIp) item.devices.add(event.deviceIp);
      if (event.protocol) item.protocols.add(event.protocol);
      if (event.outbound) item.outbound.add(event.outbound);
      map.set(key, item);
    }
    return [...map.values()].sort((a, b) => b.hits - a.hits).slice(0, 32);
  }
  
  function domainMonitorProtocols(item = {}) {
    const values = [];
    if (item.protocol) values.push(item.protocol);
    if (Array.isArray(item.protocols)) values.push(...item.protocols);
    if (item.tcp) values.push('TCP');
    if (item.udp) values.push('UDP');
    if (Array.isArray(item.samples)) values.push(...item.samples.map((sample) => sample.protocol));
    return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
  }
  
  function domainMonitorDevicesText(item = {}) {
    const devices = Array.isArray(item.devices) ? item.devices : [];
    if (!devices.length) return item.sourceDevice || item.sourceIp || 'router';
    return devices
      .slice(0, 3)
      .map((device) => `${device.name || device.ip || 'router'}${device.hits ? ` (${device.hits})` : ''}`)
      .join(', ');
  }
  
  function domainMonitorHost(item = {}) {
    return item.host || item.domain || item.destinationIp || '';
  }

  function currentDomainMonitor() {
    if (state.domainMonitorPaused && state.domainMonitorPausedSnapshot) return state.domainMonitorPausedSnapshot;
    return state.domainMonitor || null;
  }
  
  function domainMonitorMatchesFilter(item = {}, filter = state.domainMonitorFilter) {
    const host = domainMonitorHost(item);
    const protocols = domainMonitorProtocols(item).map((value) => value.toLowerCase());
    if (filter === 'domains') return Boolean(host && !isIpLiteral(host));
    if (filter === 'ip') return Boolean(host && isIpLiteral(host));
    if (filter === 'dns') return protocols.includes('dns') || String(item.source || '').toLowerCase().includes('dns');
    if (filter === 'tcp') return protocols.includes('tcp');
    if (filter === 'udp') return protocols.includes('udp');
    return true;
  }
  
  function domainMonitorMatchesQuery(item = {}, query = state.domainMonitorQuery.trim().toLowerCase()) {
    if (!query) return true;
    return [
      domainMonitorHost(item),
      domainMonitorDevicesText(item),
      item.sourceIp,
      item.sourceDevice,
      item.destinationIp,
      ...(domainMonitorProtocols(item)),
      ...(Array.isArray(item.outbounds) ? item.outbounds : []),
      item.outbound,
      item.source,
      item.raw
    ].join(' ').toLowerCase().includes(query);
  }

  function selectedDomainMonitorDevice() {
    const ip = String(state.domainMonitorDeviceFilter || '').trim();
    if (!ip) return null;
    const monitor = currentDomainMonitor();
    const devices = Array.isArray(monitor?.devices) ? monitor.devices : [];
    const found = devices.find((item) => (item?.ip || 'router') === ip);
    return {
      ip,
      name: found?.name || ip,
      hits: Number(found?.hits || 0)
    };
  }

  function domainMonitorMatchesDevice(item = {}, ip = state.domainMonitorDeviceFilter) {
    const selected = String(ip || '').trim();
    if (!selected) return true;
    if (selected === 'router') {
      if (!item.sourceIp || item.sourceIp === 'router') return true;
      if (Array.isArray(item.devices) && item.devices.some((device) => !device?.ip || device?.ip === 'router')) return true;
      if (Array.isArray(item.samples) && item.samples.some((sample) => !sample?.sourceIp || sample?.sourceIp === 'router')) return true;
      return false;
    }
    if (item.ip === selected) return true;
    if (item.sourceIp === selected) return true;
    if (item.destinationIp === selected) return true;
    if (Array.isArray(item.devices) && item.devices.some((device) => device?.ip === selected)) return true;
    if (Array.isArray(item.samples) && item.samples.some((sample) => sample?.sourceIp === selected)) return true;
    return false;
  }
  
  function domainMonitorRows() {
    const monitor = currentDomainMonitor();
    return Array.isArray(monitor?.domains) ? [...monitor.domains] : [];
  }
  
  function domainMonitorFilterCounts() {
    const rows = domainMonitorRows();
    const count = (filter) => rows.filter((item) => domainMonitorMatchesDevice(item) && domainMonitorMatchesFilter(item, filter)).length;
    return {
      all: rows.filter((item) => domainMonitorMatchesDevice(item)).length,
      domains: count('domains'),
      ip: count('ip'),
      dns: count('dns'),
      tcp: count('tcp'),
      udp: count('udp')
    };
  }
  
  function monitoredDomains() {
    const rows = domainMonitorRows();
    const query = state.domainMonitorQuery.trim().toLowerCase();
    const filtered = rows.filter((item) => domainMonitorMatchesDevice(item) && domainMonitorMatchesFilter(item) && domainMonitorMatchesQuery(item, query));
    if (state.domainMonitorSort === 'last') return filtered.sort((a, b) => (b.lastSeenTs || 0) - (a.lastSeenTs || 0));
    if (state.domainMonitorSort === 'name') return filtered.sort((a, b) => String(a.host).localeCompare(String(b.host)));
    return filtered.sort((a, b) => (b.hits || 0) - (a.hits || 0));
  }
  
  function monitoredDevices() {
    const monitor = currentDomainMonitor();
    const rows = Array.isArray(monitor?.devices) ? [...monitor.devices] : [];
    const query = state.domainMonitorQuery.trim().toLowerCase();
    const filtered = query
      ? rows.filter((item) => `${item.name} ${item.ip} ${(item.topDomains || []).map((domain) => domain.host).join(' ')}`.toLowerCase().includes(query))
      : rows;
    const selected = String(state.domainMonitorDeviceFilter || '').trim();
    return filtered
      .filter((item) => !selected || (item.ip || 'router') === selected)
      .sort((a, b) => (b.hits || 0) - (a.hits || 0));
  }
  
  function monitoredEvents() {
    const monitor = currentDomainMonitor();
    const rows = Array.isArray(monitor?.events) ? [...monitor.events] : [];
    const query = state.domainMonitorQuery.trim().toLowerCase();
    const filtered = rows.filter((item) => domainMonitorMatchesDevice(item) && domainMonitorMatchesFilter(item) && domainMonitorMatchesQuery(item, query));
    return filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }
  
  function monitorSourceLabel() {
    const monitor = currentDomainMonitor();
    if (!monitor) return 'нет данных';
    return 'Xray access';
  }
  
  function domainMonitorDomainQuality() {
    const monitor = currentDomainMonitor();
    const events = Array.isArray(monitor?.events) ? monitor.events : [];
    const domains = events.filter((item) => item?.host && !isIpLiteral(item.host));
    const ips = events.filter((item) => item?.host && isIpLiteral(item.host));
    return {
      total: events.length,
      domains: domains.length,
      ips: ips.length,
      hasDomains: domains.length > 0,
      domainShare: events.length ? Math.round((domains.length / events.length) * 100) : 0
    };
  }

  return {
    domainDiagnosticRows,
    isPrivateIp,
    cleanLogHost,
    logEvents,
    aggregateLogDevices,
    aggregateLogDomains,
    domainMonitorProtocols,
    domainMonitorDevicesText,
    domainMonitorHost,
    currentDomainMonitor,
    domainMonitorMatchesFilter,
    domainMonitorMatchesQuery,
    domainMonitorMatchesDevice,
    domainMonitorRows,
    domainMonitorFilterCounts,
    monitoredDomains,
    monitoredDevices,
    monitoredEvents,
    monitorSourceLabel,
    selectedDomainMonitorDevice,
    domainMonitorDomainQuality,
  };
}
