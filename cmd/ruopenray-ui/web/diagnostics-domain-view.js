import { serverLocation } from './server-location.js';

export function createDiagnosticsDomainView(deps) {
  const {
    accessLogRows,
    accessLogTable,
    activeProxyTag,
    aggregateLogDomains,
    burstObservatoryConfig,
    burstObservatorySelectors,
    byteRate,
    byteSize,
    checkForTag,
    checkLabel,
    configInbounds,
    currentDomainMonitor,
    deviceRules,
    domainDiagnosticRows,
    domainMonitorDevicesText,
    domainMonitorDomainQuality,
    domainMonitorFilterCounts,
    domainMonitorHost,
    domainMonitorMatchesDevice,
    domainMonitorMatchesFilter,
    domainMonitorMatchesQuery,
    domainMonitorProtocols,
    domainMonitorRows,
    escapeHtml,
    isIpLiteral,
    logsPanel,
    monitorSourceLabel,
    monitoredDevices,
    monitoredDomains,
    monitoredEvents,
    observatoryConfig,
    observatoryMatchedOutbounds,
    observatoryRequiredBalancers,
    observatorySelectors,
    outboundAddress,
    outboundMatchesSelectors,
    proxyOutbounds,
    sniPanel,
    selectedDomainMonitorDevice,
    stat,
    state,
    strategyObserverType,
    trafficMonitor,
    xrayActiveStats,
    xrayStatsPanel,
    xrayStatsTotals,
  } = deps;

function domainMonitorStatusItems() {
  const monitor = (typeof currentDomainMonitor === 'function' ? currentDomainMonitor() : state.domainMonitor) || {};
  const sourcePath = String(monitor.sourcePath || '');
  const quality = domainMonitorDomainQuality();
  const transparent = configInbounds().find((item) => item?.tag === 'transparent_ipv4' || item?.streamSettings?.sockopt?.tproxy);
  const sniffing = transparent?.sniffing || {};
  const destOverride = Array.isArray(sniffing.destOverride) ? sniffing.destOverride : [];
  const snifferOk = Boolean(sniffing.enabled && (destOverride.includes('tls') || destOverride.includes('http') || destOverride.includes('quic')));
  const accessPath = state.loggingAccessPath || state.config?.log?.access || '';
  const accessConfigured = Boolean(state.loggingAccessLog || state.config?.log?.access);
  const sourceSeesAccess = Boolean((accessPath && sourcePath.includes(accessPath)) || sourcePath.includes('access'));
  const dnsLog = Boolean(state.loggingDnsLog || state.config?.log?.dnsLog);
  const lanDns = state.lanDnsStatus || {};
  const lanDnsXray = Boolean(lanDns.mode === 'xray' && lanDns.readiness?.ready);
  const dnsmasq = monitor?.dnsmasq || {};
  const dnsmasqParser = Boolean(String(monitor?.source || '').includes('dnsmasq') || String(monitor?.sourcePath || '').includes('dnsmasq'));
  const dnsmasqLogqueries = dnsmasq.logqueries === true;
  const hasEvents = Number(monitor.stats?.total || 0) > 0 || quality.total > 0;
  const hasDomains = quality.hasDomains || Number(monitor.stats?.uniqueDomains || 0) > 0;
  const cards = [
    {
      tone: monitor.running ? 'ok' : 'bad',
      title: 'Монитор',
      value: monitor.running ? 'запущен' : 'остановлен',
      detail: monitor.running ? 'RuOpenRay читает access/DNS-логи Xray и logread роутера.' : 'Нажмите «Запустить», чтобы начать читать события.'
    },
    {
      tone: accessConfigured && sourceSeesAccess ? 'ok' : accessConfigured ? 'warn' : 'bad',
      title: 'Источник',
      value: monitorSourceLabel(),
      detail: sourcePath ? sourcePath : 'Пока нет доступного access-log. Включите access-логирование Xray.'
    },
    {
      tone: lanDnsXray ? 'ok' : 'warn',
      title: 'DNS LAN',
      value: lanDnsXray ? 'через Xray' : lanDns.mode || 'system',
      detail: lanDnsXray ? 'dnsmasq отправляет DNS в Xray, поэтому Xray часто видит DNS как запросы роутера. Для привязки к телефону включите logqueries: RuOpenRay прочитает dnsmasq из logread.' : 'Если оставить системный DNS, Xray часто увидит только IP.'
    },
    {
      tone: dnsmasqParser ? 'ok' : 'warn',
      title: 'dnsmasq parser',
      value: dnsmasqParser ? 'читает logread' : dnsmasqLogqueries ? 'ждет событий' : 'можно включить',
      detail: dnsmasqParser ? 'DNS-запросы dnsmasq попадают в монитор с IP LAN-клиента.' : dnsmasqLogqueries ? 'logqueries включен, откройте новый домен на клиенте.' : 'Если нужен DNS именно по устройствам, включите logqueries в dnsmasq: строки query[...] будут разобраны и привязаны к DHCP-клиентам.'
    },
    {
      tone: dnsLog ? 'ok' : 'warn',
      title: 'DNS-лог',
      value: dnsLog ? 'включен' : 'выключен',
      detail: dnsLog ? 'DNS-лог Xray дает домены, но при схеме dnsmasq -> Xray источник обычно роутер. Для устройства точнее dnsmasq parser.' : 'Для доменов включите DNS logging в настройках логирования.'
    },
    {
      tone: snifferOk ? 'ok' : 'warn',
      title: 'Сниффер',
      value: snifferOk ? destOverride.join(' + ') : 'не помогает',
      detail: snifferOk ? 'TLS/HTTP SNI может дать домен без DNS-запроса.' : 'Включите HTTP + TLS в перехвате, чтобы ловить SNI.'
    },
    {
      tone: hasDomains ? 'ok' : hasEvents ? 'warn' : 'bad',
      title: 'Домены',
      value: hasDomains ? `${quality.domains || monitor.stats?.uniqueDomains || 0} найдено` : hasEvents ? 'только IP' : 'нет событий',
      detail: hasDomains ? `${quality.domainShare || 0}% live-событий сейчас с доменными именами, ${quality.ips || 0} событий только с IP.` : hasEvents ? 'Трафик есть, но клиент/приложение ходит по IP или DNS обходит Xray.' : 'Откройте сайт на LAN/Wi-Fi устройстве и обновите монитор.'
    }
  ];
  const tips = [];
  if (!monitor.running) tips.push('Запустите монитор кнопкой сверху.');
  if (!accessConfigured || !sourceSeesAccess) tips.push('Включите access-log Xray и убедитесь, что путь логов совпадает с активным config.');
  if (!lanDnsXray) tips.push(`В DNS → LAN DNS направьте dnsmasq на Xray: ${lanDns.xrayTarget || lanDns.suggestedXrayTarget || '127.0.0.1#10535'}.`);
  if (lanDnsXray && !dnsmasqParser) tips.push('DNS через dnsmasq не сохраняет IP телефона для Xray: включите logqueries в dnsmasq, тогда RuOpenRay будет парсить logread:dnsmasq и привязывать DNS-домены к LAN-клиентам.');
  if (lanDnsXray && dnsmasqParser) tips.push('DNS-запросы dnsmasq уже читаются из logread и могут показываться в устройстве по IP клиента.');
  if (!dnsLog) tips.push('В настройках логирования включите DNS-лог, иначе DNS-запросы не попадут в монитор.');
  if (!snifferOk) tips.push('В перехвате включите сниффер HTTP + TLS, чтобы видеть SNI из HTTPS-соединений.');
  if (hasEvents && !hasDomains) tips.push('После изменения DNS на телефоне иногда нужно переподключить Wi-Fi или открыть новый домен без кэша.');
  if (!tips.length) {
    tips.push('Откройте новый сайт на Wi-Fi/LAN клиенте, затем смотрите вкладки «Домены», «Устройства» или «Live».');
    tips.push('Если видны только IP, приложение могло взять адрес из кэша, Private DNS/DoH или готового IP-соединения.');
    tips.push('Для чистой проверки переподключите Wi-Fi на клиенте или закройте приложение и откройте новый домен.');
  }
  return { cards, tips, quality };
}

function domainMonitorStatusPanel() {
  const { cards, tips, quality } = domainMonitorStatusItems();
  const monitor = cards[0] || {};
  const source = cards[1] || {};
  const dns = cards[2] || {};
  const frozenMonitor = (typeof currentDomainMonitor === 'function' ? currentDomainMonitor() : state.domainMonitor) || {};
  const dnsmasq = frozenMonitor?.dnsmasq || {};
  const dnsmasqLogqueries = dnsmasq.logqueries === true;
  const runtimeWarnings = [];
  if (frozenMonitor.running) {
    runtimeWarnings.push('Монитор нужен для диагностики доменов, но в рабочем режиме он регулярно читает access/DNS-логи. Остановите его после проверки.');
  }
  if (dnsmasqLogqueries) {
    runtimeWarnings.push('dnsmasq logqueries пишет каждый DNS-запрос в системный logread. Выключите parser после диагностики устройств.');
  }
  const dnsmasqAction = dnsmasqLogqueries ? 'disableDnsmasqLogqueries' : 'enableDnsmasqLogqueries';
  const dnsmasqBusy = state.busyAction === dnsmasqAction;
  return `
    <details class="domain-monitor-health-details">
      <summary>
        <span class="domain-monitor-health-title">Состояние монитора</span>
        <span class="domain-monitor-health-summary">
          <b class="${escapeHtml(monitor.tone || '')}">${escapeHtml(monitor.value || 'нет данных')}</b>
          <b>${escapeHtml(source.value || 'источник ?')}</b>
          <b>${escapeHtml(dns.value || 'DNS ?')}</b>
          <b>${Number(quality.domainShare || 0)}% с доменами</b>
        </span>
      </summary>
    <div class="domain-monitor-health">
      ${runtimeWarnings.length ? `<div class="settings-warning compact"><strong>Диагностика</strong><span>${escapeHtml(runtimeWarnings.join(' '))}</span></div>` : ''}
      <div class="domain-monitor-health-grid">
        ${cards.map((item) => `<article class="${item.tone}">
          <span>${escapeHtml(item.title)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <small>${escapeHtml(item.detail)}</small>
        </article>`).join('')}
      </div>
      <div class="domain-monitor-help">
        <div class="domain-monitor-help-actions">
          <div>
            <strong>DNS по устройствам</strong>
            <span>${dnsmasqLogqueries ? 'dnsmasq пишет query[] в logread, RuOpenRay может привязать DNS к DHCP-клиентам.' : 'Включите logqueries, чтобы видеть DNS-запросы не только от роутера, а от конкретных LAN-устройств.'}</span>
            <small>При переключении RuOpenRay сохранит UCI и перезапустит dnsmasq. DNS может прерваться на несколько секунд.</small>
          </div>
          <button class="btn secondary ${dnsmasqBusy ? 'is-busy' : ''}" data-action="${dnsmasqAction}" ${dnsmasqBusy ? 'disabled' : ''}>${dnsmasqBusy ? 'Сохраняю...' : dnsmasqLogqueries ? 'Выключить dnsmasq parser' : 'Включить dnsmasq parser'}</button>
        </div>
        <strong>Как увидеть домены</strong>
        <ol>
          ${tips.slice(0, 5).map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}
        </ol>
      </div>
    </div>
    </details>
  `;
}

function diagnosticsDomainView() {
  const logRows = aggregateLogDomains();
  const accessRows = accessLogRows(state.logs).slice(0, 30);
  const rows = domainDiagnosticRows();
  return `
    <section class="panel">
      <div class="panel-title">
        <div><h2>По доменам</h2><span>Агрегация из live-логов: частые домены, устройства, протоколы и направления.</span></div>
        <button class="btn secondary" data-tab-jump="routing">Открыть маршруты</button>
      </div>
      ${accessLogTable(accessRows)}
      <div class="diagnostic-list">
        ${logRows.length ? logRows.map((item) => `<article class="diagnostic-row">
          <div>
            <strong>${escapeHtml(item.host)}</strong>
            <span>${item.devices.size || 'нет'} устройств · ${[...item.protocols].join('/') || 'protocol ?'} · ${[...item.outbound].join(', ') || 'направление ?'}</span>
          </div>
          <em>${item.hits} событий</em>
          <button class="btn secondary" data-domain-to-route="${escapeHtml(item.host)}">В правило</button>
        </article>`).join('') : rows.map(({ info, index }) => `<article class="diagnostic-row">
          <div>
            <strong>${escapeHtml(info.value)}</strong>
            <span>${escapeHtml(info.detail || 'domain rule')}</span>
          </div>
          <em>${escapeHtml(info.outbound)}</em>
          <button class="btn secondary" data-route-focus="${index}">Найти</button>
        </article>`).join('') || '<p class="muted">В логах и маршрутизации пока нет доменов. Включите access-логи или добавьте доменное правило.</p>'}
      </div>
    </section>
  `;
}

function domainMonitorFilterBar() {
  const counts = domainMonitorFilterCounts();
  const filters = [
    ['domains', 'Домены', counts.domains],
    ['ip', 'IP', counts.ip],
    ['dns', 'DNS', counts.dns],
    ['tcp', 'TCP', counts.tcp],
    ['udp', 'UDP', counts.udp],
    ['all', 'Все', counts.all]
  ];
  return `
    <div class="domain-monitor-filters" role="group" aria-label="Фильтр событий монитора">
      ${filters.map(([value, label, count]) => `<button type="button" class="${state.domainMonitorFilter === value ? 'active' : ''}" data-domain-filter="${value}">
        <span>${label}</span>
        <strong>${Number(count || 0).toLocaleString('ru-RU')}</strong>
      </button>`).join('')}
    </div>
  `;
}

function domainMonitorKind(host) {
  if (!host) return { label: 'EVENT', tone: 'muted' };
  if (isIpLiteral(host)) return { label: 'IP', tone: 'ip' };
  if (String(host).includes('dns') || String(host).includes('doh')) return { label: 'DNS', tone: 'dns' };
  return { label: 'DOMAIN', tone: 'domain' };
}

function domainMonitorMetaChips(item = {}) {
  const chips = [];
  const protocols = domainMonitorProtocols(item);
  if (protocols.length) chips.push(...protocols.slice(0, 3));
  const outbounds = Array.isArray(item.outbounds) ? item.outbounds : [item.outbound].filter(Boolean);
  if (outbounds.length) chips.push(...outbounds.slice(0, 2));
  if (item.destinationPort) chips.push(`:${item.destinationPort}`);
  return chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('');
}

function domainMonitorDeviceLine(item = {}) {
  const text = domainMonitorDevicesText(item);
  const samples = Array.isArray(item.samples) ? item.samples : [];
  const sample = samples[0] || item;
  const endpoint = [sample.sourceIp, sample.destinationIp ? `→ ${sample.destinationIp}${sample.destinationPort ? `:${sample.destinationPort}` : ''}` : '']
    .filter(Boolean)
    .join(' ');
  return [text, endpoint].filter(Boolean).join(' · ');
}

function domainMonitorDeviceFilterChips(item = {}) {
  const devices = Array.isArray(item.devices) ? item.devices : [];
  const chips = devices
    .filter((device) => device && (device.ip || device.name))
    .slice(0, 4);
  if (!chips.length) {
    const ip = item.sourceIp || 'router';
    const label = item.sourceDevice || ip;
    return `<button class="domain-monitor-device-chip" type="button" data-domain-device-events="${escapeHtml(ip)}">${escapeHtml(label)}</button>`;
  }
  return chips.map((device) => {
    const ip = device.ip || 'router';
    const label = device.name || device.ip || 'router';
    const hits = Number(device.hits || 0);
    return `<button class="domain-monitor-device-chip" type="button" data-domain-device-events="${escapeHtml(ip)}">${escapeHtml(label)}${hits ? ` <b>${hits.toLocaleString('ru-RU')}</b>` : ''}</button>`;
  }).join('');
}

function domainProbeLine(part = {}, label) {
  if (part.skipped) {
    return `<span>${escapeHtml(label)}: пропущено</span>`;
  }
  const ok = part.ok === true;
  const latency = Number(part.latencyMs || 0);
  const suffix = latency ? ` · ${latency} мс` : '';
  const errorStatus = String(part.error || '').match(/HTTP\s+([0-9]{3})/i);
  const status = part.status ? ` HTTP ${part.status}` : (errorStatus ? ` HTTP ${errorStatus[1]}` : '');
  return `<span class="${ok ? 'ok' : 'bad'}">${escapeHtml(label)}: ${ok ? 'да' : 'нет'}${escapeHtml(status + suffix)}</span>`;
}

function domainProbeSummary(result) {
  if (!result) return '';
  if (result.ok === false) return 'ошибка проверки';
  const checks = result.checks || {};
  const latency = (part = {}) => Number(part.latencyMs || 0) ? ` ${Number(part.latencyMs)} мс` : '';
  const directHttp = checks.httpDirect || result.direct || {};
  const proxyHttp = checks.httpProxy || result.proxy || {};
  const directTcp = checks.tcpDirect || {};
  const proxyTcp = checks.tcpProxy || {};
  const ping = checks.ping?.ok
    ? `ping${latency(checks.ping)}`
    : checks.ping?.ok === false && !checks.ping?.skipped
      ? 'ping нет'
      : '';
  const direct = directHttp.ok ? `direct HTTP${latency(directHttp)}` : directTcp.ok ? `direct TCP${latency(directTcp)}` : directHttp.ok === false || directTcp.ok === false ? 'direct нет' : '';
  const proxy = proxyHttp.ok ? `proxy HTTP${latency(proxyHttp)}` : proxyTcp.ok ? `proxy TCP${latency(proxyTcp)}${proxyHttp.ok === false ? ' · HTTP нет' : ''}` : proxyHttp.ok === false || proxyTcp.ok === false ? 'proxy нет' : '';
  const parts = [ping, direct, proxy].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  if (result.ok) return result.verdict?.label || 'проверено';
  return result.verdict?.label || 'нет ответа';
}

function domainProbeDetailText(result) {
  if (!result) return '';
  if (result.ok === false) return result.stderr || result.error || 'не удалось проверить';
  const checks = result.checks || {};
  return [
    domainProbeLine(checks.ping, 'ping с роутера').replace(/<[^>]+>/g, ''),
    domainProbeLine(checks.tcpDirect, 'tcp напрямую').replace(/<[^>]+>/g, ''),
    domainProbeLine(checks.tcpProxy, `tcp через ${result.tag || 'proxy'}`).replace(/<[^>]+>/g, ''),
    domainProbeLine(checks.httpDirect || result.direct, 'http напрямую').replace(/<[^>]+>/g, ''),
    domainProbeLine(checks.httpProxy || result.proxy, `http через ${result.tag || 'proxy'}`).replace(/<[^>]+>/g, ''),
    result.verdict?.detail || ''
  ].filter(Boolean).join(' · ');
}

function domainProbeSelectedTag() {
  return String(state.domainProbeTag || activeProxyTag() || '').trim();
}

function domainProbeKey(host) {
  return `${String(host || '').trim()}\u0000${domainProbeSelectedTag()}`;
}

function domainProbeTargetSelectHtml() {
  const selected = domainProbeSelectedTag();
  const statusIcon = (check) => {
    if (!check) return '🟡';
    if (check.ok || check.httpOk) return '🟢';
    if (check.httpOk === false) return '🔴';
    if (check.endpointOk || check.pingOk) return '🟡';
    return '🔴';
  };
  const proxies = proxyOutbounds()
    .filter((item) => item && item.tag)
    .map((item) => {
      const tag = String(item.tag || '');
      const address = outboundAddress(item);
      const check = checkForTag(tag);
      const status = check ? checkLabel(check) : 'не проверялся';
      const location = serverLocation(item, state.serverMeta?.[tag] || {});
      const flag = location.flag || '🌐';
      const label = [flag, tag, status, address, statusIcon(check)].filter(Boolean).join(' · ');
      return `<option value="${escapeHtml(tag)}" ${tag === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
  return `<label class="domain-probe-target">
    <span>Проверять через</span>
    <select id="domainProbeTag">
      ${proxies || `<option value="">${escapeHtml(activeProxyTag() || 'proxy')}</option>`}
    </select>
  </label>`;
}

function domainProbeStatusHtml(host, { compact = false } = {}) {
  const key = domainProbeKey(host);
  const checking = state.domainProbeChecking === key;
  const result = state.domainProbeResults[key];
  if (checking) {
    return `<div class="domain-probe compact pending"><span>проверяю...</span></div>`;
  }
  if (!result) {
    return `<button class="btn secondary compact" data-domain-probe="${escapeHtml(host)}">Проверить</button>`;
  }
  if (result.ok === false) {
    if (compact) {
      return `<div class="domain-probe compact bad" title="${escapeHtml(result.stderr || result.error || 'не удалось проверить')}">
        <span>ошибка проверки</span>
        <button class="btn secondary compact" data-domain-probe="${escapeHtml(host)}">Повторить</button>
      </div>`;
    }
    return `<div class="domain-probe bad">
      <strong>ошибка</strong>
      <span>${escapeHtml(result.stderr || result.error || 'не удалось проверить')}</span>
        <button class="btn secondary compact" data-domain-probe="${escapeHtml(host)}">Повторить</button>
    </div>`;
  }
  if (compact) {
    const code = result.verdict?.code || '';
    return `<div class="domain-probe compact ${escapeHtml(code)}" title="${escapeHtml(domainProbeDetailText(result))}">
      <span>${escapeHtml(domainProbeSummary(result))}</span>
      <button class="btn secondary compact" data-domain-probe="${escapeHtml(host)}">Повторить</button>
    </div>`;
  }
  const code = result.verdict?.code || '';
  const checks = result.checks || {};
  return `<div class="domain-probe ${escapeHtml(code)}">
    <strong>${escapeHtml(result.verdict?.label || 'проверено')}</strong>
    ${domainProbeLine(checks.ping, 'ping с роутера')}
    ${domainProbeLine(checks.tcpDirect, 'tcp напрямую')}
    ${domainProbeLine(checks.tcpProxy, `tcp через ${result.tag || 'proxy'}`)}
    ${domainProbeLine(checks.httpDirect || result.direct, 'http напрямую')}
    ${domainProbeLine(checks.httpProxy || result.proxy, `http через ${result.tag || 'proxy'}`)}
    <small>${escapeHtml(result.verdict?.detail || '')}</small>
    <button class="btn secondary compact" data-domain-probe="${escapeHtml(host)}">Повторить</button>
  </div>`;
}

function domainMonitorItemHtml(item, { event = false } = {}) {
  const host = domainMonitorHost(item) || 'unknown';
  const kind = domainMonitorKind(host);
  const hits = event ? 1 : Number(item.hits || 0);
  const time = event ? item.time : item.lastSeen;
  return `<article class="domain-monitor-item ${kind.tone}">
    <div class="domain-monitor-kind">${kind.label}</div>
    <div class="domain-monitor-main">
      <strong>${escapeHtml(host)}</strong>
      <small>${escapeHtml(domainMonitorDeviceLine(item))}</small>
      <div class="domain-monitor-device-filter-chips">${domainMonitorDeviceFilterChips(item)}</div>
    </div>
    <div class="domain-monitor-chips">${domainMonitorMetaChips(item)}</div>
    <div class="domain-monitor-count">
      <strong>${hits.toLocaleString('ru-RU')}</strong>
      <small>${escapeHtml(time || '')}</small>
    </div>
    ${domainProbeStatusHtml(host, { compact: true })}
    <button class="btn secondary" data-domain-to-route="${escapeHtml(host)}">В правило</button>
  </article>`;
}

function domainMonitorDeviceDomainRows(deviceKey) {
  const query = String(state.domainMonitorQuery || '').trim().toLowerCase();
  const rows = domainMonitorRows()
    .filter((item) => domainMonitorMatchesDevice(item, deviceKey) && domainMonitorMatchesFilter(item) && domainMonitorMatchesQuery(item, query));
  if (state.domainMonitorSort === 'last') return rows.sort((a, b) => (b.lastSeenTs || 0) - (a.lastSeenTs || 0));
  if (state.domainMonitorSort === 'name') return rows.sort((a, b) => String(domainMonitorHost(a)).localeCompare(String(domainMonitorHost(b))));
  return rows.sort((a, b) => (b.hits || 0) - (a.hits || 0));
}

function domainMonitorSample(item = {}) {
  if (Array.isArray(item.samples) && item.samples.length) return item.samples[0] || {};
  return item;
}

function domainMonitorFlowText(item = {}) {
  const sample = domainMonitorSample(item);
  const source = String(item.source || sample.source || '').toLowerCase();
  const protocols = domainMonitorProtocols(item).join('/');
  const outbound = item.outbound || sample.outbound || (Array.isArray(item.outbounds) ? item.outbounds.find(Boolean) : '');
  if (source.includes('dnsmasq')) return 'DNS: устройство -> dnsmasq';
  if (source.includes('xray-dns')) return 'DNS: Xray -> dns-out';
  if (outbound) return `${protocols || 'TCP'} -> ${outbound}`;
  return `${protocols || 'TCP'} -> Xray`;
}

function domainMonitorDeviceRowsHtml(rows) {
  if (!rows.length) {
    return `<div class="domain-monitor-device-empty">Нет событий в текущем фильтре. Если DNS идет через dnsmasq -> Xray, включите парсер dnsmasq, чтобы домены привязывались к устройству.</div>`;
  }
  return `<div class="domain-monitor-device-table">
    <div class="domain-monitor-device-table-head">
      <span>домен</span>
      <span>запросов</span>
      <span>протоколы</span>
      <span>как идет</span>
      <span>последний</span>
      <span></span>
    </div>
    ${rows.slice(0, 40).map((item) => {
      const host = domainMonitorHost(item) || 'unknown';
      const protocols = domainMonitorProtocols(item);
      return `<div class="domain-monitor-device-row">
        <strong title="${escapeHtml(host)}">${escapeHtml(host)}</strong>
        <span>${Number(item.hits || 0).toLocaleString('ru-RU')}</span>
        <span class="domain-monitor-mini-chips">${protocols.length ? protocols.map((protocol) => `<b>${escapeHtml(protocol)}</b>`).join('') : '<b>?</b>'}</span>
        <span class="domain-monitor-flow">${escapeHtml(domainMonitorFlowText(item))}</span>
        <span>${escapeHtml(item.lastSeen || '')}</span>
        <button class="btn secondary compact" data-domain-to-route="${escapeHtml(host)}">В правило</button>
      </div>`;
    }).join('')}
  </div>`;
}

function domainMonitorRowsHtml(monitored, fallbackRows, rows) {
  const windowSize = ['compact', 'medium', 'large'].includes(state.domainMonitorListWindow || state.domainMonitorEventWindow) ? (state.domainMonitorListWindow || state.domainMonitorEventWindow) : 'medium';
  if (state.domainMonitorMode === 'devices') {
    const selected = selectedDomainMonitorDevice();
    const devices = monitoredDevices();
    const deviceHtml = devices.slice(0, 80).map((item) => {
      const deviceKey = item.ip || 'router';
      const expanded = Boolean(state.domainMonitorExpandedDevices?.[deviceKey]);
      const deviceRows = domainMonitorDeviceDomainRows(deviceKey);
      const protocols = new Set(deviceRows.flatMap((row) => domainMonitorProtocols(row)));
      return `<article class="domain-monitor-device ${selected?.ip === deviceKey ? 'active' : ''} ${expanded ? 'expanded' : ''}" data-domain-device-card="${escapeHtml(deviceKey)}" role="button" tabindex="0">
      <button class="domain-monitor-device-toggle" type="button" data-domain-device-toggle="${escapeHtml(deviceKey)}" aria-expanded="${expanded ? 'true' : 'false'}">${expanded ? '▾' : '▸'}</button>
      <div class="domain-monitor-kind">LAN</div>
      <div class="domain-monitor-main">
        <strong>${escapeHtml(item.name || item.ip || 'router')}</strong>
        <small>${escapeHtml(item.ip || '')}</small>
      </div>
      <div class="domain-monitor-device-domains">${(item.topDomains || []).slice(0, 5).map((domain) => `<span>${escapeHtml(domain.host)} <b>${domain.hits}</b></span>`).join('')}</div>
      <div class="domain-monitor-count domain-monitor-device-count">
        <strong>${Number(item.hits || 0).toLocaleString('ru-RU')}</strong>
        <small>событий · ${deviceRows.length.toLocaleString('ru-RU')} доменов</small>
        <small>${[...protocols].join('/') || 'protocol ?'}</small>
      </div>
      <button class="btn secondary compact" data-domain-device-events="${escapeHtml(deviceKey)}">${selected?.ip === deviceKey ? 'Фильтр включен' : 'События'}</button>
      ${expanded ? `<div class="domain-monitor-device-details">${domainMonitorDeviceRowsHtml(deviceRows)}</div>` : ''}
    </article>`;
    }).join('') || '<p class="muted">Устройства пока не определены. Нужны access-логи Xray или dnsmasq parser.</p>';
    return `<div class="domain-monitor-scroll-window ${windowSize} devices">${deviceHtml}</div>`;
  }
  if (state.domainMonitorMode === 'events') {
    const events = monitoredEvents();
    return `<div class="domain-monitor-scroll-window domain-monitor-events-window ${windowSize} events">
      ${events.slice(0, 220).map((item) => domainMonitorItemHtml(item, { event: true })).join('') || '<p class="muted">Живых событий пока нет. Нажмите Start и проверьте, что access-логирование включено.</p>'}
    </div>`;
  }
  const domainHtml = monitored.length ? monitored.slice(0, 80).map((item) => domainMonitorItemHtml(item)).join('') : fallbackRows.length && state.domainMonitorFilter === 'all' ? fallbackRows.map((item) => `<article class="diagnostic-row">
    <div>
      <strong>${escapeHtml(item.host)}</strong>
      <span>${item.devices.size || 'нет'} устройств · ${[...item.protocols].join('/') || 'protocol ?'} · ${[...item.outbound].join(', ') || 'направление ?'}</span>
    </div>
    <em>${item.hits} событий</em>
    <button class="btn secondary" data-domain-to-route="${escapeHtml(item.host)}">В правило</button>
  </article>`).join('') : rows.map(({ info, index }) => `<article class="diagnostic-row">
    <div>
      <strong>${escapeHtml(info.value)}</strong>
      <span>${escapeHtml(info.detail || 'domain rule')}</span>
    </div>
    <em>${escapeHtml(info.outbound)}</em>
    <button class="btn secondary" data-route-focus="${index}">Найти</button>
  </article>`).join('') || '<p class="muted">Домены пока не пойманы. Включите access/DNS-логи Xray или dnsmasq parser.</p>';
  return `<div class="domain-monitor-scroll-window ${windowSize} domains">${domainHtml}</div>`;
}

function diagnosticsDomainMonitorView() {
  const monitor = (typeof currentDomainMonitor === 'function' ? currentDomainMonitor() : state.domainMonitor) || null;
  const monitored = monitoredDomains();
  const selectedDevice = selectedDomainMonitorDevice();
  const stats = monitor?.stats || {};
  const fallbackRows = aggregateLogDomains();
  const rows = domainDiagnosticRows();
  const sourcePath = monitor?.sourcePath ? ` · ${monitor.sourcePath}` : '';
  const running = monitor?.running;
  const filterCounts = domainMonitorFilterCounts();
  const topRealDomain = domainMonitorRows()
    .filter((item) => domainMonitorMatchesFilter(item, 'domains'))
    .sort((a, b) => (b.hits || 0) - (a.hits || 0))[0];
  const filterActive = Boolean(String(state.domainMonitorQuery || '').trim()) || state.domainMonitorFilter !== 'all' || Boolean(selectedDevice);
  return `
    <section class="panel">
      <div class="panel-title">
        <div><h2>Мониторинг доменов</h2><span>SNI/домены из логов Xray и dnsmasq: живой поток, группировка по устройствам и быстрое добавление в маршрутизацию.</span></div>
        <div class="split-actions">
          ${running
            ? `<button class="btn danger ${state.busyAction === 'stopDomainMonitor' ? 'is-busy' : ''}" data-action="stopDomainMonitor" ${state.busyAction === 'stopDomainMonitor' ? 'disabled' : ''}>${state.busyAction === 'stopDomainMonitor' ? 'Останавливаю...' : 'Остановить'}</button>`
            : `<button class="btn warning ${state.busyAction === 'startDomainMonitor' ? 'is-busy' : ''}" data-action="startDomainMonitor" ${state.busyAction === 'startDomainMonitor' ? 'disabled' : ''}>${state.busyAction === 'startDomainMonitor' ? 'Запускаю...' : 'Запустить'}</button>`}
          <button class="btn secondary ${state.busyAction === 'clearDomainMonitor' ? 'is-busy' : ''}" data-action="clearDomainMonitor" ${state.busyAction === 'clearDomainMonitor' ? 'disabled' : ''}>${state.busyAction === 'clearDomainMonitor' ? 'Очищаю...' : 'Очистить'}</button>
          <button class="btn secondary ${state.busyAction === 'refreshDomainMonitor' ? 'is-busy' : ''}" data-action="refreshDomainMonitor" ${state.busyAction === 'refreshDomainMonitor' ? 'disabled' : ''}>${state.busyAction === 'refreshDomainMonitor' ? 'Обновляю...' : 'Обновить'}</button>
          <button class="btn secondary" data-tab-jump="routing">Маршруты</button>
        </div>
      </div>
      <div class="domain-monitor-state ${running ? 'running' : 'stopped'}">
        <strong>${running ? 'SNI-монитор запущен' : 'SNI-монитор остановлен'}</strong>
        <span>${escapeHtml(monitor?.hint || 'Запуск включает сбор и чтение SNI/domain событий, остановка выключает мониторинг.')}</span>
      </div>
      ${running ? `<div class="settings-warning compact"><strong>Логи Xray</strong><span>Монитор читает access/DNS-логи для живых событий. Для постоянной работы выключите монитор и подробное логирование после проверки.</span></div>` : ''}
      ${domainMonitorStatusPanel()}
      <section class="stats route-stats domain-monitor-stats">
        ${stat('Источник', monitorSourceLabel(), `${monitor?.running ? 'монитор запущен' : 'лог-файл'}${sourcePath}`)}
        ${stat('События', stats.total || 0, `${stats.tcp || 0} TCP · ${stats.udp || 0} UDP`)}
        ${stat('Домены', filterCounts.domains || monitored.length || 0, topRealDomain ? `топ: ${topRealDomain.host} (${topRealDomain.hits})` : 'ожидаю доменные события')}
      </section>
      ${domainMonitorFilterBar()}
      ${selectedDevice ? `<div class="domain-monitor-device-filter">
        <div>
          <span>События выбранного устройства</span>
          <strong>${escapeHtml(selectedDevice.name || selectedDevice.ip)}</strong>
          <small>${escapeHtml(selectedDevice.ip)} · ${Number(monitoredEvents().length || 0).toLocaleString('ru-RU')} событий в текущем фильтре</small>
        </div>
        <button class="btn secondary compact" data-domain-clear-device>Показать все устройства</button>
      </div>` : ''}
      <div class="domain-monitor-toolbar">
        <input id="domainMonitorQuery" value="${escapeHtml(state.domainMonitorQuery)}" placeholder="Найти домен, устройство или протокол" />
        ${domainProbeTargetSelectHtml()}
        <button class="btn secondary compact" data-domain-clear-filter ${filterActive ? '' : 'disabled'}>Очистить фильтр</button>
        ${state.domainMonitorMode === 'domains' || state.domainMonitorMode === 'devices'
          ? `<button class="btn secondary compact ${state.busyAction === 'refreshDomainMonitor' ? 'is-busy' : ''}" data-action="refreshDomainMonitor" ${state.busyAction === 'refreshDomainMonitor' ? 'disabled' : ''}>${state.busyAction === 'refreshDomainMonitor' ? 'Обновляю...' : 'Обновить'}</button>`
          : ''}
        <div class="segmented compact">
          ${[
            ['hits', 'По частоте'],
            ['last', 'По времени'],
            ['name', 'A-Z']
          ].map(([value, label]) => `<button type="button" class="${state.domainMonitorSort === value ? 'active' : ''}" data-domain-sort="${value}">${label}</button>`).join('')}
        </div>
      </div>
      <div class="domain-monitor-mode segmented compact">
        ${[
          ['domains', 'Домены'],
          ['devices', 'Устройства'],
          ['events', 'События']
        ].map(([value, label]) => `<button type="button" class="${state.domainMonitorMode === value ? 'active' : ''}" data-domain-mode="${value}">${value === 'events' ? 'Live' : label}</button>`).join('')}
      </div>
      <div class="domain-monitor-events-controls">
        <div>
          <strong>${state.domainMonitorMode === 'events' ? 'Окно событий' : 'Окно списка'}</strong>
          <span>${state.domainMonitorMode === 'events'
            ? `${Number(monitoredEvents().length || 0).toLocaleString('ru-RU')} событий в текущем фильтре${state.domainMonitorPaused ? ' · обновление на паузе' : ''}`
            : `Список прокручивается отдельно от страницы${state.domainMonitorPaused ? ' · обновление на паузе' : ''}`}</span>
        </div>
        <div class="domain-monitor-events-actions">
          <button type="button" class="btn secondary compact ${state.domainMonitorPaused ? 'active' : ''}" data-domain-pause>${state.domainMonitorPaused ? 'Продолжить' : 'Пауза обновления'}</button>
          <div class="segmented compact">
            ${[
              ['compact', 'Компактно'],
              ['medium', 'Средне'],
              ['large', 'Высоко']
            ].map(([value, label]) => `<button type="button" class="${(state.domainMonitorListWindow || state.domainMonitorEventWindow) === value ? 'active' : ''}" data-domain-list-window="${value}">${label}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="diagnostic-list domain-monitor-list">
        ${domainMonitorRowsHtml(monitored, fallbackRows, rows)}
      </div>
    </section>
  `;
}



  return {
    diagnosticsDomainView,
    diagnosticsDomainMonitorView,
  };
}
