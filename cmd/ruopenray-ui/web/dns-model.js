export function createDnsModel({ state }) {
  function dnsConfig() {
    if (!state.config.dns || typeof state.config.dns !== 'object') state.config.dns = {};
    if (!Array.isArray(state.config.dns.servers)) state.config.dns.servers = [];
    if (!state.config.dns.hosts || typeof state.config.dns.hosts !== 'object' || Array.isArray(state.config.dns.hosts)) state.config.dns.hosts = {};
    return state.config.dns;
  }

  function describeDnsServer(server) {
    if (typeof server === 'string') {
      return { address: maskDnsAddress(server), domains: [], port: '', network: '', raw: server };
    }
    if (server && typeof server === 'object') {
      const address = [server.address, server.port].filter(Boolean).join(':') || 'DNS';
      return {
        address: maskDnsAddress(address),
        domains: Array.isArray(server.domains) ? server.domains : [],
        port: server.port || '',
        network: server.network || '',
        raw: JSON.stringify(server)
      };
    }
    return { address: 'DNS', domains: [], port: '', network: '', raw: '' };
  }

  function maskDnsAddress(value) {
    const text = String(value || '');
    if (!/^https:\/\//i.test(text)) return text;
    try {
      const url = new URL(text);
      if (!url.username && !url.password) return text;
      const user = url.username ? decodeURIComponent(url.username) : 'auth';
      url.username = user;
      url.password = '***';
      return url.toString();
    } catch {
      return text.replace(/^(https:\/\/)([^/@:\s]+)(?::[^/@\s]*)?@/i, '$1$2:***@');
    }
  }

  function dnsAddressHasPort(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    if (text.startsWith('[')) return /\]:\d+$/.test(text);
    const colonCount = (text.match(/:/g) || []).length;
    return colonCount === 1 && /:\d+$/.test(text);
  }

  function normalizeDnsAddressInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return { raw: '', config: '', check: '' };
    const lower = raw.toLowerCase();
    if (lower.startsWith('https://')) return { raw, config: raw, check: raw };
    if (lower.startsWith('tcp://') || lower.startsWith('udp://')) {
      const scheme = lower.startsWith('tcp://') ? 'tcp://' : 'udp://';
      const target = raw.slice(scheme.length);
      const normalized = dnsAddressHasPort(target) || target.includes(']')
        ? raw
        : `${scheme}${target}:53`;
      return { raw, config: normalized, check: normalized };
    }
    if (dnsAddressHasPort(raw)) return { raw, config: raw, check: raw };
    return {
      raw,
      config: { address: raw, port: 53 },
      check: `${raw}:53`
    };
  }

  function dnsStats() {
    const dns = dnsConfig();
    const doh = dns.servers.filter((server) => describeDnsServer(server).address.startsWith('https://')).length;
    const tcp = dns.servers.filter((server) => describeDnsServer(server).address.startsWith('tcp://') || describeDnsServer(server).network === 'tcp').length;
    return {
      servers: dns.servers.length,
      hosts: Object.keys(dns.hosts).length,
      doh,
      tcp
    };
  }

  function dnsAnswerText(result = {}) {
    if (result.error && !(result.addresses || []).length) return 'ошибка проверки';
    const a = Array.isArray(result.a) ? result.a : [];
    const aaaa = Array.isArray(result.aaaa) ? result.aaaa : [];
    if (a.length || aaaa.length) {
      return [
        a.length ? `A: ${a.join(', ')}` : '',
        aaaa.length ? `AAAA: ${aaaa.join(', ')}` : ''
      ].filter(Boolean).join(' · ');
    }
    const addresses = result.addresses || [];
    return addresses.length ? addresses.join(', ') : 'A/AAAA-записи не найдены';
  }

  function ensureDnsServer(config, server) {
    config.dns = config.dns || {};
    config.dns.servers = Array.isArray(config.dns.servers) ? config.dns.servers : [];
    const exists = config.dns.servers.some((item) => JSON.stringify(item) === JSON.stringify(server));
    if (!exists) config.dns.servers.push(server);
  }

  return {
    dnsConfig,
    describeDnsServer,
    maskDnsAddress,
    dnsAddressHasPort,
    normalizeDnsAddressInput,
    dnsStats,
    dnsAnswerText,
    ensureDnsServer
  };
}
