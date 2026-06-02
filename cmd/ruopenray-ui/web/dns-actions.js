export function createDnsActions({
  state,
  request,
  render,
  syncConfig,
  syncLanDnsStatus,
  activeProxyTag,
  splitRouteValues,
  dnsConfig,
  normalizeDnsAddressInput,
  ensureDnsBootstrapHosts
}) {
  function cloneConfig() {
    return JSON.parse(JSON.stringify(state.config || {}));
  }

  function ensureDnsList(config) {
    config.dns = config.dns && typeof config.dns === 'object' ? config.dns : {};
    config.dns.servers = Array.isArray(config.dns.servers) ? config.dns.servers : [];
    return config.dns.servers;
  }

  function dnsServerAddress(server) {
    if (typeof server === 'string') return server;
    if (server && typeof server === 'object') return server.address || '';
    return '';
  }

  function isDohServer(server) {
    return String(dnsServerAddress(server)).toLowerCase().startsWith('https://');
  }

  function dnsAddressWithAuth(address) {
    const raw = String(address || '').trim();
    if (!state.dnsAuthEnabled) return raw;
    const user = String(state.dnsAuthUser || '').trim();
    const password = String(state.dnsAuthPassword || '');
    if (!user && !password) return raw;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:') return raw;
      url.username = user;
      url.password = password;
      return url.toString();
    } catch {
      return raw;
    }
  }

  function dnsServerToObject(server) {
    if (server && typeof server === 'object' && !Array.isArray(server)) return { ...server };
    return { address: dnsServerAddress(server) };
  }

  function dnsPolicyDomainsFor(index) {
    const servers = dnsConfig().servers || [];
    const server = servers[index];
    return Array.isArray(server?.domains) ? server.domains : [];
  }

  function prioritizeDohServers(config) {
    const servers = ensureDnsList(config);
    config.dns.servers = [
      ...servers.filter((server) => isDohServer(server)),
      ...servers.filter((server) => !isDohServer(server))
    ];
  }

  function addDnsServer() {
    const address = dnsAddressWithAuth(state.dnsAddress);
    if (!address) {
      state.message = 'Укажите DNS-сервер, например https://dns.google:443/dns-query';
      render();
      return;
    }
    if (state.dnsAuthEnabled && !String(address).toLowerCase().startsWith('https://')) {
      state.message = 'DNS-авторизация поддержана только для DoH URL https://...';
      render();
      return;
    }
    const domains = splitRouteValues(state.dnsDomains);
    const normalized = normalizeDnsAddressInput(address);
    const server = typeof normalized.config === 'object'
      ? { ...normalized.config, ...(domains.length ? { domains } : {}) }
      : domains.length
        ? { address: normalized.config, domains }
        : normalized.config;
    const next = cloneConfig();
    const servers = ensureDnsList(next);
    servers.push(server);
    if (isDohServer(server)) prioritizeDohServers(next);
    syncConfig(next);
    state.dnsDomains = '';
    state.message = isDohServer(server)
      ? 'DNS-сервер добавлен. DoH поднят выше обычных DNS в черновике.'
      : 'DNS-сервер добавлен в черновик';
    render();
  }

  function dnsHostValueFromInput(value) {
    const values = splitRouteValues(value);
    if (!values.length) return '';
    return values.length === 1 ? values[0] : values;
  }

  function dnsHostValueToInput(value) {
    if (Array.isArray(value)) return value.join(', ');
    return String(value || '');
  }

  function saveDnsHost() {
    const host = String(state.dnsHostName || '').trim();
    const value = dnsHostValueFromInput(state.dnsHostValue);
    if (!host || !value || (Array.isArray(value) && !value.length)) {
      state.message = 'Укажите домен и значение host-подмены';
      render();
      return;
    }
    const next = cloneConfig();
    next.dns = next.dns && typeof next.dns === 'object' ? next.dns : {};
    next.dns.hosts = next.dns.hosts && typeof next.dns.hosts === 'object' && !Array.isArray(next.dns.hosts) ? next.dns.hosts : {};
    next.dns.hosts[host] = value;
    syncConfig(next);
    state.dnsHostName = '';
    state.dnsHostValue = '';
    state.message = 'Host-подмена сохранена в черновик';
    render();
  }

  function editDnsHost(host) {
    const hosts = dnsConfig().hosts || {};
    state.dnsHostName = host;
    state.dnsHostValue = dnsHostValueToInput(hosts[host]);
    state.message = '';
    render();
  }

  function removeDnsHost(host) {
    const next = cloneConfig();
    next.dns = next.dns && typeof next.dns === 'object' ? next.dns : {};
    next.dns.hosts = next.dns.hosts && typeof next.dns.hosts === 'object' && !Array.isArray(next.dns.hosts) ? next.dns.hosts : {};
    delete next.dns.hosts[host];
    syncConfig(next);
    if (state.dnsHostName === host) {
      state.dnsHostName = '';
      state.dnsHostValue = '';
    }
    state.message = 'Host-подмена удалена из черновика';
    render();
  }

  function ensureDnsServer(next, server) {
    const servers = ensureDnsList(next);
    const target = typeof server === 'string' ? server : server.address;
    const exists = servers.some((item) => {
      const address = typeof item === 'string' ? item : item?.address;
      return address === target;
    });
    if (!exists) servers.push(server);
  }

  function applyDnsGuardPreset(mode) {
    const next = cloneConfig();
    if (mode === 'secure') {
      ensureDnsServer(next, 'https://dns.google:443/dns-query');
      ensureDnsServer(next, 'https://dns.adguard-dns.com/dns-query');
    }
    if (mode === 'ru') {
      ensureDnsServer(next, 'https://common.dot.dns.yandex.net/dns-query');
      ensureDnsServer(next, 'https://dns.adguard-dns.com/dns-query');
    }
    if (mode === 'strict') {
      ensureDnsServer(next, 'https://dns.google:443/dns-query');
      ensureDnsServer(next, 'https://dns.adguard-dns.com/dns-query');
      const rules = Array.isArray(next.routing?.rules) ? next.routing.rules : [];
      const hasUdp443 = rules.some((rule) => String(rule.network || '').includes('udp') && String(rule.port || '') === '443');
      next.routing = next.routing && typeof next.routing === 'object' ? next.routing : {};
      next.routing.rules = hasUdp443
        ? rules
        : [{ type: 'field', network: 'udp', port: '443', outboundTag: activeProxyTag() || 'proxy' }, ...rules];
    }
    prioritizeDohServers(next);
    syncConfig(next);
    state.message = mode === 'strict'
      ? 'Защита DNS добавила DoH и правило UDP/443 в черновик'
      : 'Защита DNS добавила защищенные DNS-серверы в черновик';
    render();
  }

  function removeDnsServer(index) {
    const next = cloneConfig();
    next.dns = next.dns && typeof next.dns === 'object' ? next.dns : {};
    next.dns.servers = Array.isArray(next.dns.servers) ? next.dns.servers.filter((_, itemIndex) => itemIndex !== index) : [];
    syncConfig(next);
    state.message = 'DNS-сервер удален из черновика';
    render();
  }

  function moveDnsServer(index, direction) {
    const next = cloneConfig();
    const servers = ensureDnsList(next);
    const targetIndex = index + direction;
    if (index < 0 || index >= servers.length || targetIndex < 0 || targetIndex >= servers.length) return;
    const [server] = servers.splice(index, 1);
    servers.splice(targetIndex, 0, server);
    syncConfig(next);
    state.message = 'Порядок DNS-серверов изменен в черновике';
    render();
  }

  function prioritizeDohDnsServers() {
    const next = cloneConfig();
    const before = JSON.stringify(ensureDnsList(next));
    prioritizeDohServers(next);
    syncConfig(next);
    state.message = before === JSON.stringify(next.dns.servers)
      ? 'DoH уже стоит выше обычных DNS'
      : 'DoH-серверы подняты выше обычных DNS в черновике';
    render();
  }

  function editDnsPolicy(index) {
    const servers = dnsConfig().servers || [];
    const safeIndex = Math.max(0, Math.min(Number(index) || 0, Math.max(servers.length - 1, 0)));
    state.dnsPolicyServerIndex = safeIndex;
    state.dnsPolicyDomains = dnsPolicyDomainsFor(safeIndex).join('\n');
    state.dnsView = 'policies';
    render();
  }

  function saveDnsPolicy() {
    const next = cloneConfig();
    const servers = ensureDnsList(next);
    const index = Math.max(0, Math.min(Number(state.dnsPolicyServerIndex) || 0, servers.length - 1));
    if (!servers.length || index < 0 || index >= servers.length) {
      state.message = 'Добавьте DNS-сервер, затем задайте для него домены.';
      render();
      return;
    }
    const rawDomains = state.dnsPolicyDomains === null || typeof state.dnsPolicyDomains === 'undefined'
      ? dnsPolicyDomainsFor(index).join('\n')
      : state.dnsPolicyDomains;
    const domains = splitRouteValues(rawDomains || '');
    const server = dnsServerToObject(servers[index]);
    if (domains.length) server.domains = domains;
    else delete server.domains;
    servers[index] = server;
    syncConfig(next);
    state.dnsPolicyDomains = domains.join('\n');
    state.message = domains.length
      ? 'DNS-политика сохранена в черновик'
      : 'DNS-политика очищена в черновике';
    render();
  }

  function clearDnsPolicy() {
    state.dnsPolicyDomains = '';
    saveDnsPolicy();
  }

  async function checkDnsServer() {
    const normalized = normalizeDnsAddressInput(dnsAddressWithAuth(state.dnsAddress));
    const result = await request('/api/dns/check', {
      method: 'POST',
      body: JSON.stringify({ server: normalized.check || dnsAddressWithAuth(state.dnsAddress), host: state.dnsCheckHost })
    });
    state.dnsCheckResult = result;
    state.message = result.ok ? 'DNS проверен' : 'DNS не ответил';
    render();
  }

  async function checkDnsDiagnostics() {
    const result = await request('/api/dns/diagnostics');
    state.dnsDiagnostics = result;
    state.message = result.ok ? 'DNS роутера проверен' : (result.summary || 'DNS роутера требует внимания');
    render();
  }

  async function applyLanDnsUpstream() {
    state.lanDnsSaving = true;
    render();
    try {
      const result = await request('/api/dns/lan-upstream', {
        method: 'POST',
        body: JSON.stringify({
          mode: state.lanDnsMode,
          upstream: state.lanDnsUpstream,
          restart: state.lanDnsRestart
        })
      });
      syncLanDnsStatus(result);
      state.message = result.ok ? 'LAN DNS настроен, dnsmasq обновлен' : (result.error || 'Не удалось настроить LAN DNS');
    } finally {
      state.lanDnsSaving = false;
      render();
    }
  }

  function applyDnsBootstrapHosts() {
    const next = cloneConfig();
    ensureDnsBootstrapHosts(next);
    syncConfig(next);
    state.message = 'Bootstrap hosts для DoH добавлены в черновик. Проверьте и примените конфигурацию.';
    render();
  }

  async function previewLanDnsUpstream() {
    state.lanDnsSaving = true;
    state.lanDnsPreview = null;
    render();
    try {
      const result = await request('/api/dns/lan-upstream', {
        method: 'POST',
        body: JSON.stringify({
          mode: state.lanDnsMode,
          upstream: state.lanDnsUpstream,
          restart: state.lanDnsRestart,
          dryRun: true
        })
      });
      syncLanDnsStatus(result);
      state.message = result.ok ? 'План LAN DNS готов: проверьте команды перед применением' : (result.error || 'Не удалось подготовить план LAN DNS');
    } finally {
      state.lanDnsSaving = false;
      render();
    }
  }


  return {
    addDnsServer,
    saveDnsHost,
    editDnsHost,
    removeDnsHost,
    applyDnsGuardPreset,
    removeDnsServer,
    moveDnsServer,
    prioritizeDohDnsServers,
    editDnsPolicy,
    saveDnsPolicy,
    clearDnsPolicy,
    checkDnsServer,
    checkDnsDiagnostics,
    applyLanDnsUpstream,
    applyDnsBootstrapHosts,
    previewLanDnsUpstream,
    dnsHostValueFromInput,
    dnsHostValueToInput,
    ensureDnsServer
  };
}
