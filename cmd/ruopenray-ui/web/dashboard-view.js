import { noticeView } from './notice-view.js';

export function createDashboardView(deps) {
  const {
    state,
    labels,
    escapeHtml,
    routeStats,
    deviceStats,
    dnsStats,
    coreUpdateInfo,
    proxyOutbounds,
    deviceRules,
    outboundAddress,
    logsPanel,
    byteSize,
    fmtUptime,
    byteRate,
    numberValue,
    activeProxyTag,
    configOutbounds,
    releaseDate,
    coreReleaseBadge,
    outboundTransport,
    proxyDirectionSummary,
    proxyDirectionTitle,
    proxyDirectionDetail,
    dashboardProxyDirectionCards,
    checkForTag,
    checkLabel,
    checkMethodLabel,
    serverLocationChip = () => '',
    configHasUnappliedChanges,
  } = deps;

function dashboard() {
  const s = state.status || {};
  const c = s.config || {};
  const serviceRunning = Boolean(s.service?.running);
  const coreReady = Boolean(s.core?.available);
  const coreInfo = coreUpdateInfo();
  const activeConfig = s.config?.path || 'config.json';
  const configReady = hasDashboardConfigSurface(state.config, c);
  const liveSnapshot = configReady ? {
    routes: routeStats(),
    devices: deviceStats(),
    dns: dnsStats(),
    deviceRuleCount: deviceRules().length,
    lanDeviceCount: state.leases.length || deviceRules().length,
    proxyServers: proxyOutbounds()
  } : null;
  if (liveSnapshot) state.dashboardConfigSnapshot = liveSnapshot;
  const snapshot = liveSnapshot || state.dashboardConfigSnapshot || null;
  const routes = snapshot?.routes || { proxy: 0, direct: 0, block: 0, other: 0 };
  const devices = snapshot?.devices || { proxy: 0 };
  const dns = snapshot?.dns || { servers: 0, doh: 0 };
  const deviceRuleCount = snapshot?.deviceRuleCount || 0;
  const lanDeviceCount = snapshot?.lanDeviceCount ?? (configReady ? 0 : '…');
  const proxyServers = snapshot?.proxyServers || [];
  const loadingConfig = !snapshot && !configReady;
  const configDirty = typeof configHasUnappliedChanges === 'function' ? configHasUnappliedChanges() : false;
  return `
    <section class="dash-hero ${serviceRunning ? 'is-ok' : 'is-warn'}">
      <div class="dash-status">
        <span class="eyebrow">Ресурсы роутера</span>
        ${dashboardSystemStats(s.system)}
        ${noticeView(state, escapeHtml, { className: 'dash-notice' })}
        ${dashboardLogWarnings()}
      </div>
      ${configDirty ? `<div class="dash-actions">
        <button class="btn ${state.configTesting ? 'is-busy' : ''}" data-action="test" ${state.configTesting || state.configApplying ? 'disabled' : ''}>${state.configTesting ? 'Проверяю...' : 'Проверить черновик'}</button>
      </div>` : ''}
    </section>

    ${xrayCoreDashboard(s, coreReady, coreInfo)}

    <section class="flow-strip">
      ${flowStep('Устройства', lanDeviceCount, loadingConfig ? 'загружаем LAN и правила' : (state.leases.length ? `${deviceRuleCount} правил LAN · ${devices.proxy} через proxy` : `${devices.proxy} через proxy`))}
      ${flowStep('Маршруты', c.routingRules ?? (loadingConfig ? '…' : 0), loadingConfig ? 'загружаем правила' : `proxy ${routes.proxy} / direct ${routes.direct}`)}
      ${flowStep('Proxy', loadingConfig ? '…' : proxyServers.length, loadingConfig ? 'загружаем серверы' : (proxyServers[0] ? outboundAddress(proxyServers[0]) : 'не добавлен'))}
      ${flowStep('DNS', loadingConfig ? '…' : dns.servers, loadingConfig ? 'загружаем DNS' : (dns.doh ? `${dns.doh} DoH` : 'системный'))}
    </section>

    <div class="dashboard-layout">
      <div>
        <section class="panel">
          ${dashboardServerSwitch(proxyServers, { loading: loadingConfig })}
        </section>
        <section class="panel config-panel ${state.configExpanded ? 'is-open' : ''}">
          <div class="panel-title">
            <div><h2>Активная конфигурация</h2></div>
            <div class="split-actions">
              <button class="btn secondary" data-action="downloadConfig">Скачать JSON</button>
              <button class="btn secondary" data-action="downloadAnonymizedConfig">Обезличенный</button>
              <button class="btn secondary" data-action="toggleConfig">${state.configExpanded ? 'Свернуть' : 'Показать JSON'}</button>
              <button class="btn secondary" data-action="saveProfile">Сохранить профиль</button>
            </div>
          </div>
          ${state.configExpanded ? `<textarea id="jsonDraft" spellcheck="false">${escapeHtml(state.jsonDraft)}</textarea>` : `<p class="muted config-summary">${escapeHtml(activeConfig)} · ${c.inbounds ?? 0} входящих · ${c.outbounds ?? 0} исходящих · ${c.routingRules ?? 0} правил</p>`}
        </section>
      </div>
      <aside>
        ${logsPanel(true)}
      </aside>
    </div>
  `;
}

function dashboardLogWarnings() {
  const items = [];
  const level = String(state.loggingSettings?.appliedLevel || state.loggingSettings?.level || state.config?.log?.loglevel || '').toLowerCase();
  const accessLog = Boolean(state.loggingAccessLog || state.config?.log?.access);
  const dnsLog = Boolean(state.loggingDnsLog || state.config?.log?.dnsLog);
  const monitor = state.domainMonitor || {};
  const dnsmasqLogqueries = monitor?.dnsmasq?.logqueries === true;
  if (level === 'debug') {
    items.push('Xray пишет подробный debug-log. После проверки лучше вернуть warning или error.');
  } else if (level === 'info') {
    items.push('Xray пишет info-log. Для постоянной работы обычно тише warning или error.');
  }
  if (accessLog) items.push('Access-log включен: на активном трафике он быстро растет.');
  if (dnsLog) items.push('DNS-лог Xray включен: доменные ответы могут добавлять много строк.');
  if (monitor.running) items.push('SNI-монитор запущен: RuOpenRay читает access/DNS-логи для доменных событий.');
  if (dnsmasqLogqueries) items.push('dnsmasq logqueries включен: DNS-запросы пишутся в системный logread.');
  if (!items.length) return '';
  return `<div class="settings-warning compact dashboard-log-warning"><strong>Диагностика логов</strong><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`;
}

function stat(label, value, detail) {
  return `<article class="stat"><span>${label}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
}

function hasDashboardConfigSurface(config, statusConfig = {}) {
  if (!config || typeof config !== 'object') return false;
  const hasSurface = (
    Array.isArray(config.outbounds)
    || Array.isArray(config.inbounds)
    || (config.routing && typeof config.routing === 'object')
    || (config.dns && typeof config.dns === 'object')
  );
  if (!hasSurface) return false;
  const activeOutbounds = Number(statusConfig.outbounds || 0);
  const activeRules = Number(statusConfig.routingRules || 0);
  const localOutbounds = Array.isArray(config.outbounds) ? config.outbounds.length : 0;
  const localRules = Array.isArray(config.routing?.rules) ? config.routing.rules.length : 0;
  if (activeOutbounds > 0 && localOutbounds === 0) return false;
  if (activeRules > 0 && localRules === 0) return false;
  return true;
}

function dashboardSystemStats(system = {}) {
  const cpu = system.cpu || {};
  const memory = system.memory || {};
  const tcp = system.tcp || {};
  const conntrack = system.conntrack || {};
  const disk = system.disk || {};
  const traffic = system.traffic || {};
  const uptime = system.uptime || 0;
  const cpuValue = cpu.percent === null || cpu.percent === undefined ? (cpu.load1 || '—') : `${cpu.percent}%`;
  const cpuDetail = `load ${cpu.load1 || '—'} / ${cpu.load5 || '—'} / ${cpu.load15 || '—'}`;
  const memoryValue = memory.usedPercent || memory.usedPercent === 0 ? `${memory.usedPercent}%` : '—';
  const memoryDetail = `${byteSize(memory.available)} свободно`;
  const tcpValue = tcp.established || tcp.established === 0 ? tcp.established : '—';
  const sessionsValue = `${tcpValue}/${conntrack.ok ? (conntrack.udp || 0) : '—'}`;
  const sessionsDetail = `TCP активно / UDP conntrack`;
  const diskValue = disk.ok === false ? '—' : byteSize(disk.free);
  const diskDetail = disk.ok === false ? 'раздел не проверен' : `${disk.usedPercent || '—'} занято · ${disk.label || disk.path || '/'}`;
  return `
    <div class="router-health-metrics">
      ${metricStat('chip', 'CPU', cpuValue, cpuDetail)}
      ${metricStat('memory', 'RAM', memoryValue, memoryDetail)}
      ${metricStat('uptime', 'Аптайм', fmtUptime(uptime), 'роутер работает')}
      ${metricStat('storage', 'Место', diskValue, diskDetail)}
      ${metricStat('sessions', 'TCP/UDP', sessionsValue, sessionsDetail)}
      ${trafficMetricStat(traffic)}
    </div>
  `;
}

function trafficSeriesPath(samples, key, maxValue, width = 320, height = 104) {
  if (!samples.length || maxValue <= 0) return '';
  const step = samples.length > 1 ? width / (samples.length - 1) : width;
  return samples.map((sample, index) => {
    const x = Math.round(index * step * 10) / 10;
    const y = Math.round((height - (Math.min(maxValue, sample[key] || 0) / maxValue) * height) * 10) / 10;
    return `${index ? 'L' : 'M'}${x},${y}`;
  }).join(' ');
}

function trafficAreaPath(samples, key, maxValue, width = 320, height = 104) {
  const line = trafficSeriesPath(samples, key, maxValue, width, height);
  if (!line) return '';
  return `${line} L${width},${height} L0,${height} Z`;
}

function trafficMonitor(system = {}) {
  const traffic = system.traffic || {};
  const memory = system.memory || {};
  const conntrack = system.conntrack || {};
  const samples = state.trafficHistory.length ? state.trafficHistory : [{
    rxRate: numberValue(traffic.rxRate),
    txRate: numberValue(traffic.txRate)
  }];
  const maxRate = Math.max(1024, ...samples.map((sample) => Math.max(sample.rxRate || 0, sample.txRate || 0)));
  const yTicks = [maxRate, maxRate * 0.75, maxRate * 0.5, maxRate * 0.25, 0];
  const rxArea = trafficAreaPath(samples, 'rxRate', maxRate);
  const txLine = trafficSeriesPath(samples, 'txRate', maxRate);
  const rxLine = trafficSeriesPath(samples, 'rxRate', maxRate);
  const totalConnections = conntrack.ok ? conntrack.total : ((system.tcp?.total || 0) + (conntrack.udp || 0));
  return `
    <details class="traffic-monitor" open>
      <summary>
        <span>Монитор трафика</span>
        <strong>${escapeHtml(byteRate(traffic.rxRate))} прием · ${escapeHtml(byteRate(traffic.txRate))} отдача</strong>
      </summary>
      <div class="traffic-chart">
        <div class="traffic-y-axis">
          ${yTicks.map((tick) => `<span>${escapeHtml(byteRate(tick))}</span>`).join('')}
        </div>
        <svg viewBox="0 0 320 104" preserveAspectRatio="none" aria-label="График скорости трафика">
          <g class="traffic-grid">
            <path d="M0 0H320M0 26H320M0 52H320M0 78H320M0 104H320"></path>
          </g>
          ${rxArea ? `<path class="traffic-area-down" d="${rxArea}"></path>` : ''}
          ${rxLine ? `<path class="traffic-line-down" d="${rxLine}"></path>` : ''}
          ${txLine ? `<path class="traffic-line-up" d="${txLine}"></path>` : ''}
        </svg>
      </div>
      <div class="traffic-legend">
        <span><b class="down"></b>Скачивание</span>
        <span><b class="up"></b>Отдача</span>
      </div>
      <div class="traffic-details-grid">
        <article><span>Соединения</span><strong>${escapeHtml(totalConnections || '—')}</strong></article>
        <article><span>Память</span><strong>${escapeHtml(byteSize(memory.used))}</strong></article>
        <article><span>Скачано</span><strong>${escapeHtml(byteSize(traffic.rxBytes))}</strong></article>
        <article><span>Скачивание сейчас</span><strong>${escapeHtml(byteRate(traffic.rxRate))}</strong></article>
        <article><span>Отдано</span><strong>${escapeHtml(byteSize(traffic.txBytes))}</strong></article>
        <article><span>Отдача сейчас</span><strong>${escapeHtml(byteRate(traffic.txRate))}</strong></article>
      </div>
    </details>
  `;
}

function xrayStatsGroupLabel(key) {
  const labels = {
    proxy: 'Через proxy',
    direct: 'Напрямую',
    block: 'Блокировка',
    system: 'Системные',
    other: 'Другое'
  };
  return labels[key] || key;
}

function xrayStatsSeriesPath(samples, key, maxValue, width = 320, height = 92) {
  if (!samples.length || maxValue <= 0) return '';
  const step = samples.length > 1 ? width / (samples.length - 1) : width;
  return samples.map((sample, index) => {
    const x = Math.round(index * step * 10) / 10;
    const y = Math.round((height - (Math.min(maxValue, sample[key] || 0) / maxValue) * height) * 10) / 10;
    return `${index ? 'L' : 'M'}${x},${y}`;
  }).join(' ');
}

function xrayActiveStats(stats = {}) {
  const outbounds = Array.isArray(stats.outbounds) ? stats.outbounds : [];
  const active = state.activeServerTag || activeProxyTag();
  return outbounds.find((item) => item.tag === active) || outbounds.find((item) => item.kind === 'proxy') || null;
}

function xrayStatsOutboundConfig(tag) {
  return configOutbounds().find((outbound) => outbound?.tag === tag) || null;
}

function xrayStatsOutbound(tag, stats = state.status?.xrayStats || {}) {
  if (!stats.enabled || !Array.isArray(stats.outbounds)) return null;
  return stats.outbounds.find((item) => item.tag === tag) || null;
}

function xrayStatsTotals(stats = {}) {
  const outbounds = Array.isArray(stats.outbounds) ? stats.outbounds : [];
  const source = outbounds.length ? outbounds : Object.values(stats.groups || {});
  return source.reduce((total, item) => ({
    downlink: total.downlink + numberValue(item?.downlink),
    uplink: total.uplink + numberValue(item?.uplink),
    downRate: total.downRate + numberValue(item?.downRate),
    upRate: total.upRate + numberValue(item?.upRate)
  }), { downlink: 0, uplink: 0, downRate: 0, upRate: 0 });
}

function xrayStatsPeriodLabel() {
  if (state.xrayStatsResetAt) {
    return `с последнего сброса ${new Date(state.xrayStatsResetAt).toLocaleString('ru-RU')}`;
  }
  return 'с начала запуска Xray';
}

function xrayDashboardStats(stats = state.status?.xrayStats || {}) {
  if (stats.enabled !== true) return '';
  const totals = xrayStatsTotals(stats);
  const groups = stats.groups || {};
  const active = xrayActiveStats(stats);
  const proxyTraffic = groups.proxy || {};
  const directTraffic = groups.direct || {};
  const blockTraffic = groups.block || {};
  const directTrafficText = `${byteSize(directTraffic.downlink)} принято · ${byteSize(directTraffic.uplink)} отправлено`;
  const blockTrafficText = `${byteSize(blockTraffic.downlink)} принято · ${byteSize(blockTraffic.uplink)} отброшено`;
  return `
    <section class="xray-dashboard-strip">
      <article>
        <span>Активный сервер</span>
        <strong>${escapeHtml(active?.tag || 'не выбран')}</strong>
        <small>${escapeHtml(active ? `прием ${byteRate(active.downRate)} · отдача ${byteRate(active.upRate)}` : 'нет данных')}</small>
      </article>
      <article>
        <span>Proxy-трафик</span>
        <strong>${escapeHtml(`${byteSize(proxyTraffic.downlink)} принято · ${byteSize(proxyTraffic.uplink)} отправлено`)}</strong>
        <small>${escapeHtml(`${byteRate(proxyTraffic.downRate)} прием · ${byteRate(proxyTraffic.upRate)} отдача · ${xrayStatsPeriodLabel()}`)}</small>
      </article>
      <article>
        <span>Напрямую / блокировка</span>
        <strong>Напрямую: ${escapeHtml(directTrafficText)}</strong>
        <small>${escapeHtml(`Блокировка: ${blockTrafficText} · всего сейчас: прием ${byteRate(totals.downRate)} · отдача ${byteRate(totals.upRate)}`)}</small>
      </article>
    </section>
  `;
}

function xrayCoreDashboard(status = state.status || {}, available, info) {
  const detail = status.core?.version || 'xray не проверен';
  const latestText = info.target
    ? `${info.target.prerelease ? 'Последний pre-release' : 'Последний stable'}: ${escapeHtml(info.target.tag)} · ${releaseDate(info.target)}`
    : 'Список релизов не загружен';
  const coreStatus = !available ? 'Нужно установить' : info.hasUpdate ? 'Есть обновление' : 'Stable актуален';
  const stats = status.xrayStats || {};
  const statsEnabled = stats.enabled === true;
  const totals = xrayStatsTotals(stats);
  const groups = stats.groups || {};
  const proxyTraffic = groups.proxy || {};
  const directTraffic = groups.direct || {};
  const blockTraffic = groups.block || {};
  const active = xrayActiveStats(stats);
  const activeAddress = active?.tag ? outboundAddress(xrayStatsOutboundConfig(active.tag)) : '';
  const directBlockText = `Напрямую: ${byteSize(directTraffic.downlink)} принято · ${byteSize(directTraffic.uplink)} отправлено`;
  const directBlockDetail = `Блокировка: ${byteSize(blockTraffic.downlink)} принято · ${byteSize(blockTraffic.uplink)} отброшено · всего сейчас ${byteRate(totals.downRate)} прием · ${byteRate(totals.upRate)} отдача`;
  const proxyTrafficText = `${byteSize(proxyTraffic.downlink)} принято · ${byteSize(proxyTraffic.uplink)} отправлено`;
  const proxyTrafficRateText = `${byteRate(proxyTraffic.downRate)} прием · ${byteRate(proxyTraffic.upRate)} отдача`;
  return `
    <section class="panel xray-core-card ${info.hasUpdate ? 'has-update' : ''}">
      <div class="xray-core-head">
        <div>
          <span class="eyebrow">Xray</span>
          <h2>${available ? labels.available : labels.missing}</h2>
          <p>${escapeHtml(detail)}</p>
        </div>
        <div class="core-stat-tools">
          ${info.target ? coreReleaseBadge(info.target) : ''}
          <button class="core-icon-action" type="button" data-action="${available ? 'openCoreDialog' : 'openInstallWizard'}" ${state.coreUpdating ? 'disabled' : ''} title="${available ? 'Выбрать версию Xray' : 'Установить Xray'}" aria-label="${available ? 'Выбрать версию Xray' : 'Установить Xray'}">⚙</button>
        </div>
      </div>
      <div class="xray-core-status">
        <strong>${escapeHtml(coreStatus)}</strong>
        <span>${latestText}</span>
      </div>
      ${state.coreUpdate ? `<small class="core-stat-result">${state.coreUpdate.ok ? 'Готово' : 'Ошибка'} · ${escapeHtml(state.coreUpdate.after || state.coreUpdate.stderr || '')}</small>` : ''}
      <div class="xray-core-metrics">
        <article>
          <span>Активный сервер</span>
          <strong>${escapeHtml(active?.tag || activeProxyTag() || 'не выбран')}</strong>
          <small>${escapeHtml(statsEnabled && active ? `${activeAddress || 'outbound'} · ${byteRate(active.downRate)} прием · ${byteRate(active.upRate)} отдача` : 'статистика Xray выключена')}</small>
        </article>
        <article>
          <span>Proxy-трафик</span>
          <strong>${escapeHtml(statsEnabled ? proxyTrafficText : 'нет данных')}</strong>
          <small>${escapeHtml(statsEnabled ? `${proxyTrafficRateText} · ${xrayStatsPeriodLabel()}` : 'включается в диагностике или кнопкой ниже')}</small>
        </article>
        <article>
          <span>Напрямую / блокировка</span>
          <strong>${escapeHtml(statsEnabled ? directBlockText : 'нет данных')}</strong>
          <small>${escapeHtml(statsEnabled ? directBlockDetail : 'без учета трафика по outbound')}</small>
        </article>
      </div>
      ${statsEnabled ? '' : `<div class="xray-core-foot"><button class="btn secondary" type="button" data-action="enableXrayStats">Включить статистику Xray</button></div>`}
    </section>
  `;
}

function serverTrafficView(tag, className = '') {
  const stats = state.status?.xrayStats || {};
  const traffic = xrayStatsOutbound(tag, stats);
  const share = traffic && Array.isArray(stats.outbounds)
    ? xrayStatsShare(traffic, stats.outbounds, 'downlink')
    : 0;
  return `<div class="server-traffic ${className} ${traffic ? '' : 'muted'}">
    ${traffic ? `
      <span>Статистика Xray</span>
      <strong>${escapeHtml(byteRate(traffic.downRate))} прием · ${escapeHtml(byteRate(traffic.upRate))} отдача</strong>
      <small>${escapeHtml(byteSize(traffic.downlink))} принято · ${escapeHtml(byteSize(traffic.uplink))} отправлено</small>
      <i class="xray-traffic-bar"><em style="width:${share}%"></em></i>
    ` : `
      <span>Статистика Xray</span>
      <strong>${stats.enabled === false ? 'учет выключен' : 'нет счетчика'}</strong>
      <small>${stats.enabled === false ? 'включается в диагностике' : 'ждем данные направления'}</small>
    `}
  </div>`;
}

function xrayStatsShare(item, outbounds, field) {
  const total = outbounds.reduce((sum, outbound) => sum + numberValue(outbound?.[field]), 0);
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((numberValue(item?.[field]) / total) * 100)));
}

function xrayActiveGraph(active) {
  if (!active) return '';
  const outbound = xrayStatsOutboundConfig(active.tag);
  const samples = state.xrayTrafficHistory.filter((item) => item.tag === active.tag);
  const fallback = [{ downRate: numberValue(active.downRate), upRate: numberValue(active.upRate) }];
  const series = samples.length ? samples : fallback;
  const maxRate = Math.max(1024, ...series.map((sample) => Math.max(sample.downRate || 0, sample.upRate || 0)));
  const downLine = xrayStatsSeriesPath(series, 'downRate', maxRate);
  const upLine = xrayStatsSeriesPath(series, 'upRate', maxRate);
  return `
    <article class="xray-active-graph">
      <div>
        <span>Активный сервер</span>
        <strong>${escapeHtml(active.tag)}</strong>
        <small>${escapeHtml(outboundAddress(outbound))}</small>
        <small>${escapeHtml(byteRate(active.downRate))} прием · ${escapeHtml(byteRate(active.upRate))} отдача</small>
      </div>
      <svg viewBox="0 0 320 92" preserveAspectRatio="none" aria-label="График активного сервера">
        <path class="traffic-grid" d="M0 0H320M0 23H320M0 46H320M0 69H320M0 92H320"></path>
        ${downLine ? `<path class="traffic-line-down" d="${downLine}"></path>` : ''}
        ${upLine ? `<path class="traffic-line-up" d="${upLine}"></path>` : ''}
      </svg>
    </article>
  `;
}

function xrayStatsPanel(stats = {}) {
  const enabled = stats.enabled === true;
  const settings = stats.settings || {};
  const groups = stats.groups || {};
  const outbounds = Array.isArray(stats.outbounds) ? stats.outbounds : [];
  const active = xrayActiveStats(stats);
  const totals = xrayStatsTotals(stats);
  const warning = stats.ok === false ? `<p class="settings-warning compact"><strong>Xray API</strong><span>${escapeHtml(stats.stderr || 'Не удалось прочитать статистику Xray')}</span></p>` : '';
  if (!enabled) {
    return `
      <section class="panel xray-stats-panel">
        <div class="panel-title">
          <div>
            <h2>Статистика Xray</h2>
            <span>Счетчики направлений выключены, чтобы не добавлять лишнюю нагрузку на слабые роутеры.</span>
          </div>
          <button class="btn warning" data-action="enableXrayStats">Включить статистику</button>
        </div>
        <p class="settings-warning compact"><strong>Нужен перезапуск Xray</strong><span>RuOpenRay добавит счетчики, policy и локальный StatsService API в активную конфигурацию.</span></p>
      </section>
    `;
  }
  return `
    <section class="panel xray-stats-panel">
      <div class="panel-title">
        <div>
          <h2>Статистика Xray</h2>
          <span>Трафик считается по направлениям с начала запуска Xray или последнего сброса.</span>
        </div>
        <div class="split-actions">
          <button class="btn secondary" data-action="resetXrayStats">Сбросить счетчики</button>
          <button class="btn secondary" data-action="disableXrayStats">Выключить</button>
        </div>
      </div>
      <div class="xray-stats-meta">
        <span>API: ${escapeHtml(settings.server || stats.server || '127.0.0.1:10085')}</span>
        <span>Период: ${escapeHtml(xrayStatsPeriodLabel())}</span>
        <span>${escapeHtml(stats.updatedAt ? new Date(stats.updatedAt).toLocaleTimeString('ru-RU') : 'ожидаем данные')}</span>
      </div>
      <p class="settings-warning compact"><strong>Дополнительная нагрузка</strong><span>Xray хранит счетчики направлений в памяти и обновляет их во время работы. На слабом роутере выключайте статистику, если она не нужна постоянно.</span></p>
      ${warning}
      <div class="xray-total-grid">
        <article>
          <span>Всего с запуска</span>
          <strong>${escapeHtml(byteSize(totals.downlink))} принято</strong>
          <small>${escapeHtml(byteSize(totals.uplink))} отправлено</small>
        </article>
        <article>
          <span>Скорость сейчас</span>
          <strong>${escapeHtml(byteRate(totals.downRate))} прием</strong>
          <small>${escapeHtml(byteRate(totals.upRate))} отдача</small>
        </article>
        <article>
          <span>Активный сервер</span>
          <strong>${escapeHtml(active?.tag || 'не выбран')}</strong>
          <small>${escapeHtml(active ? `прием ${byteRate(active.downRate)} · отдача ${byteRate(active.upRate)}` : 'нет данных')}</small>
        </article>
      </div>
      <div class="xray-group-grid">
        ${['proxy', 'direct', 'block'].map((key) => {
          const group = groups[key] || {};
          return `<article>
            <span>${escapeHtml(xrayStatsGroupLabel(key))}</span>
            <strong>${escapeHtml(byteSize(group.downlink))} принято</strong>
            <small>${escapeHtml(`прием ${byteRate(group.downRate)} · отдача ${byteRate(group.upRate)}`)}</small>
          </article>`;
        }).join('')}
      </div>
      ${xrayActiveGraph(active)}
      <div class="xray-outbound-list">
        ${outbounds.length ? outbounds.map((item) => {
          const outbound = xrayStatsOutboundConfig(item.tag);
          const share = xrayStatsShare(item, outbounds, 'downlink');
          return `<article class="${active?.tag === item.tag ? 'active' : ''}">
          <div>
            <strong>${escapeHtml(item.tag || 'outbound')}</strong>
            <span>${escapeHtml(outboundAddress(outbound))}</span>
            <small>${escapeHtml(item.protocol || item.kind || 'xray')} · ${escapeHtml(item.kind || 'proxy')}</small>
            <i class="xray-traffic-bar"><em style="width:${share}%"></em></i>
          </div>
          <div>
            <b>${escapeHtml(byteRate(item.downRate))}</b>
            <small>прием · ${escapeHtml(byteSize(item.downlink))}</small>
          </div>
          <div>
            <b>${escapeHtml(byteRate(item.upRate))}</b>
            <small>отдача · ${escapeHtml(byteSize(item.uplink))}</small>
          </div>
        </article>`;
        }).join('') : '<p class="muted">Счетчики пока пустые. Дайте Xray немного трафика или проверьте, что в конфигурации включена статистика направлений.</p>'}
      </div>
    </section>
  `;
}

function metricIcon(kind) {
  const icons = {
    chip: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"></rect><path d="M4 9h3M4 15h3M17 9h3M17 15h3M9 4v3M15 4v3M9 17v3M15 17v3"></path></svg>',
    memory: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12v10H6z"></path><path d="M8 3v4M12 3v4M16 3v4M8 17v4M12 17v4M16 17v4M3 9h3M3 15h3M18 9h3M18 15h3"></path></svg>',
    sessions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h8a4 4 0 0 1 0 8h-2"></path><path d="M16 17H8a4 4 0 0 1 0-8h2"></path></svg>',
    uptime: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"></circle><path d="M12 8v4l3 2"></path></svg>',
    storage: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7c0-1.1 3.1-2 7-2s7 .9 7 2-3.1 2-7 2-7-.9-7-2z"></path><path d="M5 7v5c0 1.1 3.1 2 7 2s7-.9 7-2V7"></path><path d="M5 12v5c0 1.1 3.1 2 7 2s7-.9 7-2v-5"></path></svg>',
    traffic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17V5"></path><path d="M4 8l3-3 3 3"></path><path d="M17 7v12"></path><path d="M14 16l3 3 3-3"></path></svg>'
  };
  return icons[kind] || icons.chip;
}

function metricStat(kind, label, value, detail) {
  return `<span class="metric-stat">
    <span class="metric-icon">${metricIcon(kind)}</span>
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  </span>`;
}

function trafficMetricStat(traffic = {}) {
  const iface = traffic.interface || 'WAN';
  return `<span class="metric-stat traffic-metric">
    <span class="metric-icon">${metricIcon('traffic')}</span>
    <div>
      <span>Трафик · ${escapeHtml(iface)}</span>
      <strong>${escapeHtml(byteSize(traffic.rxBytes))} принято</strong>
      <small>${escapeHtml(byteRate(traffic.rxRate))} прием</small>
      <strong>${escapeHtml(byteSize(traffic.txBytes))} отправлено</strong>
      <small>${escapeHtml(byteRate(traffic.txRate))} отдача</small>
    </div>
  </span>`;
}

function coreStat(available, detail, info) {
  const latestText = info.target
    ? `${info.target.prerelease ? 'Последний pre-release' : 'Последний stable'}: ${escapeHtml(info.target.tag)} · ${releaseDate(info.target)}`
    : 'Список релизов не загружен';
  const status = !available ? 'Нужно установить' : info.hasUpdate ? 'Есть обновление' : 'Stable актуален';
  return `
    <article class="stat core-stat ${info.hasUpdate ? 'has-update' : ''}">
      <div class="core-stat-head">
        <span>Ядро</span>
        <div class="core-stat-tools">
          ${info.target ? coreReleaseBadge(info.target) : ''}
          <button class="core-icon-action" type="button" data-action="${available ? 'openCoreDialog' : 'openInstallWizard'}" ${state.coreUpdating ? 'disabled' : ''} title="${available ? 'Выбрать версию Xray' : 'Установить Xray'}" aria-label="${available ? 'Выбрать версию Xray' : 'Установить Xray'}">⚙</button>
        </div>
      </div>
      <strong>${available ? labels.available : labels.missing}</strong>
      <small>${escapeHtml(detail)}</small>
      <div class="core-stat-meta">
        <b>${status}</b>
        <em>${latestText}</em>
      </div>
      ${state.coreUpdate ? `<small class="core-stat-result">${state.coreUpdate.ok ? 'Готово' : 'Ошибка'} · ${escapeHtml(state.coreUpdate.after || state.coreUpdate.stderr || '')}</small>` : ''}
    </article>
  `;
}

function flowStep(label, value, detail) {
  return `<article class="flow-step"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
}

function quickAction(title, detail, tab) {
  return `
    <button class="quick-action" data-tab-jump="${tab}">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(detail)}</span>
    </button>
  `;
}

function isCheckingServer(tag) {
  return state.serverChecking && (!state.serverCheckingTags.length || state.serverCheckingTags.includes(tag));
}

function dashboardServerActionIcon(icon) {
  const icons = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>',
    connect: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
    active: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  };
  return icons[icon] || '';
}

function dashboardServerActionButton({ label, icon, tone = 'secondary', attrs = '', busy = false, disabled = false }) {
  const safeLabel = escapeHtml(label);
  return `<button type="button" class="server-action-icon dashboard-server-action ${tone} ${busy ? 'is-busy' : ''}" ${attrs} ${disabled ? 'disabled' : ''} title="${safeLabel}" aria-label="${safeLabel}">
    ${dashboardServerActionIcon(icon)}
  </button>`;
}

function dashboardServerActionState(label) {
  const safeLabel = escapeHtml(label);
  return `<span class="server-action-icon dashboard-server-action active" title="${safeLabel}" aria-label="${safeLabel}" role="status">
    ${dashboardServerActionIcon('active')}
  </span>`;
}

function serverCheckButton(tag, extraClass = '') {
  const busy = isCheckingServer(tag);
  if ((extraClass || '').includes('compact-action')) {
    return dashboardServerActionButton({
      label: busy ? 'Проверяю сервер' : 'Проверить сервер',
      icon: 'check',
      attrs: `data-server-check="${escapeHtml(tag)}"`,
      busy,
      disabled: busy
    });
  }
  return `<button class="btn secondary ${extraClass}" data-server-check="${escapeHtml(tag)}" ${busy ? 'disabled' : ''}>Проверить</button>`;
}

function checkModeLabel(mode) {
  return mode === 'endpoint' ? 'порт сервера' : 'HTTP через прокси';
}

function rulesCountLabel(count) {
  const value = Number(count) || 0;
  const mod10 = Math.abs(value) % 10;
  const mod100 = Math.abs(value) % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} правило`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} правила`;
  return `${value} правил`;
}

function dashboardCheckBadge(check) {
  if (!check) return { label: 'не проверен', tone: 'warn' };
  if (check.httpOk === false) return { label: check.endpointOk ? 'порт открыт · HTTP нет' : 'HTTP нет', tone: 'bad' };
  if (check.ok) return { label: checkLabel(check), tone: 'ok' };
  if (check.endpointOk) return { label: 'порт открыт', tone: 'warn' };
  if (check.pingOk) return { label: 'ping есть', tone: 'warn' };
  return { label: 'нет ответа', tone: 'bad' };
}

function dashboardCheckDetail(check, outbound) {
  const parts = [outboundTransport(outbound)];
  if (check) {
    if (check.endpointOk && check.httpOk === false) parts.push('порт открыт');
    else parts.push(checkMethodLabel(check));
  }
  return parts.filter(Boolean).join(' · ');
}

function dashboardCheckSummary(check) {
  if (!check) {
    return {
      label: 'не проверен',
      title: 'ping не проверен · порт не проверен · HTTP не проверен',
      tone: 'warn'
    };
  }
  const ping = check.pingOk === true
    ? `ping ${check.pingLatencyMs || 0} мс`
    : check.pingOk === false ? 'ping нет' : 'ping не проверен';
  const tcp = check.endpointOk === true
    ? 'порт открыт'
    : check.endpointOk === false ? 'порт закрыт' : 'порт не проверен';
  const http = check.httpOk === true
    ? `HTTP ${check.httpLatencyMs || check.latencyMs || 0} мс`
    : check.httpOk === false || check.method === 'http' ? 'HTTP нет' : 'HTTP не проверен';
  return {
    label: [ping, tcp, http].join(' · '),
    title: [ping, tcp, http].join(' · '),
    tone: check.httpOk === false ? 'bad' : (check.ok ? 'ok' : (check.endpointOk || check.pingOk ? 'warn' : 'bad'))
  };
}

function dashboardOutboundFlow(outbound) {
  const protocol = outbound?.protocol;
  if (protocol === 'vless' || protocol === 'vmess') {
    return outbound?.settings?.vnext?.[0]?.users?.[0]?.flow || '';
  }
  if (protocol === 'trojan' || protocol === 'shadowsocks') {
    return outbound?.settings?.servers?.[0]?.flow || '';
  }
  return '';
}

function dashboardServerTech(outbound) {
  const protocol = outbound?.protocol || 'xray';
  const parts = [protocol.toUpperCase(), outboundTransport(outbound)];
  const flow = dashboardOutboundFlow(outbound);
  if (flow) parts.push(`flow ${flow}`);
  return parts.filter(Boolean).join(' · ');
}

function operationProgressView() {
  if (state.configApplying) {
    return `
      <div class="operation-progress apply-progress" role="status">
        <span>Применяю конфигурацию</span>
        <strong>Проверка, запись и перезапуск Xray</strong>
        <i></i>
      </div>
    `;
  }
  if (state.configTesting) {
    return `
      <div class="operation-progress check-progress" role="status">
        <span>Проверяю конфигурацию</span>
        <strong>Xray читает временный config без применения</strong>
        <i></i>
      </div>
    `;
  }
  if (state.firewallSaving) {
    return `
      <div class="operation-progress apply-progress" role="status">
        <span>Применяю firewall</span>
        <strong>Записываю nftables и проверяю состояние перехвата</strong>
        <i></i>
      </div>
    `;
  }
  if (state.serverChecking) {
    const count = state.serverCheckingTags.length || proxyOutbounds().length;
    return `
      <div class="operation-progress server-progress" role="status">
        <span>Проверяю прокси</span>
        <strong>${escapeHtml(`${count} ${count === 1 ? 'сервер' : 'серверов'} через ${checkModeLabel(state.serverCheckMode)}`)}</strong>
        <i></i>
      </div>
    `;
  }
  return '';
}

function dashboardServerSwitch(servers, options = {}) {
  const active = activeProxyTag();
  const summary = proxyDirectionSummary();
  if (!servers.length) {
    if (options.loading) {
      return `
        <div class="dashboard-action-block">
          <div class="dashboard-action-head">
            <div>
              <strong>Proxy-направления</strong>
              <span>Загружаем список серверов из активной конфигурации.</span>
            </div>
          </div>
        </div>
      `;
    }
    return `
      <div class="dashboard-action-block">
        <div class="dashboard-action-head">
          <div>
            <strong>Proxy-направления</strong>
            <span>Серверы пока не добавлены.</span>
          </div>
          <button class="btn secondary" data-import-dialog="choose">Добавить</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="dashboard-action-block">
      <div class="dashboard-action-head">
        <div>
          <strong>${escapeHtml(proxyDirectionTitle(summary))}</strong>
          <span>${escapeHtml(proxyDirectionDetail(summary))}</span>
        </div>
        <button class="btn secondary" data-import-dialog="choose">Добавить</button>
      </div>
      ${dashboardProxyDirectionCards(summary)}
      <div class="dashboard-server-switch">
        ${servers.slice(0, 5).map((outbound) => {
          const tag = outbound?.tag || '';
          const direction = summary.outbounds.get(tag);
          const activeServer = Boolean(direction) || (!summary.outbounds.size && !summary.balancers.size && tag === active);
          const selectedServer = state.dashboardSelectedServerTag === tag && !activeServer;
          const check = checkForTag(tag);
          const checkSummary = dashboardCheckSummary(check);
          const connecting = state.pendingServerTag === tag;
          const stateLabel = activeServer ? (direction?.rules ? rulesCountLabel(direction.rules) : 'Текущий') : selectedServer ? 'Выбран' : 'Сервер';
          const action = activeServer
            ? dashboardServerActionState(summary.outbounds.size > 1 || summary.balancers.size ? 'В маршрутах' : 'Активный сервер')
            : dashboardServerActionButton({ label: connecting ? 'Подключаю сервер' : 'Подключиться', icon: 'connect', tone: 'warning', attrs: `data-dashboard-connect="${escapeHtml(tag)}"`, busy: connecting, disabled: connecting });
          return `<article class="dashboard-server-option ${activeServer ? 'active' : ''} ${selectedServer ? 'selected' : ''}">
            <button type="button" class="server-option-pick" ${activeServer || connecting ? 'disabled' : `data-dashboard-select="${escapeHtml(tag)}"`}>
              <span class="server-option-state ${activeServer ? 'active' : selectedServer ? 'selected' : ''}">${stateLabel}</span>
              <span class="server-option-main">
                <strong>${serverLocationChip(outbound)}${escapeHtml(tag || 'server')}</strong>
                <small>${escapeHtml(outboundAddress(outbound))}</small>
              </span>
              ${serverTrafficView(tag, 'dashboard-server-traffic')}
              <span class="server-option-side">
                <span class="server-check-pill ${checkSummary.tone}" title="${escapeHtml(checkSummary.title || checkSummary.label)}">${escapeHtml(checkSummary.label)}</span>
                <small class="server-option-tech">${escapeHtml(dashboardServerTech(outbound))}</small>
              </span>
            </button>
            <span class="server-option-actions">
              ${serverCheckButton(tag, 'compact-action')}
              ${action}
            </span>
          </article>`;
        }).join('')}
      </div>
    </div>
  `;
}

  return {
    checkModeLabel,
    coreStat,
    dashboard,
    dashboardServerSwitch,
    dashboardSystemStats,
    flowStep,
    isCheckingServer,
    metricIcon,
    metricStat,
    operationProgressView,
    quickAction,
    serverCheckButton,
    serverTrafficView,
    stat,
    trafficMetricStat,
    trafficMonitor,
    xrayActiveGraph,
    xrayActiveStats,
    xrayCoreDashboard,
    xrayDashboardStats,
    xrayStatsGroupLabel,
    xrayStatsOutbound,
    xrayStatsOutboundConfig,
    xrayStatsPanel,
    xrayStatsPeriodLabel,
    xrayStatsSeriesPath,
    xrayStatsShare,
    xrayStatsTotals,
  };
}
