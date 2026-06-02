export function createSetupModel({
  state,
  byteSize,
  firewallInfo,
  firewallReadyStatus,
  proxyOutbounds,
  request,
  syncConfig,
  ensureDnsServer
}) {
  function setupReadiness() {
    const status = state.status || {};
    const geo = state.geoStatus || {};
    const firewall = state.firewallStatus || {};
    const lanDns = state.lanDnsStatus || {};
    const transparent = firewallInfo();
    const dnsReadiness = lanDns.readiness || {};
    const proxyCount = proxyOutbounds().length;
    const firewallMatchesSelection = typeof firewallReadyStatus === 'function'
      ? firewallReadyStatus(firewall)
      : Boolean(firewall.active && firewall.persistent && !firewall.needsPolicyFix);
    const items = [
      {
        key: 'core',
        ok: Boolean(status.core?.available),
        title: 'Xray установлен',
        detail: status.core?.available ? String(status.core.version || '').split('\n')[0] : 'Нужен пакет xray-core и зависимости TPROXY.'
      },
      {
        key: 'geo',
        ok: Boolean(geo.geoip?.exists && geo.geosite?.exists),
        warn: Boolean(geo.geoip?.exists || geo.geosite?.exists),
        title: 'Geo-файлы готовы',
        detail: geo.geoip?.exists && geo.geosite?.exists
          ? `${byteSize(geo.geoip.size)} geoip.dat · ${byteSize(geo.geosite.size)} geosite.dat`
          : 'Для правил geoip/geosite нужны geoip.dat и geosite.dat.'
      },
      {
        key: 'servers',
        ok: proxyCount > 0,
        title: 'Прокси-сервер добавлен',
        detail: proxyCount ? `${proxyCount} прокси-направлений в конфигурации` : 'Добавьте VLESS/Vmess/Trojan/SS-сервер или подписку.'
      },
      {
        key: 'transparent',
        ok: Boolean(transparent.ready),
        warn: Boolean(transparent.transparent.length),
        title: 'Входящий поток перехвата',
        detail: transparent.ready
          ? `Порт ${transparent.transparentPort}, DNS-выход и локальные исключения найдены`
          : 'Мастер подготовит входящий поток transparent_ipv4, DNS-выход и базовые исключения.'
      },
      {
        key: 'firewall',
        ok: firewallMatchesSelection,
        warn: Boolean(firewall.active),
        title: 'Защита nftables',
        detail: firewall.active && !firewallMatchesSelection
          ? 'nftables активен, но примененная схема отличается от выбранной сейчас.'
          : firewall.active
          ? `${firewall.routerMode || state.firewallRouterMode} · ${firewall.persistent ? 'сохранен' : 'только до перезапуска'}`
          : 'Нужно применить nftables и правила маршрутизации RuOpenRay.'
      },
      {
        key: 'dns',
        ok: Boolean(dnsReadiness.ready && lanDns.mode === 'xray'),
        warn: Boolean(dnsReadiness.inbound || lanDns.mode === 'upstream'),
        title: 'LAN DNS',
        detail: lanDns.mode === 'xray'
          ? 'dnsmasq направлен на Xray DNS.'
          : lanDns.mode === 'upstream'
            ? `dnsmasq направлен на внешний DNS: ${(lanDns.servers || []).join(', ') || state.lanDnsUpstream || 'не задан'}`
            : 'Можно оставить OpenWrt DNS как есть или направить dnsmasq на Xray.'
      }
    ];
    const required = items.filter((item) => ['core', 'geo', 'servers', 'transparent', 'firewall'].includes(item.key));
    return {
      items,
      ready: required.every((item) => item.ok),
      canApply: Boolean(status.core?.available && proxyCount > 0)
    };
  }

  function loadSetupSnapshot() {
    if (state.setupSnapshot) return state.setupSnapshot;
    return null;
  }

  function saveSetupSnapshot(snapshot) {
    state.setupSnapshot = snapshot;
  }

  function clearSetupSnapshot() {
    state.setupSnapshot = null;
    state.setupRollbackResult = null;
  }

  async function captureSetupSnapshot() {
    const [config, firewall, lanDns] = await Promise.all([
      request('/api/config'),
      request('/api/firewall/snapshot').catch(async () => ({ status: await request('/api/firewall/status').catch(() => null) })),
      request('/api/dns/lan-upstream').catch(() => null)
    ]);
    const snapshot = {
      createdAt: new Date().toISOString(),
      config,
      firewall,
      lanDns
    };
    saveSetupSnapshot(snapshot);
    return snapshot;
  }

  function lanDnsRestorePayload(lanDns) {
    const mode = lanDns?.mode || 'system';
    if (mode === 'xray') return { mode: 'xray', restart: true };
    if (mode === 'upstream') return { mode: 'upstream', upstream: (lanDns.servers || [])[0] || '', restart: true };
    return { mode: 'system', restart: true };
  }

  function privateBypassCidrs() {
    return ['10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16', '224.0.0.0/3', '::1/128', 'fc00::/7', 'fe80::/10'];
  }

  function isPrivateBypassRule(rule, ips, domains, sources, inbound) {
    const allowed = new Set(privateBypassCidrs());
    allowed.add('geoip:private');
    return rule?.outboundTag === 'direct' &&
      inbound.includes('transparent_ipv4') &&
      ips.length > 0 &&
      !domains.length &&
      !sources.length &&
      !rule?.port &&
      !rule?.balancerTag &&
      ips.every((item) => allowed.has(String(item || '').trim().toLowerCase()));
  }

  function setupRuleSignature(rule) {
    const normalize = (value) => {
      if (Array.isArray(value)) return value.map(normalize).sort();
      if (!value || typeof value !== 'object') return value;
      return Object.keys(value).sort().reduce((acc, key) => {
        acc[key] = normalize(value[key]);
        return acc;
      }, {});
    };
    return JSON.stringify(normalize(rule));
  }

  function isIpLiteral(value) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(value || '') || /^\[[0-9a-f:]+\]$/i.test(value || '') || /^[0-9a-f:]+$/i.test(value || '');
  }

  function hostnameFromUrl(value) {
    try {
      return new URL(value).hostname;
    } catch {
      return '';
    }
  }

  function serverBootstrapDomains(config) {
    const domains = new Set();
    const outbounds = Array.isArray(config?.outbounds) ? config.outbounds : [];
    for (const outbound of outbounds) {
      const host = outbound?.settings?.vnext?.[0]?.address || outbound?.settings?.servers?.[0]?.address || outbound?.settings?.address || '';
      if (host && !isIpLiteral(host)) domains.add(`domain:${host}`);
    }
    const dnsServers = Array.isArray(config?.dns?.servers) ? config.dns.servers : [];
    for (const server of dnsServers) {
      const value = typeof server === 'string' ? server : server?.address;
      if (!value) continue;
      const host = value.includes('://') ? hostnameFromUrl(value) : String(value).split(':')[0];
      if (host && !isIpLiteral(host)) domains.add(`domain:${host}`);
    }
    return [...domains];
  }

  function ensureDnsBootstrapHosts(config) {
    config.dns = config.dns && typeof config.dns === 'object' ? config.dns : {};
    config.dns.hosts = config.dns.hosts && typeof config.dns.hosts === 'object' && !Array.isArray(config.dns.hosts) ? config.dns.hosts : {};
    if (!config.dns.hosts['dns.google']) config.dns.hosts['dns.google'] = ['8.8.8.8', '8.8.4.4'];
    if (!config.dns.hosts['dns.adguard-dns.com']) config.dns.hosts['dns.adguard-dns.com'] = ['94.140.14.14', '94.140.15.15'];
  }

  function isSetupManagedRule(rule, bootstrapDomains = []) {
    const inbound = Array.isArray(rule?.inboundTag) ? rule.inboundTag : [];
    const ips = Array.isArray(rule?.ip) ? rule.ip : [];
    const domains = Array.isArray(rule?.domain) ? rule.domain : [];
    const sources = Array.isArray(rule?.source) ? rule.source : [];
    const transparentCatchAll = inbound.includes('transparent_ipv4') &&
      !ips.length &&
      !domains.length &&
      !sources.length &&
      !rule?.network &&
      !rule?.port;
    if (transparentCatchAll) return true;
    if (isPrivateBypassRule(rule, ips, domains, sources, inbound)) return true;
    if (rule?.outboundTag === 'dns-out' && inbound.includes('ruopenray_dns_in')) return true;
    if (rule?.outboundTag === 'dns-out' && String(rule?.port || '') === '53') return true;
    if (rule?.outboundTag === 'direct' && domains.length && domains.every((item) => bootstrapDomains.includes(item))) return true;
    return false;
  }

  function normalizeSetupRules(config) {
    ensureDnsBootstrapHosts(config);
    config.routing = config.routing && typeof config.routing === 'object' ? config.routing : {};
    const rules = Array.isArray(config.routing.rules) ? config.routing.rules : [];
    const bootstrapDomains = serverBootstrapDomains(config);
    const managedRules = [
      { type: 'field', outboundTag: 'direct', inboundTag: ['transparent_ipv4'], ip: privateBypassCidrs() },
      ...(bootstrapDomains.length ? [{ type: 'field', outboundTag: 'direct', domain: bootstrapDomains }] : []),
      { type: 'field', inboundTag: ['ruopenray_dns_in'], outboundTag: 'dns-out' },
      { type: 'field', outboundTag: 'dns-out', port: '53' }
    ];
    const seen = new Set();
    const keptRules = [];
    for (const rule of rules) {
      if (isSetupManagedRule(rule, bootstrapDomains)) continue;
      const signature = setupRuleSignature(rule);
      if (seen.has(signature)) continue;
      seen.add(signature);
      keptRules.push(rule);
    }
    config.routing.rules = [...managedRules, ...keptRules];
  }

  function prepareSetupDraft({ message = true } = {}) {
    const next = JSON.parse(JSON.stringify(state.config || {}));
    next.inbounds = Array.isArray(next.inbounds) ? next.inbounds : [];
    next.outbounds = Array.isArray(next.outbounds) ? next.outbounds : [];
    next.routing = next.routing && typeof next.routing === 'object' ? next.routing : {};
    next.routing.rules = Array.isArray(next.routing.rules) ? next.routing.rules : [];
    next.dns = next.dns && typeof next.dns === 'object' ? next.dns : {};
    next.dns.servers = Array.isArray(next.dns.servers) && next.dns.servers.length ? next.dns.servers : [];
  
    const redirectMode = state.firewallRouterMode === 'redirect';
    const sockoptMode = redirectMode ? 'redirect' : 'tproxy';
    const transparentNetwork = redirectMode ? 'tcp' : 'tcp,udp';
    const transparentInbound = next.inbounds.find((item) => item?.tag === 'transparent_ipv4' || item?.streamSettings?.sockopt?.tproxy);
    if (!transparentInbound) {
      next.inbounds.push({
        tag: 'transparent_ipv4',
        port: 52345,
        listen: '0.0.0.0',
        protocol: 'dokodemo-door',
        sniffing: { enabled: true, destOverride: ['http', 'tls'], routeOnly: true },
        settings: { network: transparentNetwork, followRedirect: true },
        streamSettings: { sockopt: { tproxy: sockoptMode } }
      });
    } else {
      transparentInbound.settings = transparentInbound.settings && typeof transparentInbound.settings === 'object' ? transparentInbound.settings : {};
      transparentInbound.settings.network = transparentNetwork;
      transparentInbound.settings.followRedirect = true;
      transparentInbound.streamSettings = transparentInbound.streamSettings && typeof transparentInbound.streamSettings === 'object' ? transparentInbound.streamSettings : {};
      transparentInbound.streamSettings.sockopt = transparentInbound.streamSettings.sockopt && typeof transparentInbound.streamSettings.sockopt === 'object' ? transparentInbound.streamSettings.sockopt : {};
      transparentInbound.streamSettings.sockopt.tproxy = sockoptMode;
    }
  
    if (!next.outbounds.some((item) => item?.tag === 'dns-out')) {
      next.outbounds.push({ tag: 'dns-out', protocol: 'dns', settings: { address: '8.8.8.8', port: 53, network: 'udp' } });
    }
    const manualPort = Number(state.dnsInboundPort);
    const suggestedPort = Number(state.lanDnsStatus?.suggestedXrayPort || 10535) || 10535;
    const dnsPort = manualPort > 0 && manualPort < 65536 ? manualPort : suggestedPort;
    state.dnsInboundPort = String(dnsPort);
    const dnsInbound = next.inbounds.find((item) => item?.tag === 'ruopenray_dns_in');
    if (!dnsInbound) {
      next.inbounds.push({
        tag: 'ruopenray_dns_in',
        listen: '127.0.0.1',
        port: dnsPort,
        protocol: 'dokodemo-door',
        settings: { address: '8.8.8.8', port: 53, network: 'tcp,udp' }
      });
    } else if (Number(dnsInbound.port) !== dnsPort) {
      dnsInbound.port = dnsPort;
    }
    ensureDnsServer(next, 'https://dns.google:443/dns-query');
    ensureDnsServer(next, 'https://dns.adguard-dns.com/dns-query');
  
    normalizeSetupRules(next);
  
    syncConfig(next);
    if (message) state.message = 'Черновик активного режима подготовлен: входящий поток перехвата, DNS-вход Xray, DNS-выход и базовые правила добавлены.';
  }

  return {
    setupReadiness,
    loadSetupSnapshot,
    saveSetupSnapshot,
    clearSetupSnapshot,
    captureSetupSnapshot,
    lanDnsRestorePayload,
    privateBypassCidrs,
    setupRuleSignature,
    isIpLiteral,
    hostnameFromUrl,
    serverBootstrapDomains,
    ensureDnsBootstrapHosts,
    isSetupManagedRule,
    normalizeSetupRules,
    prepareSetupDraft
  };
}
