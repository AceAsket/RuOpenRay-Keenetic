const localBypassValues = new Set([
  'geoip:private',
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '224.0.0.0/3',
  '::1/128',
  'fc00::/7',
  'fe80::/10'
]);

export function createFirewallModel({ state, configInbounds, configOutbounds, routeRules, splitRouteValues, deviceRules, routeRuleName, describeRouteRule }) {
  function firewallInfo() {
    const transparent = configInbounds().filter((item) => {
      const tag = String(item?.tag || '');
      const tproxy = String(item?.streamSettings?.sockopt?.tproxy || '');
      const followRedirect = item?.settings?.followRedirect === true;
      return tag.includes('transparent') || followRedirect || tproxy === 'tproxy' || tproxy === 'redirect';
    });
    const dnsIn = configInbounds().filter((item) => item?.tag === 'ruopenray_dns_in');
    const dnsOut = configOutbounds().filter((item) => item?.protocol === 'dns' || String(item?.tag || '').includes('dns'));
    const localBypass = routeRules().filter((rule) => isLocalBypassRule(rule));
    const sourceRules = routeRules().filter((rule) => Array.isArray(rule.source) && rule.source.length);
    const transparentPort = transparent.find((item) => item?.streamSettings?.sockopt?.tproxy)?.port || transparent[0]?.port || 52345;

    return {
      transparent,
      dnsIn,
      dnsOut,
      localBypass,
      sourceRules,
      transparentPort,
      ready: Boolean(transparent.length && dnsOut.length && localBypass.length)
    };
  }

  function isLocalBypassRule(rule) {
    const ips = Array.isArray(rule?.ip) ? rule.ip : [];
    const inbound = Array.isArray(rule?.inboundTag) ? rule.inboundTag : [];
    const hasUserTargets = Boolean(
      (Array.isArray(rule?.domain) && rule.domain.length) ||
      (Array.isArray(rule?.source) && rule.source.length) ||
      rule?.port ||
      rule?.balancerTag
    );
    return rule?.outboundTag === 'direct' &&
      ips.length > 0 &&
      !hasUserTargets &&
      (!inbound.length || inbound.includes('transparent_ipv4')) &&
      ips.every((item) => localBypassValues.has(String(item || '').trim().toLowerCase()));
  }

  function firewallPorts() {
    if (state.firewallPortMode === 'all') return [];
    return splitRouteValues(state.firewallPorts)
      .map((item) => item.replace(':', '-'))
      .filter((item) => /^\d+(-\d+)?$/.test(item));
  }

  function firewallKillSwitchTargets() {
    const values = splitRouteValues(state.firewallKillSwitchTargets);
    const ips = [];
    const domains = [];
    const geoip = [];
    const geosite = [];
    const ext = [];
    const invalid = [];
    for (const value of values) {
      const clean = String(value || '').trim();
      if (!clean) continue;
      const domain = clean.replace(/^\*\./, '');
      if (/^geoip:[a-z0-9_-]+$/i.test(clean)) {
        geoip.push(clean.replace(/^geoip:/i, '').toLowerCase());
      } else if (/^geosite:[a-z0-9_-]+$/i.test(clean)) {
        geosite.push(clean.replace(/^geosite:/i, '').toLowerCase());
      } else if (/^ext:/i.test(clean)) {
        ext.push(clean);
      } else if (/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(clean)) {
        ips.push(clean);
      } else if (/^[a-z0-9_.-]+(\.[a-z0-9_-]+)+$/i.test(domain)) {
        domains.push(domain);
      } else {
        invalid.push(clean);
      }
    }
    return {
      ips: [...new Set(ips)],
      domains: [...new Set(domains)],
      geoip: [...new Set(geoip)],
      geosite: [...new Set(geosite)],
      ext: [...new Set(ext)],
      invalid
    };
  }

  function firewallRouteSets() {
    const directIps = [];
    const proxyIps = [];
    const directDomains = [];
    const proxyDomains = [];
    const directGeoip = [];
    const proxyGeoip = [];
    const directGeosite = [];
    const proxyGeosite = [];
    const directExt = [];
    const proxyExt = [];
    let directDomainCount = 0;
    let proxyDomainCount = 0;
    let directDynamicIpCount = 0;
    let proxyDynamicIpCount = 0;
    let directUnsupportedDomainCount = 0;
    let proxyUnsupportedDomainCount = 0;
    const proxyTags = new Set(['proxy']);
    for (const outbound of configOutbounds()) {
      const tag = outbound?.tag || '';
      const system = ['direct', 'block', 'dns-out', 'ruopenray-api'].includes(tag) ||
        ['freedom', 'blackhole', 'dns'].includes(outbound?.protocol);
      if (tag && !system) proxyTags.add(tag);
    }
    const isProxyRule = (rule) => Boolean(rule?.balancerTag || proxyTags.has(rule?.outboundTag || ''));
    const isDirectRule = (rule) => rule?.outboundTag === 'direct';
    const isConcreteIp = (value) => /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(String(value || '').trim());
    const addTarget = (target, bucket, value) => {
      if (target === 'direct') bucket.direct.push(value);
      else bucket.proxy.push(value);
    };
    const domainTarget = (value) => {
      const clean = String(value || '').trim();
      const lower = clean.toLowerCase();
      if (!clean) return { kind: 'empty' };
      if (lower.startsWith('geosite:')) return { kind: 'geosite', value: lower.replace(/^geosite:/, '') };
      if (lower.startsWith('ext:')) return { kind: 'ext', value: clean };
      for (const prefix of ['domain:', 'full:']) {
        if (lower.startsWith(prefix)) {
          const domain = clean.slice(prefix.length).replace(/^\*\./, '').replace(/\.$/, '').toLowerCase();
          return /^[a-z0-9_.-]+(\.[a-z0-9_-]+)+$/.test(domain) ? { kind: 'domain', value: domain } : { kind: 'unsupported' };
        }
      }
      const plain = clean.replace(/^\*\./, '').replace(/\.$/, '').toLowerCase();
      if (/^[a-z0-9_.-]+(\.[a-z0-9_-]+)+$/.test(plain)) return { kind: 'domain', value: plain };
      return { kind: 'unsupported' };
    };
    for (const rule of routeRules()) {
      const target = isDirectRule(rule) ? 'direct' : isProxyRule(rule) ? 'proxy' : '';
      if (!target) continue;
      const domains = Array.isArray(rule.domain) ? rule.domain.filter(Boolean) : [];
      if (target === 'direct') directDomainCount += domains.length;
      if (target === 'proxy') proxyDomainCount += domains.length;
      for (const value of domains) {
        const parsed = domainTarget(value);
        if (parsed.kind === 'domain') addTarget(target, { direct: directDomains, proxy: proxyDomains }, parsed.value);
        else if (parsed.kind === 'geosite') addTarget(target, { direct: directGeosite, proxy: proxyGeosite }, parsed.value);
        else if (parsed.kind === 'ext') addTarget(target, { direct: directExt, proxy: proxyExt }, parsed.value);
        else if (parsed.kind === 'unsupported') {
          if (target === 'direct') directUnsupportedDomainCount += 1;
          else proxyUnsupportedDomainCount += 1;
        }
      }
      for (const value of Array.isArray(rule.ip) ? rule.ip : []) {
        const clean = String(value || '').trim();
        if (!clean) continue;
        if (isConcreteIp(clean)) {
          if (target === 'direct') directIps.push(clean);
          else proxyIps.push(clean);
        } else if (/^geoip:/i.test(clean)) {
          const code = clean.replace(/^geoip:/i, '').toLowerCase();
          if (target === 'direct') directGeoip.push(code);
          else proxyGeoip.push(code);
        } else {
          if (target === 'direct') directDynamicIpCount += 1;
          else proxyDynamicIpCount += 1;
        }
      }
    }
    const unique = (items) => [...new Set(items)];
    return {
      directIps: unique(directIps),
      proxyIps: unique(proxyIps),
      directDomains: unique(directDomains),
      proxyDomains: unique(proxyDomains),
      directGeoip: unique(directGeoip),
      proxyGeoip: unique(proxyGeoip),
      directGeosite: unique(directGeosite),
      proxyGeosite: unique(proxyGeosite),
      directExt: unique(directExt),
      proxyExt: unique(proxyExt),
      directDomainCount,
      proxyDomainCount,
      directDynamicIpCount,
      proxyDynamicIpCount,
      directUnsupportedDomainCount,
      proxyUnsupportedDomainCount
    };
  }

  function firewallDeviceChoices() {
    const map = new Map();
    for (const lease of state.leases || []) {
      if (!lease?.ip) continue;
      map.set(lease.ip, { ip: lease.ip, name: lease.name || lease.hostname || lease.mac || lease.ip, mac: lease.mac || '' });
    }
    for (const { rule } of deviceRules()) {
      for (const ip of rule.source || []) {
        if (!map.has(ip)) map.set(ip, { ip, name: routeRuleName(rule, describeRouteRule(rule)), mac: '' });
      }
    }
    return [...map.values()];
  }

  function firewallSelectedDevices() {
    const selected = new Set(state.firewallSelectedDevices);
    return firewallDeviceChoices().filter((device) => selected.has(device.ip));
  }

  function firewallSelectedDeviceIps() {
    return [...new Set((state.firewallSelectedDevices || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean))];
  }

  function firewallKillSwitchSelectedDeviceIps() {
    return [...new Set((state.firewallKillSwitchSelectedDevices || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean))];
  }

  function nftList(items) {
    return `{ ${items.join(', ')} }`;
  }

  function firewallDeviceExpression() {
    const selected = firewallSelectedDeviceIps();
    if (state.firewallDeviceMode === 'selected' && selected.length) return `ip saddr ${nftList(selected)} `;
    if (state.firewallDeviceMode === 'exclude' && selected.length) return `ip saddr ${nftList(selected)} return\n`;
    return '';
  }

  function firewallKillSwitchDeviceExpression() {
    const selected = firewallKillSwitchSelectedDeviceIps();
    const mode = state.firewallKillSwitchDeviceMode || 'all';
    if (mode === 'selected' && selected.length) return `ip saddr ${nftList(selected)} `;
    if (mode === 'exclude' && selected.length) return `ip saddr != ${nftList(selected)} `;
    return '';
  }

  function firewallPortExpression() {
    if (state.firewallPortMode === 'all') return '';
    const ports = firewallPorts();
    return ports.length ? ` th dport ${nftList(ports)}` : '';
  }

  function firewallTargetRule(port) {
    const portExpr = firewallPortExpression();
    const deviceExpr = state.firewallDeviceMode === 'selected' ? firewallDeviceExpression() : '';
    const lanExpr = 'iifname "br-lan" ';
    if (state.firewallRouterMode === 'redirect') {
      return `nft add rule inet ruopenray prerouting ${lanExpr}${deviceExpr}meta l4proto tcp${portExpr} redirect to :${port}`;
    }
    return `nft add rule inet ruopenray prerouting ${lanExpr}${deviceExpr}meta l4proto { tcp, udp }${portExpr} counter tproxy ip to 127.0.0.1:${port} meta mark set 1`;
  }

  function firewallPolicyPreview() {
    const info = firewallInfo();
    const routeSets = firewallRouteSets();
    const selectedDeviceIps = firewallSelectedDeviceIps();
    const killSwitchDeviceIps = firewallKillSwitchSelectedDeviceIps();
    const ports = firewallPorts();
    const guard = firewallKillSwitchTargets();
    const traffic = state.firewallDeviceMode === 'selected'
      ? `только выбранные устройства (${selectedDeviceIps.length})`
      : state.firewallDeviceMode === 'exclude'
        ? `все LAN, кроме выбранных устройств (${selectedDeviceIps.length})`
        : 'все LAN-устройства';
    const router = state.firewallRouterMode === 'redirect'
      ? 'REDIRECT: проще, только TCP, QUIC лучше блокировать'
      : 'TPROXY: TCP+UDP, сохраняет исходное назначение';
    const policyName = state.firewallBypassMode === 'off'
      ? 'Все через правила Xray'
      : state.firewallBypassMode === 'bypass'
        ? 'Direct мимо Xray'
        : 'Только proxy в Xray';
    const policy = state.firewallBypassMode === 'off'
      ? 'RuOpenRay передает выбранный трафик в Xray, а direct/proxy/block решают правила маршрутизации.'
      : state.firewallBypassMode === 'bypass'
        ? 'Адреса из direct-списка сразу идут напрямую, остальное передается в Xray.'
        : 'В Xray отправляются только адреса из proxy-списка, остальное сразу идет напрямую.';
    const warnings = [];
    if (!info.transparent.length) warnings.push('Нет transparent inbound: firewall будет отправлять LAN-трафик в Xray, но Xray не слушает порт перехвата. Нажмите «Подготовить черновик».');
    if (info.dnsIn.length && !info.transparent.length) warnings.push('DNS inbound найден, но он обрабатывает только DNS. Для сайтов и приложений LAN-клиентов нужен transparent inbound.');
    if (!info.dnsOut.length) warnings.push('Не найден dns-out: перехват DNS не сможет отправлять запросы через Xray DNS.');
    if (!info.localBypass.length) warnings.push('Не найден local bypass: приватные адреса LAN лучше явно оставить напрямую.');
    const directResolvable = routeSets.directDomains.length + routeSets.directGeosite.length + routeSets.directExt.length;
    const proxyResolvable = routeSets.proxyDomains.length + routeSets.proxyGeosite.length + routeSets.proxyExt.length;
    if (state.firewallBypassMode === 'bypass' && (directResolvable || routeSets.directGeoip.length)) {
      warnings.push(`Direct мимо добавит ${routeSets.directIps.length} IP/подсетей и ${routeSets.directGeoip.length} geoip-целей в nftables, а ${directResolvable} доменных/geo-целей в dnsmasq/nftset. Домены сработают после DNS-запроса клиента через роутер.`);
    }
    if (state.firewallBypassMode === 'bypass' && (routeSets.directDynamicIpCount || routeSets.directUnsupportedDomainCount)) {
      warnings.push(`В direct-правилах есть цели, которые firewall не сможет развернуть автоматически: ${routeSets.directDynamicIpCount + routeSets.directUnsupportedDomainCount}. Они останутся на уровне Xray routing.`);
    }
    if (state.firewallBypassMode === 'redirect' && !routeSets.proxyIps.length && !proxyResolvable && !routeSets.proxyGeoip.length) {
      warnings.push('Только proxy пока не видит целей для перехвата. Добавьте proxy-правила с IP/подсетями, доменами, geoip/geosite или ext-списками.');
    } else if (state.firewallBypassMode === 'redirect' && (proxyResolvable || routeSets.proxyGeoip.length)) {
      warnings.push(`Только proxy добавит ${routeSets.proxyIps.length} IP/подсетей и ${routeSets.proxyGeoip.length} geoip-целей в nftables, а ${proxyResolvable} доменных/geo-целей в dnsmasq/nftset. Остальное будет идти напрямую.`);
    }
    if (state.firewallBypassMode === 'redirect' && (routeSets.proxyDynamicIpCount || routeSets.proxyUnsupportedDomainCount)) {
      warnings.push(`В proxy-правилах есть цели, которые firewall не сможет развернуть автоматически: ${routeSets.proxyDynamicIpCount + routeSets.proxyUnsupportedDomainCount}.`);
    }
    if (state.firewallRouterMode === 'redirect' && !state.firewallBlockQuic) warnings.push('REDIRECT не обрабатывает UDP/QUIC надежно. Лучше включить блокировку QUIC или выбрать TPROXY.');
    if (state.firewallDeviceMode !== 'all' && !selectedDeviceIps.length) warnings.push('Выбран режим по устройствам, но устройства не отмечены.');
    if (state.firewallKillSwitchEnabled && state.firewallKillSwitchDeviceMode !== 'all' && !killSwitchDeviceIps.length) warnings.push('В защите от утечек выбран режим по устройствам, но устройства не отмечены.');
    if (state.firewallPortMode !== 'all' && !ports.length) warnings.push('Выбран режим портов, но порты не заданы.');
    if (!state.firewallDnsIntercept) warnings.push('Перехват DNS выключен: клиенты смогут отправлять UDP/TCP 53 напрямую наружу, если не используют DNS роутера.');
    const geoGuardCount = guard.geoip.length + guard.geosite.length + guard.ext.length;
    if (state.firewallKillSwitchEnabled && !guard.ips.length && !guard.domains.length && !geoGuardCount) warnings.push('Защита от прямого выхода включена, но цели не указаны.');
    if (state.firewallKillSwitchEnabled && geoGuardCount) warnings.push(`Geo-цели защиты (${geoGuardCount}) будут проверены через Geo Doctor. RuOpenRay попробует развернуть доступные geoip/geosite/ext категории перед применением firewall; если категории нет в dat, защита по ней не создастся.`);
    if (state.firewallKillSwitchEnabled && guard.domains.length && state.firewallKillSwitchDomainMode === 'dns-block') warnings.push('Домены будут точно блокироваться через DNS для всех LAN-клиентов, которые используют DNS роутера.');
    if (state.firewallKillSwitchEnabled && guard.domains.length && state.firewallKillSwitchDomainMode === 'nftset') warnings.push('Домены будут защищены через dnsmasq/nftset после применения firewall. Этот режим можно ограничить выбранными LAN-клиентами, но он работает по IP после DNS-резолва.');
    if (state.firewallKillSwitchEnabled && guard.domains.length && state.firewallKillSwitchDomainMode === 'dns-block' && state.firewallKillSwitchDeviceMode !== 'all') warnings.push('Точная DNS-блокировка применяется ко всем LAN-клиентам. Чтобы ограничить домены выбранными клиентами, используйте режим nftset.');
    if (state.firewallKillSwitchEnabled && guard.invalid.length) warnings.push(`Некоторые цели защиты не распознаны: ${guard.invalid.slice(0, 3).join(', ')}`);
    return {
      router,
      traffic,
      policyName,
      policy,
      ports: state.firewallPortMode === 'all' ? 'все порты' : ports.join(', ') || 'не заданы',
      quic: state.firewallBlockQuic ? 'UDP/443 будет заблокирован до Xray' : 'UDP/443 не блокируется',
      dns: state.firewallDnsIntercept ? 'DNS/53 перехватывается отдельно' : 'DNS/53 не перехватывается firewall',
      warnings,
      guard,
      routeSets
    };
  }

  function firewallCommands() {
    const info = firewallInfo();
    const routeSets = firewallRouteSets();
    const port = info.transparentPort || 52345;
    const excludedDeviceReturn = state.firewallDeviceMode === 'exclude' ? firewallDeviceExpression().trim() : '';
    const packageCommand = state.firewallRouterMode === 'tproxy'
      ? 'if command -v apk >/dev/null 2>&1; then apk update && apk add kmod-nf-tproxy kmod-nft-tproxy kmod-nft-socket; else opkg update && opkg install kmod-nf-tproxy kmod-nft-tproxy kmod-nft-socket; fi'
      : '# REDIRECT-режиму kmod-nft-tproxy не нужен';
    const scopedDeviceExpr = state.firewallDeviceMode === 'selected' ? firewallDeviceExpression() : '';
    const selectedModeEmpty = state.firewallDeviceMode === 'selected' && !firewallSelectedDeviceIps().length;
    const killSwitchDeviceExpr = state.firewallKillSwitchDeviceMode !== 'all' ? firewallKillSwitchDeviceExpression() : '';
    const killSwitchSelectedModeEmpty = state.firewallKillSwitchDeviceMode === 'selected' && !firewallKillSwitchSelectedDeviceIps().length;
    const blockQuicRule = !selectedModeEmpty && state.firewallBlockQuic ? `nft add rule inet ruopenray prerouting iifname "br-lan" ${scopedDeviceExpr}udp dport 443 drop # Block QUIC/HTTP3` : '';
    const dnsInterceptRules = [];
    if (!selectedModeEmpty && state.firewallDnsIntercept && state.firewallPortMode !== 'all' && !firewallPorts().some((item) => {
      const [start, end = start] = String(item).split('-').map((part) => Number(part.trim()));
      return Number.isFinite(start) && Number.isFinite(end) && start <= 53 && 53 <= end;
    })) {
      if (state.firewallRouterMode === 'redirect') {
        dnsInterceptRules.push(`nft add rule inet ruopenray prerouting iifname "br-lan" ${scopedDeviceExpr}meta l4proto tcp tcp dport 53 redirect to :${port} comment "RuOpenRay DNS Intercept"`);
        dnsInterceptRules.push(`nft add rule inet ruopenray prerouting iifname "br-lan" ${scopedDeviceExpr}meta l4proto udp udp dport 53 drop comment "RuOpenRay DNS UDP guard"`);
      } else {
        dnsInterceptRules.push(`nft add rule inet ruopenray prerouting iifname "br-lan" ${scopedDeviceExpr}meta l4proto { tcp, udp } th dport 53 counter tproxy ip to 127.0.0.1:${port} meta mark set 1 comment "RuOpenRay DNS Intercept"`);
      }
    }
    const guard = firewallKillSwitchTargets();
    const killSwitchRules = [];
    const domainSetMode = state.firewallKillSwitchDomainMode === 'nftset';
    const geoGuardCount = guard.geoip.length + guard.geosite.length + guard.ext.length;
    const selectedNoopRule = '# Режим "Только выбранные" без клиентов: правила перехвата не создаются.';
    if (!killSwitchSelectedModeEmpty && state.firewallKillSwitchEnabled && (guard.ips.length || geoGuardCount || (domainSetMode && guard.domains.length))) {
      if (geoGuardCount) {
        killSwitchRules.push(`# Geo-цели будут развернуты сервером перед применением: ${[
          ...guard.geoip.map((item) => `geoip:${item}`),
          ...guard.geosite.map((item) => `geosite:${item}`),
          ...guard.ext
        ].join(', ')}`);
      }
      killSwitchRules.push(guard.ips.length
        ? `nft add set inet ruopenray killswitch4 { type ipv4_addr \\; flags interval \\; elements = { ${guard.ips.join(', ')} } \\; }`
        : 'nft add set inet ruopenray killswitch4 { type ipv4_addr \\; flags interval \\; }');
      if (domainSetMode && guard.domains.length) {
        killSwitchRules.push('# Домены добавляются в dnsmasq nftset: /domain/4#inet#ruopenray#killswitch4');
      }
      if (state.firewallRouterMode === 'redirect') {
        killSwitchRules.push(`nft add rule inet ruopenray prerouting iifname "br-lan" ${killSwitchDeviceExpr}ip daddr @killswitch4 meta l4proto tcp redirect to :${port} comment "RuOpenRay Kill Switch"`);
        killSwitchRules.push(`nft add rule inet ruopenray prerouting iifname "br-lan" ${killSwitchDeviceExpr}ip daddr @killswitch4 meta l4proto udp drop comment "RuOpenRay Kill Switch UDP guard"`);
      } else {
        killSwitchRules.push(`nft add rule inet ruopenray prerouting iifname "br-lan" ${killSwitchDeviceExpr}ip daddr @killswitch4 meta l4proto { tcp, udp } counter tproxy ip to 127.0.0.1:${port} meta mark set 1 comment "RuOpenRay Kill Switch"`);
      }
    }
    const common = [
      '# Черновик для OpenWrt firewall4/nftables. Проверьте LAN-интерфейс и порт перед применением.',
      packageCommand,
      'nft delete table inet ruopenray 2>/dev/null || true',
      state.firewallRouterMode === 'tproxy' ? 'ip rule del fwmark 1/1 table 100 2>/dev/null || true' : '',
      state.firewallRouterMode === 'tproxy' ? 'ip rule del fwmark 1 table 100 2>/dev/null || true' : '',
      state.firewallRouterMode === 'tproxy' ? 'ip route flush table 100 2>/dev/null || true' : '',
      'nft add table inet ruopenray',
      state.firewallRouterMode === 'tproxy'
        ? 'nft add chain inet ruopenray prerouting { type filter hook prerouting priority mangle - 5 \\; policy accept \\; }'
        : 'nft add chain inet ruopenray prerouting { type nat hook prerouting priority dstnat \\; policy accept \\; }',
      state.firewallRouterMode === 'tproxy' ? 'nft add chain inet ruopenray output { type route hook output priority mangle \\; policy accept \\; }' : '',
      'nft add rule inet ruopenray prerouting iifname != "br-lan" return',
      excludedDeviceReturn ? `nft add rule inet ruopenray prerouting ${excludedDeviceReturn}` : '',
      ...killSwitchRules,
      selectedModeEmpty ? 'nft add rule inet ruopenray prerouting return comment "RuOpenRay selected device list is empty"' : '',
      'nft add rule inet ruopenray prerouting ip daddr { 10.0.0.0/8, 127.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 } return',
      ...dnsInterceptRules,
      blockQuicRule,
      state.firewallRouterMode === 'tproxy' ? 'ip rule add fwmark 1/1 table 100' : '',
      state.firewallRouterMode === 'tproxy' ? 'ip route add local 0.0.0.0/0 dev lo table 100' : '',
      ''
    ].filter(Boolean);
    if (state.firewallBypassMode === 'bypass') {
      const bypassItems = [...new Set(['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16', '224.0.0.0/3', ...routeSets.directIps])];
      return [
        ...common,
        '# BYPASS: direct-сети возвращаются до Xray, остальное уходит в transparent inbound.',
        'nft add set inet ruopenray bypass4 { type ipv4_addr \\; flags interval \\; }',
        `nft add element inet ruopenray bypass4 ${nftList(bypassItems)}`,
        'nft add rule inet ruopenray prerouting ip daddr @bypass4 return',
        routeSets.directDomains.length || routeSets.directGeosite.length || routeSets.directExt.length
          ? `# direct-домены будут добавлены в dnsmasq nftset bypass4: ${routeSets.directDomains.length + routeSets.directGeosite.length + routeSets.directExt.length}`
          : '# direct-доменов для dnsmasq/nftset нет',
        selectedModeEmpty ? selectedNoopRule : firewallTargetRule(port)
      ].join('\n');
    }
    if (state.firewallBypassMode === 'redirect') {
      return [
        ...common,
        '# REDIRECT: в Xray идут только адреса из proxy4. Direct-трафик не заходит в Xray.',
        'nft add set inet ruopenray proxy4 { type ipv4_addr \\; flags interval \\; }',
        routeSets.proxyIps.length ? `nft add element inet ruopenray proxy4 ${nftList(routeSets.proxyIps)}` : '# proxy4 is empty: no concrete proxy IP/CIDR rules',
        routeSets.proxyDomains.length || routeSets.proxyGeosite.length || routeSets.proxyExt.length
          ? `# proxy-домены будут добавлены в dnsmasq nftset proxy4: ${routeSets.proxyDomains.length + routeSets.proxyGeosite.length + routeSets.proxyExt.length}`
          : '# proxy-доменов для dnsmasq/nftset нет',
        selectedModeEmpty ? selectedNoopRule : state.firewallRouterMode === 'redirect'
          ? `nft add rule inet ruopenray prerouting iifname "br-lan" ip daddr @proxy4 ${state.firewallDeviceMode === 'selected' ? firewallDeviceExpression() : ''}meta l4proto tcp${firewallPortExpression()} redirect to :${port}`
          : `nft add rule inet ruopenray prerouting iifname "br-lan" ip daddr @proxy4 ${state.firewallDeviceMode === 'selected' ? firewallDeviceExpression() : ''}meta l4proto { tcp, udp }${firewallPortExpression()} counter tproxy ip to 127.0.0.1:${port} meta mark set 1`
      ].join('\n');
    }
    return [
      ...common,
      '# OFF: весь TCP/UDP после локальных исключений попадает в Xray routing.',
      selectedModeEmpty ? selectedNoopRule : firewallTargetRule(port)
    ].join('\n');
  }

  function firewallPayload() {
    const info = firewallInfo();
    const guard = firewallKillSwitchTargets();
    const routeSets = firewallRouteSets();
    return {
      routerMode: state.firewallRouterMode,
      bypassMode: state.firewallBypassMode,
      deviceMode: state.firewallDeviceMode,
      devices: firewallSelectedDeviceIps(),
      killSwitchDeviceMode: state.firewallKillSwitchDeviceMode || 'all',
      killSwitchDevices: firewallKillSwitchSelectedDeviceIps(),
      portMode: state.firewallPortMode,
      ports: firewallPorts(),
      blockQuic: state.firewallBlockQuic,
      dnsIntercept: state.firewallDnsIntercept,
      killSwitch: state.firewallKillSwitchEnabled,
      killSwitchIps: guard.ips,
      killSwitchDomains: guard.domains,
      killSwitchGeoip: guard.geoip,
      killSwitchGeosite: guard.geosite,
      killSwitchExt: guard.ext,
      killSwitchDomainMode: state.firewallKillSwitchDomainMode === 'nftset' ? 'nftset' : 'dns-block',
      directIps: routeSets.directIps,
      proxyIps: routeSets.proxyIps,
      directDomains: routeSets.directDomains,
      proxyDomains: routeSets.proxyDomains,
      directGeoip: routeSets.directGeoip,
      proxyGeoip: routeSets.proxyGeoip,
      directGeosite: routeSets.directGeosite,
      proxyGeosite: routeSets.proxyGeosite,
      directExt: routeSets.directExt,
      proxyExt: routeSets.proxyExt,
      directDomainCount: routeSets.directDomainCount + routeSets.directDynamicIpCount,
      proxyDomainCount: routeSets.proxyDomainCount + routeSets.proxyDynamicIpCount,
      transparentPort: Number(info.transparentPort || 52345),
      lanInterface: 'br-lan'
    };
  }

  function firewallSafetyCheck() {
    const info = firewallInfo();
    const guard = firewallKillSwitchTargets();
    const selectedDeviceIps = firewallSelectedDeviceIps();
    const killSwitchDeviceIps = firewallKillSwitchSelectedDeviceIps();
    const routerLan = routerLanAddress();
    const items = [];

    const add = (level, title, detail, fix = '') => {
      items.push({ level, title, detail, fix });
    };

    if (!info.transparent.length) {
      add(
        'danger',
        'Нет входа для перехвата',
        'Firewall отправит LAN-трафик в Xray, но transparent inbound в конфигурации не найден. У клиентов может пропасть интернет.',
        'Сначала нажмите «Подготовить черновик», проверьте и примените Xray.'
      );
    }

    if (state.firewallDeviceMode === 'selected' && !selectedDeviceIps.length) {
      add(
        'danger',
        'Не выбраны LAN-клиенты',
        'Режим «Только выбранные» включен, но список устройств пустой. RuOpenRay не будет применять перехват и защиту, пока не выбран хотя бы один клиент.',
        'Выберите устройство из DHCP-списка или переключите область действия на «Весь LAN».'
      );
    }

    if (state.firewallDeviceMode === 'selected' && selectedDeviceIps.some((ip) => isRouterAddress(ip, routerLan))) {
      add(
        'danger',
        'Выбран сам роутер',
        'Роутер не должен попадать в список LAN-клиентов для перехвата. Это может сломать доступ к LuCI, SSH или самой панели RuOpenRay.',
        'Уберите адрес роутера из выбранных клиентов.'
      );
    }

    if (state.firewallKillSwitchEnabled && state.firewallKillSwitchDeviceMode === 'selected' && !killSwitchDeviceIps.length) {
      add(
        'danger',
        'Для защиты не выбраны LAN-клиенты',
        'Защита от утечек ограничена выбранными клиентами, но список пустой. В таком виде правила защиты не будут созданы.',
        'Выберите клиента из DHCP-списка или переключите область защиты на «Весь LAN».'
      );
    }

    if (state.firewallKillSwitchEnabled && state.firewallKillSwitchDeviceMode === 'selected' && killSwitchDeviceIps.some((ip) => isRouterAddress(ip, routerLan))) {
      add(
        'danger',
        'Защита выбрана для адреса роутера',
        'Не добавляйте IP самого роутера в список клиентов защиты. Такое правило может задеть доступ к LuCI, SSH или RuOpenRay UI.',
        'Уберите адрес роутера из выбранных клиентов.'
      );
    }

    const privateTargets = guard.ips.filter((value) => isPrivateOrGatewayTarget(value, routerLan));
    if (state.firewallKillSwitchEnabled && privateTargets.length) {
      add(
        'danger',
        'Защита затрагивает локальную сеть',
        `В целях защиты есть локальные адреса: ${privateTargets.slice(0, 4).join(', ')}. Такое правило может заблокировать доступ к роутеру или устройствам LAN.`,
        'Оставляйте здесь только внешние IP/подсети или домены, которые нельзя выпускать напрямую.'
      );
    }

    if (state.firewallDeviceMode === 'all' && state.firewallPortMode === 'all') {
      add(
        'warn',
        'Перехватывается весь LAN и все порты',
        'Это рабочий режим, но ошибка в конфигурации затронет сразу всех клиентов. Для первого запуска безопаснее начать с выбранного устройства или портов 80/443.',
        'Проверьте доступ к LuCI/SSH после применения.'
      );
    }

    if (!info.localBypass.length) {
      add(
        'warn',
        'Локальные адреса не вынесены напрямую',
        'В Xray routing не найдено direct-правило для geoip:private или локальных подсетей. Firewall сам обходит private-сети, но в конфигурации Xray лучше закрепить это явно.',
        'Если текущий geoip.dat не содержит PRIVATE, проверка покажет короткую ошибку. Тогда замените geoip:private на локальные CIDR-подсети вручную.'
      );
    }

    if (state.firewallDnsIntercept && state.lanDnsStatus?.dnsPortConflict) {
      const port = state.lanDnsStatus?.xrayDnsPort || state.lanDnsStatus?.dnsPort || 10535;
      add(
        'warn',
        'DNS-порт занят',
        `На роутере уже есть процесс на DNS-порту Xray (${port}). DNS-перехват может не заработать, пока Xray DNS inbound не перенесен на свободный порт.`,
        'Откройте DNS и примените предложенный свободный порт.'
      );
    }

    if (state.firewallRouterMode === 'redirect' && !state.firewallBlockQuic) {
      add(
        'warn',
        'QUIC может пройти мимо',
        'REDIRECT хорошо работает для TCP, но UDP/QUIC лучше блокировать или использовать TPROXY.',
        'Включите блокировку QUIC или переключитесь на TPROXY.'
      );
    }

    if (state.firewallKillSwitchEnabled && guard.invalid.length) {
      add(
        'warn',
        'Есть нераспознанные цели',
        `RuOpenRay не понял: ${guard.invalid.slice(0, 4).join(', ')}.`,
        'Используйте IPv4, IPv4-подсети, домены, geoip:code, geosite:code или ext:"file.dat:list".'
      );
    }

    if (state.firewallKillSwitchEnabled && (guard.geoip.length || guard.geosite.length || guard.ext.length)) {
      add(
        'warn',
        'Защита использует geo',
        `Перед применением RuOpenRay развернет ${guard.geoip.length + guard.geosite.length + guard.ext.length} geo-ссылок из установленных DAT-файлов.`,
        'Если нужной категории нет в DAT, Geo Doctor покажет это при проверке черновика.'
      );
    }

    const dangerCount = items.filter((item) => item.level === 'danger').length;
    const warningCount = items.filter((item) => item.level !== 'danger').length;
    return {
      level: dangerCount ? 'danger' : warningCount ? 'warn' : 'safe',
      items,
      dangerCount,
      warningCount,
      hasDanger: dangerCount > 0
    };
  }

  function firewallReadyStatus(status) {
    if (!status?.active || !status?.persistent) return false;
    const routeSets = firewallRouteSets();
    const expectedRouterMode = state.firewallRouterMode || 'tproxy';
    if (status.routerMode && status.routerMode !== expectedRouterMode) return false;
    if (expectedRouterMode === 'tproxy' && (!status.ipRule || !status.ipRoute)) return false;
    if (status.bypassMode && status.bypassMode !== (state.firewallBypassMode || 'off')) return false;
    if ((state.firewallBypassMode || 'off') === 'bypass' && (Array.isArray(status.directIps) || routeSets.directIps.length)) {
      const directIpReady = routeSets.directGeoip.length
        ? listContainsAll(status.directIps || [], routeSets.directIps)
        : sameStringSet(status.directIps || [], routeSets.directIps);
      if (!directIpReady) return false;
    }
    if ((state.firewallBypassMode || 'off') === 'redirect' && (Array.isArray(status.proxyIps) || routeSets.proxyIps.length)) {
      const proxyIpReady = routeSets.proxyGeoip.length
        ? listContainsAll(status.proxyIps || [], routeSets.proxyIps)
        : sameStringSet(status.proxyIps || [], routeSets.proxyIps);
      if (!proxyIpReady) return false;
    }
    if ((state.firewallBypassMode || 'off') === 'bypass') {
      const directDomains = status.directNftset?.domains || [];
      if (routeSets.directDomains.length && !listContainsAll(directDomains, routeSets.directDomains)) return false;
    }
    if ((state.firewallBypassMode || 'off') === 'redirect') {
      const proxyDomains = status.proxyNftset?.domains || [];
      if (routeSets.proxyDomains.length && !listContainsAll(proxyDomains, routeSets.proxyDomains)) return false;
    }
    if (status.deviceMode && status.deviceMode !== (state.firewallDeviceMode || 'all')) return false;
    if ((Array.isArray(status.devices) || firewallSelectedDeviceIps().length) && !sameStringSet(status.devices || [], firewallSelectedDeviceIps())) return false;
    if (status.portMode && status.portMode !== (state.firewallPortMode || 'custom')) return false;
    if (status.portMode === 'custom' && !sameStringSet(status.ports || [], firewallPorts())) return false;
    if (typeof status.dnsIntercept === 'boolean' && status.dnsIntercept !== Boolean(state.firewallDnsIntercept)) return false;
    if (typeof status.blockQuic === 'boolean' && status.blockQuic !== Boolean(state.firewallBlockQuic)) return false;
    const guard = firewallKillSwitchTargets();
    if (state.firewallKillSwitchEnabled && status.killSwitch !== true) return false;
    if (!state.firewallKillSwitchEnabled && status.killSwitch === true) return false;
    if (state.firewallKillSwitchEnabled && status.killSwitchDeviceMode && status.killSwitchDeviceMode !== (state.firewallKillSwitchDeviceMode || 'all')) return false;
    if (state.firewallKillSwitchEnabled && (Array.isArray(status.killSwitchDevices) || firewallKillSwitchSelectedDeviceIps().length) && !sameStringSet(status.killSwitchDevices || [], firewallKillSwitchSelectedDeviceIps())) return false;
    if (state.firewallKillSwitchEnabled && guard.ips.length && !listContainsAll(status.killSwitchIps || [], guard.ips)) return false;
    if (state.firewallKillSwitchEnabled && guard.domains.length && state.firewallKillSwitchDomainMode === 'nftset') {
      const nftsetDomains = status.killSwitchNftset?.domains || [];
      if (!listContainsAll(nftsetDomains, guard.domains)) return false;
    }
    if (state.firewallKillSwitchEnabled && guard.domains.length && state.firewallKillSwitchDomainMode !== 'nftset') {
      const dnsBlockDomains = status.killSwitchDNSBlock?.domains || [];
      if (!listContainsAll(dnsBlockDomains, guard.domains)) return false;
    }
    return true;
  }

  function firewallPendingReasons(status = state.firewallStatus || {}) {
    const reasons = [];
    const routeSets = firewallRouteSets();
    if (!status?.active) reasons.push('nftables-таблица не активна');
    if (!status?.persistent) reasons.push('правила не сохранены для перезапуска firewall');
    const expectedRouterMode = state.firewallRouterMode || 'tproxy';
    if (status.routerMode && status.routerMode !== expectedRouterMode) {
      reasons.push(`режим: ${routerModeLabel(status.routerMode)} -> ${routerModeLabel(expectedRouterMode)}`);
    }
    if (expectedRouterMode === 'tproxy') {
      if (!status.ipRule) reasons.push('нет policy rule для TPROXY');
      if (!status.ipRoute) reasons.push('нет route table 100 для TPROXY');
      if (!status.hotplug) reasons.push('нет hotplug-восстановления policy routing');
    }
    const expectedBypassMode = state.firewallBypassMode || 'off';
    if (status.bypassMode && status.bypassMode !== expectedBypassMode) {
      reasons.push(`политика: ${bypassModeLabel(status.bypassMode)} -> ${bypassModeLabel(expectedBypassMode)}`);
    }
    if (expectedBypassMode === 'bypass' && (Array.isArray(status.directIps) || routeSets.directIps.length) && !(routeSets.directGeoip.length ? listContainsAll(status.directIps || [], routeSets.directIps) : sameStringSet(status.directIps || [], routeSets.directIps))) {
      reasons.push(`direct IP для обхода: ${stringListLabel(status.directIps || [])} -> ${stringListLabel(routeSets.directIps)}`);
    }
    if (expectedBypassMode === 'redirect' && (Array.isArray(status.proxyIps) || routeSets.proxyIps.length) && !(routeSets.proxyGeoip.length ? listContainsAll(status.proxyIps || [], routeSets.proxyIps) : sameStringSet(status.proxyIps || [], routeSets.proxyIps))) {
      reasons.push(`proxy IP для перехвата: ${stringListLabel(status.proxyIps || [])} -> ${stringListLabel(routeSets.proxyIps)}`);
    }
    if (expectedBypassMode === 'bypass' && routeSets.directDomains.length) {
      const actual = status.directNftset?.domains || [];
      if (!listContainsAll(actual, routeSets.directDomains)) reasons.push(`direct-домены dnsmasq/nftset: ${actual.length} -> ${routeSets.directDomains.length}`);
    }
    if (expectedBypassMode === 'redirect' && routeSets.proxyDomains.length) {
      const actual = status.proxyNftset?.domains || [];
      if (!listContainsAll(actual, routeSets.proxyDomains)) reasons.push(`proxy-домены dnsmasq/nftset: ${actual.length} -> ${routeSets.proxyDomains.length}`);
    }
    const expectedDeviceMode = state.firewallDeviceMode || 'all';
    if (status.deviceMode && status.deviceMode !== expectedDeviceMode) {
      reasons.push(`клиенты: ${deviceModeLabel(status.deviceMode)} -> ${deviceModeLabel(expectedDeviceMode)}`);
    }
    if ((Array.isArray(status.devices) || firewallSelectedDeviceIps().length) && !sameStringSet(status.devices || [], firewallSelectedDeviceIps())) {
      reasons.push(`клиенты перехвата: ${stringListLabel(status.devices || [])} -> ${stringListLabel(firewallSelectedDeviceIps())}`);
    }
    const expectedPortMode = state.firewallPortMode || 'custom';
    if (status.portMode && status.portMode !== expectedPortMode) {
      reasons.push(`порты: ${portModeLabel(status.portMode)} -> ${portModeLabel(expectedPortMode)}`);
    } else if (expectedPortMode === 'custom' && !sameStringSet(status.ports || [], firewallPorts())) {
      reasons.push(`порты: ${stringListLabel(status.ports || [])} -> ${stringListLabel(firewallPorts())}`);
    }
    if (typeof status.dnsIntercept === 'boolean' && status.dnsIntercept !== Boolean(state.firewallDnsIntercept)) {
      reasons.push(`DNS-перехват: ${onOffLabel(status.dnsIntercept)} -> ${onOffLabel(state.firewallDnsIntercept)}`);
    }
    if (typeof status.blockQuic === 'boolean' && status.blockQuic !== Boolean(state.firewallBlockQuic)) {
      reasons.push(`QUIC: ${onOffLabel(status.blockQuic)} -> ${onOffLabel(state.firewallBlockQuic)}`);
    }
    const guard = firewallKillSwitchTargets();
    if (state.firewallKillSwitchEnabled && status.killSwitch !== true) reasons.push('защита от прямого выхода еще не применена');
    if (!state.firewallKillSwitchEnabled && status.killSwitch === true) reasons.push('защита включена в firewall, но выключена в настройках');
    if (state.firewallKillSwitchEnabled) {
      const expectedKillSwitchDeviceMode = state.firewallKillSwitchDeviceMode || 'all';
      if (status.killSwitchDeviceMode && status.killSwitchDeviceMode !== expectedKillSwitchDeviceMode) {
        reasons.push(`клиенты защиты: ${deviceModeLabel(status.killSwitchDeviceMode)} -> ${deviceModeLabel(expectedKillSwitchDeviceMode)}`);
      }
      if ((Array.isArray(status.killSwitchDevices) || firewallKillSwitchSelectedDeviceIps().length) && !sameStringSet(status.killSwitchDevices || [], firewallKillSwitchSelectedDeviceIps())) {
        reasons.push(`список клиентов защиты: ${stringListLabel(status.killSwitchDevices || [])} -> ${stringListLabel(firewallKillSwitchSelectedDeviceIps())}`);
      }
      if (guard.ips.length && !listContainsAll(status.killSwitchIps || [], guard.ips)) {
        reasons.push(`IP защиты: ${stringListLabel(status.killSwitchIps || [])} -> ${stringListLabel(guard.ips)}`);
      }
    }
    if (state.firewallKillSwitchEnabled && guard.domains.length) {
      const expectedDomainMode = state.firewallKillSwitchDomainMode === 'nftset' ? 'nftset' : 'dns-block';
      if (status.killSwitchDomainMode && status.killSwitchDomainMode !== expectedDomainMode) {
        reasons.push(`домены защиты: ${domainModeLabel(status.killSwitchDomainMode)} -> ${domainModeLabel(expectedDomainMode)}`);
      }
      const actualDomains = expectedDomainMode === 'nftset'
        ? status.killSwitchNftset?.domains || []
        : status.killSwitchDNSBlock?.domains || [];
      if (!listContainsAll(actualDomains, guard.domains)) {
        reasons.push(`домены защиты: ${actualDomains.length} -> ${guard.domains.length}`);
      }
    }
    if (!reasons.length && !firewallReadyStatus(status)) reasons.push('выбранные настройки firewall еще не применены');
    return reasons;
  }

  function routerModeLabel(value) {
    return value === 'redirect' ? 'REDIRECT' : value === 'tproxy' ? 'TPROXY' : String(value || 'неизвестно');
  }

  function bypassModeLabel(value) {
    if (value === 'bypass') return 'BYPASS';
    if (value === 'redirect') return 'REDIRECT';
    return 'OFF';
  }

  function deviceModeLabel(value) {
    if (value === 'selected') return 'выбранные клиенты';
    if (value === 'exclude') return 'кроме выбранных';
    return 'весь LAN';
  }

  function portModeLabel(value) {
    return value === 'all' ? 'все' : 'список';
  }

  function domainModeLabel(value) {
    return value === 'nftset' ? 'по клиентам через nftset' : 'точно через DNS';
  }

  function onOffLabel(value) {
    return value ? 'вкл' : 'выкл';
  }

  function stringListLabel(items) {
    const values = (Array.isArray(items) ? items : []).filter(Boolean);
    return values.length ? values.join(', ') : 'пусто';
  }

  function sameStringSet(left, right) {
    const normalize = (items) => [...new Set((Array.isArray(items) ? items : []).map((item) => String(item).trim()).filter(Boolean))].sort();
    const a = normalize(left);
    const b = normalize(right);
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }

  function listContainsAll(left, right) {
    const normalize = (items) => new Set((Array.isArray(items) ? items : []).map((item) => String(item).trim().toLowerCase()).filter(Boolean));
    const actual = normalize(left);
    return (Array.isArray(right) ? right : []).map((item) => String(item).trim().toLowerCase()).filter(Boolean).every((item) => actual.has(item));
  }

  function routerLanAddress() {
    return String(
      state.lanDnsStatus?.routerLan ||
      state.status?.routerLan ||
      state.status?.lan?.ip ||
      ''
    ).trim();
  }

  function isRouterAddress(value, routerLan) {
    const clean = String(value || '').trim();
    if (!clean) return false;
    if (routerLan && clean === routerLan) return true;
    return /^192\.168\.\d+\.1$/.test(clean) || /^10\.\d+\.\d+\.1$/.test(clean) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.1$/.test(clean);
  }

  function isPrivateOrGatewayTarget(value, routerLan) {
    const clean = String(value || '').trim();
    if (!clean) return false;
    if (routerLan && (clean === routerLan || clean === `${routerLan}/32`)) return true;
    if (/^(0\.0\.0\.0\/0|127\.0\.0\.0\/8|10\.0\.0\.0\/8|172\.16\.0\.0\/12|192\.168\.0\.0\/16|169\.254\.0\.0\/16)$/.test(clean)) return true;
    return /^192\.168\.\d+\.\d+(\/\d{1,2})?$/.test(clean) ||
      /^10\.\d+\.\d+\.\d+(\/\d{1,2})?$/.test(clean) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(\/\d{1,2})?$/.test(clean);
  }

  return {
    firewallInfo,
    firewallPorts,
    firewallDeviceChoices,
    firewallSelectedDevices,
    firewallKillSwitchTargets,
    nftList,
    firewallDeviceExpression,
    firewallPortExpression,
    firewallTargetRule,
    firewallPolicyPreview,
    firewallCommands,
    firewallPayload,
    firewallSafetyCheck,
    firewallReadyStatus,
    firewallPendingReasons
  };
}
