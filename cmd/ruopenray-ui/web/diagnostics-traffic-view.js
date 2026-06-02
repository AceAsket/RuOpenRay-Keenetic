export function createDiagnosticsTrafficView(deps) {
  const {
    accessLogRows,
    accessLogTable,
    aggregateLogDomains,
    burstObservatoryConfig,
    burstObservatorySelectors,
    byteRate,
    byteSize,
    checkForTag,
    configInbounds,
    deviceRules,
    domainDiagnosticRows,
    domainMonitorDevicesText,
    domainMonitorDomainQuality,
    domainMonitorFilterCounts,
    domainMonitorHost,
    domainMonitorMatchesFilter,
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
    stat,
    state,
    strategyObserverType,
    trafficMonitor,
    xrayActiveStats,
    xrayStatsPanel,
    xrayStatsTotals,
  } = deps;

function diagnosticsTrafficView() {
  const system = state.status?.system || {};
  const traffic = system.traffic || {};
  const conntrack = system.conntrack || {};
  const xrayStats = state.status?.xrayStats || {};
  const totals = xrayStatsTotals(xrayStats);
  const active = xrayActiveStats(xrayStats);
  const totalConnections = conntrack.ok ? conntrack.total : ((system.tcp?.total || 0) + (conntrack.udp || 0));
  return `
    <section class="traffic-overview-panel">
      <article class="traffic-overview-main">
        <span>Активный сервер Xray</span>
        <strong>${escapeHtml(active?.tag || 'статистика выключена')}</strong>
        <small>${escapeHtml(active ? `прием ${byteRate(active.downRate)} · отдача ${byteRate(active.upRate)}` : 'включите статистику Xray, чтобы видеть трафик по серверам')}</small>
      </article>
      <article>
        <span>Через proxy</span>
        <strong>${escapeHtml(byteRate(xrayStats.groups?.proxy?.downRate))} прием</strong>
        <small>${escapeHtml(`${byteSize(xrayStats.groups?.proxy?.downlink)} принято · ${byteSize(xrayStats.groups?.proxy?.uplink)} отправлено`)}</small>
      </article>
      <article>
        <span>WAN-интерфейс</span>
        <strong>${escapeHtml(traffic.interface || '—')}</strong>
        <small>${escapeHtml(traffic.interface ? `прием ${byteRate(traffic.rxRate)} · отдача ${byteRate(traffic.txRate)}` : 'системный счетчик пока пустой')}</small>
      </article>
      <article>
        <span>Соединения</span>
        <strong>${escapeHtml(totalConnections || totalConnections === 0 ? totalConnections : '—')}</strong>
        <small>${escapeHtml(conntrack.ok ? `${conntrack.tcp || 0} TCP · ${conntrack.udp || 0} UDP` : 'conntrack недоступен')}</small>
      </article>
    </section>
    ${xrayStatsPanel(xrayStats)}
    <section class="panel traffic-system-panel">
      <div class="panel-title">
        <div>
          <h2>Системный трафик интерфейса</h2>
          <span>WAN-график показывает общий трафик выбранного интерфейса. Для VPN смотрите статистику Xray выше.</span>
        </div>
        <span class="traffic-period-pill">Через Xray: ${escapeHtml(byteSize(totals.downlink))} принято · ${escapeHtml(byteSize(totals.uplink))} отправлено</span>
      </div>
      ${trafficMonitor(system)}
    </section>
  `;
}

function clientTrafficTestView() {
  const baseline = state.clientTrafficBaseline;
  const result = state.clientTrafficResult;
  return `
    <section class="panel client-traffic-test">
      <div class="panel-title">
        <div>
          <h2>Клиентский тест трафика</h2>
          <span>Самый честный тест transparent proxy: открыть URL с телефона/ПК в LAN и проверить, выросли ли nft/Xray счетчики.</span>
        </div>
        <div class="split-actions">
          <button class="btn secondary ${state.busyAction === 'startClientTrafficTest' ? 'is-busy' : ''}" type="button" data-action="startClientTrafficTest" ${state.busyAction === 'startClientTrafficTest' ? 'disabled' : ''}>${state.busyAction === 'startClientTrafficTest' ? 'Начинаю...' : 'Начать замер'}</button>
          <button class="btn warning ${state.busyAction === 'finishClientTrafficTest' ? 'is-busy' : ''}" type="button" data-action="finishClientTrafficTest" ${baseline && state.busyAction !== 'finishClientTrafficTest' ? '' : 'disabled'}>${state.busyAction === 'finishClientTrafficTest' ? 'Проверяю...' : 'Проверить после клиента'}</button>
        </div>
      </div>
      <div class="client-test-grid">
        <article>
          <strong>1. Начните замер</strong>
          <span>RuOpenRay запомнит текущие nftables и Xray stats.</span>
        </article>
        <article>
          <strong>2. Откройте с LAN-устройства</strong>
          <code>${escapeHtml(state.clientTrafficUrl)}</code>
        </article>
        <article>
          <strong>3. Проверьте результат</strong>
          <span>${baseline ? `точка отсчета: ${new Date(baseline.at).toLocaleTimeString('ru-RU')}` : 'сначала нажмите “Начать замер”'}</span>
        </article>
      </div>
      <div class="form-row">
        <label>URL для LAN-устройства</label>
        <input id="clientTrafficUrl" value="${escapeHtml(state.clientTrafficUrl)}" placeholder="https://www.gstatic.com/generate_204" />
      </div>
      ${result ? `<div class="setup-result ${result.ok ? 'ok' : 'bad'}">
        <strong>${result.ok ? 'Трафик идет через цепочку' : 'Рост счетчиков не найден'}</strong>
        <span>nft +${byteSize(result.nftDelta)} · Xray stats +${byteSize(result.statsDelta)}${result.statsEnabled ? '' : ' · учет Xray stats выключен'}${result.activeTag ? ` · активный proxy: ${escapeHtml(result.activeTag)}` : ''}</span>
      </div>` : '<p class="muted">Для проверки нужен реальный LAN-клиент. Запрос с самого роутера может идти другим путем и не доказывает работу перехвата.</p>'}
    </section>
  `;
}

function dpiCheckTone(check) {
  if (!check) return 'pending';
  if (check.skipped) return 'skipped';
  if (check.ok) return 'ok';
  const code = String(check.code || '');
  if (code.includes('block') || code.includes('rst') || code.includes('drop') || code.includes('fail')) return 'bad';
  return 'warn';
}

function dpiCheckMetaLegacy(check) {
  const bits = [];
  if (check?.latencyMs || check?.latencyMs === 0) bits.push(`${check.latencyMs} мс`);
  if (check?.status) bits.push(`HTTP ${check.status}`);
  if (check?.bytes || check?.bytes === 0) bits.push(`${byteSize(check.bytes)} прочитано`);
  if (check?.targetBytes) bits.push(`цель ${byteSize(check.targetBytes)}`);
  if (check?.version) bits.push(check.version);
  if (check?.negotiated) bits.push(`договорились: ${check.negotiated}`);
  if (Array.isArray(check?.addresses) && check.addresses.length) bits.push(check.addresses.slice(0, 3).join(', '));
  if (Array.isArray(check?.reference) && check.reference.length) bits.push(`DoH: ${check.reference.slice(0, 2).join(', ')}`);
  return bits.join(' · ');
}

function dpiCheckMeta(check) {
  const bits = [];
  if (check?.latencyMs || check?.latencyMs === 0) bits.push(`${check.latencyMs} ms`);
  if (check?.status) bits.push(`HTTP ${check.status}`);
  if (Array.isArray(check?.probes) && check.probes.length) {
    bits.push(check.probes.map((probe) => {
      const target = byteSize(probe?.targetBytes || 0);
      return `${target} ${probe?.ok ? 'OK' : byteSize(probe?.bytes || 0)}`;
    }).join(' / '));
  } else {
    if (check?.bytes || check?.bytes === 0) bits.push(`${byteSize(check.bytes)} read`);
    if (check?.targetBytes) bits.push(`target ${byteSize(check.targetBytes)}`);
  }
  if (Array.isArray(check?.hops) && check.hops.length > 1) bits.push(`${check.hops.length - 1} redirect`);
  if (check?.version) bits.push(check.version);
  if (check?.negotiated) bits.push(`ALPN: ${check.negotiated}`);
  if (Array.isArray(check?.addresses) && check.addresses.length) bits.push(check.addresses.slice(0, 3).join(', '));
  if (Array.isArray(check?.reference) && check.reference.length) bits.push(`DoH: ${check.reference.slice(0, 2).join(', ')}`);
  return bits.join(' · ');
}

function dpiCheckCard(title, check) {
  const tone = dpiCheckTone(check);
  const label = check?.label || 'ожидает проверки';
  const detail = check?.detail || check?.error || '';
  const meta = dpiCheckMeta(check);
  return `<article class="dpi-check-card ${tone}">
    <span>${escapeHtml(title)}</span>
    <strong>${escapeHtml(label)}</strong>
    ${meta ? `<small>${escapeHtml(meta)}</small>` : ''}
    ${detail ? `<em>${escapeHtml(detail)}</em>` : ''}
  </article>`;
}

function dpiCompareRow(title, directCheck, proxyCheck) {
  return `<article class="dpi-compare-row">
    <div class="dpi-compare-label">${escapeHtml(title)}</div>
    ${dpiCheckCard('Напрямую', directCheck)}
    ${dpiCheckCard('Через proxy', proxyCheck)}
  </article>`;
}

function dpiProxyOptions() {
  const selected = state.dpiProxyTag || '';
  const items = proxyOutbounds();
  const options = [];
  options.push(`<option value="" ${selected ? '' : 'selected'} disabled>${items.length ? 'Выберите proxy' : 'Proxy в конфигурации не найден'}</option>`);
  items.forEach((outbound) => {
    const tag = String(outbound?.tag || '');
    if (!tag) return;
    const address = outboundAddress(outbound);
    const label = address && address !== tag ? `${tag} · ${address}` : tag;
    options.push(`<option value="${escapeHtml(tag)}" ${selected === tag ? 'selected' : ''}>${escapeHtml(label)}</option>`);
  });
  return options.join('');
}

function diagnosticsDpiView() {
  const result = state.dpiResult;
  const checks = result?.checks || {};
  const verdict = result?.verdict || {};
  const canRunDpi = Boolean(String(state.dpiProxyTag || '').trim());
  return `
    <section class="panel dpi-diagnostics">
      <div class="panel-title">
        <div>
          <h2>DPI-проверка сайта</h2>
          <span>Сравнивает прямой доступ и выбранный proxy: DNS, TCP, TLS 1.2/1.3 и HTTP. Помогает понять, где именно ломается маршрут.</span>
        </div>
        <button class="btn" type="button" data-action="runDpiDiagnostics" ${state.dpiRunning || !canRunDpi ? 'disabled' : ''}>${state.dpiRunning ? 'Проверяю...' : 'Проверить сайт'}</button>
      </div>
      <div class="dpi-form-grid">
        <div class="form-row">
          <label>Сайт или URL</label>
          <input id="dpiTarget" value="${escapeHtml(state.dpiTarget)}" placeholder="https://www.speedtest.net/" />
        </div>
        <div class="form-row">
          <label>Proxy для сравнения</label>
          <select id="dpiProxyTag">${dpiProxyOptions()}</select>
        </div>
      </div>
      ${!canRunDpi ? '<div class="setup-result warn"><strong>Выберите proxy</strong><span>Проверка сравнивает прямой доступ с выбранным proxy, поэтому направление нужно указать явно.</span></div>' : ''}
      ${result?.ok ? `<div class="dpi-verdict ${escapeHtml(verdict.code || '')}">
        <div>
          <span>${escapeHtml(result.host || '')}${result.endpoint?.port ? `:${escapeHtml(result.endpoint.port)}` : ''}</span>
          <strong>${escapeHtml(verdict.label || 'готово')}</strong>
          <small>${escapeHtml(verdict.detail || '')}</small>
        </div>
        <code>${escapeHtml(result.tag ? `proxy: ${result.tag}` : 'proxy не выбран')}</code>
      </div>` : result ? `<div class="setup-result bad"><strong>DPI-проверка не выполнена</strong><span>${escapeHtml(result.stderr || result.error || 'неизвестная ошибка')}</span></div>` : '<p class="muted">Введите домен или URL и нажмите проверку. Для HTTPS отдельно проверяются TLS 1.2 и TLS 1.3.</p>'}
      <div class="dpi-dns-grid">
        ${dpiCheckCard('UDP/QUIC 443', checks.udp443)}
        ${dpiCheckCard('DNS роутера', checks.dns)}
        ${dpiCheckCard('DoH эталон', checks.dnsDoh)}
        ${dpiCheckCard('Сравнение DNS', checks.dnsCompare)}
      </div>
      <div class="dpi-compare-table">
        <div class="dpi-compare-head">
          <span>Проверка</span>
          <span>Напрямую</span>
          <span>Через выбранный proxy</span>
        </div>
        ${dpiCompareRow('TCP соединение', checks.tcpDirect, checks.tcpProxy)}
        ${dpiCompareRow('HTTP запрос', checks.httpDirect, checks.httpProxy)}
        ${dpiCompareRow('Чтение ответа', checks.readDirect, checks.readProxy)}
      </div>
      <div class="dpi-compare-table">
        ${dpiCompareRow('Redirect-chain', checks.redirectDirect, checks.redirectProxy)}
      </div>
      <div class="dpi-tls-grid">
        ${dpiCheckCard('TLS 1.2 напрямую', checks.tls12)}
        ${dpiCheckCard('TLS 1.3 напрямую', checks.tls13)}
      </div>
      <p class="muted">Проверка выполняется с самого роутера. Для окончательной проверки перехвата LAN используйте вкладку «Проверка связи» и клиентский тест трафика.</p>
    </section>
  `;
}

function diagnosticsChainView() {
  const result = state.diagnosticsChainResult;
  const steps = result?.steps || [];
  return `
    <section class="panel chain-diagnostics">
      <div class="panel-title">
        <div>
          <h2>Проверка цепочки подключения</h2>
          <span>Проверяет Xray config, LAN DNS, dnsmasq, nftables, policy routing, запрос с роутера и Xray stats.</span>
        </div>
        <button class="btn" type="button" data-action="runConnectivityDiagnostics" ${state.diagnosticsChainRunning ? 'disabled' : ''}>${state.diagnosticsChainRunning ? 'Проверяю...' : 'Проверить цепочку'}</button>
      </div>
      <div class="chain-url-row">
        <div class="form-row">
          <label>URL для проверки с роутера</label>
          <input id="diagnosticsTestUrl" value="${escapeHtml(state.diagnosticsTestUrl)}" placeholder="https://www.gstatic.com/generate_204" />
        </div>
        <p>Запрос выполняет сам роутер. Так видно, растут ли nft-счетчики и статистика Xray после реального исходящего запроса.</p>
      </div>
      <div class="setup-result-list chain-result-list">
        ${steps.length ? steps.map((step) => `<article class="${step.ok ? 'ok' : step.tone === 'warn' ? 'warn' : 'bad'}">
          <span>${step.ok ? '✓' : step.tone === 'warn' ? '!' : '×'}</span>
          <div><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.detail || '')}</small></div>
        </article>`).join('') : '<p class="muted">Нажмите проверку: результат появится здесь по шагам.</p>'}
      </div>
    </section>
    ${clientTrafficTestView()}
  `;
}



  return {
    clientTrafficTestView,
    diagnosticsChainView,
    diagnosticsDpiView,
    diagnosticsTrafficView,
  };
}
