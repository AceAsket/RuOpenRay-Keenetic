export function createDiagnosticsObservatoryView(deps) {
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

function observatoryPanel() {
  const obs = observatoryConfig();
  const burst = burstObservatoryConfig();
  const burstPing = burst.pingConfig && typeof burst.pingConfig === 'object' ? burst.pingConfig : {};
  const probeURL = obs.probeURL || burstPing.destination || state.serverCheckUrl || 'https://www.gstatic.com/generate_204';
  const probeInterval = obs.probeInterval || burstPing.interval || state.observatoryInterval || '10s';
  const selectors = observatorySelectors();
  const burstSelectors = burstObservatorySelectors();
  const allSelectors = [...new Set([...selectors, ...burstSelectors])];
  const matched = allSelectors.length ? proxyOutbounds().filter((outbound) => outboundMatchesSelectors(outbound, allSelectors)) : [];
  const observedMatched = observatoryMatchedOutbounds();
  const burstMatched = burstSelectors.length ? proxyOutbounds().filter((outbound) => outboundMatchesSelectors(outbound, burstSelectors)) : [];
  const required = observatoryRequiredBalancers();
  const missing = required.filter((balancer) => {
    const balancerSelectors = Array.isArray(balancer.selector) ? balancer.selector : [];
    const requiredSelectors = strategyObserverType(balancer?.strategy?.type) === 'burstObservatory' ? burstSelectors : selectors;
    return !balancerSelectors.some((selector) => requiredSelectors.includes(selector));
  });
  const checkTags = matched.length ? matched.map((outbound) => outbound.tag).filter(Boolean) : proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean);
  return `
    <section class="panel observatory-panel">
      <div class="panel-title">
        <div><h2>Автопроверка групп серверов</h2><span>Это встроенная проверка Xray для групп серверов. Ручная проверка RuOpenRay остается в разделе “Серверы” и не меняет конфигурацию Xray.</span></div>
        <div class="split-actions">
          <button class="btn secondary ${state.busyAction === 'checkObservatoryTargets' ? 'is-busy' : ''}" data-action="checkObservatoryTargets" ${checkTags.length && state.busyAction !== 'checkObservatoryTargets' ? '' : 'disabled'}>${state.busyAction === 'checkObservatoryTargets' ? 'Проверяю...' : 'Проверить через RuOpenRay'}</button>
          <button class="btn ${state.busyAction === 'enableObservatoryForProxy' ? 'is-busy' : ''}" data-action="enableObservatoryForProxy" ${state.busyAction === 'enableObservatoryForProxy' ? 'disabled' : ''}>${state.busyAction === 'enableObservatoryForProxy' ? 'Включаю...' : 'Включить для прокси'}</button>
        </div>
      </div>
      <div class="observatory-settings">
        <div class="form-row">
          <label>URL проверки</label>
          <input id="observatoryCheckUrl" value="${escapeHtml(probeURL)}" placeholder="https://www.gstatic.com/generate_204" />
        </div>
        <div class="form-row">
          <label>Интервал автопроверки</label>
          <input id="observatoryInterval" value="${escapeHtml(probeInterval)}" placeholder="10s, 30s, 1m" />
        </div>
        <p class="inline-help">Стратегия “меньший ping” требует проверки задержки Xray. Стратегия “меньше нагрузка” требует проверки нагрузки Xray. “Случайно” и “по очереди” работают без автопроверки.</p>
      </div>
      <div class="manual-check-settings">
        <strong>Ручная проверка RuOpenRay</strong>
        <div class="manual-check-grid">
          <div class="form-row">
            <label>Метод</label>
            <select id="serverCheckMode">
              <option value="http" ${state.serverCheckMode === 'http' ? 'selected' : ''}>HTTP через прокси</option>
              <option value="endpoint" ${state.serverCheckMode === 'endpoint' ? 'selected' : ''}>Порт сервера</option>
            </select>
          </div>
          <div class="form-row">
            <label>Таймаут, мс</label>
            <input id="serverCheckTimeout" type="number" min="300" max="15000" step="100" value="${escapeHtml(state.serverCheckTimeout)}" />
          </div>
          <div class="form-row">
            <label>Попыток</label>
            <input id="serverCheckAttempts" type="number" min="1" max="5" step="1" value="${escapeHtml(state.serverCheckAttempts)}" />
          </div>
        </div>
        <span>Ручная проверка нужна для выбора прокси сейчас. Автопроверка Xray нужна, когда группа сама выбирает сервер по задержке или нагрузке.</span>
      </div>
      <div class="observatory-grid">
        <article>
          <span>Проверка задержки</span>
          <strong>${observedMatched.length ? `${observedMatched.length} серверов` : 'не включен'}</strong>
        </article>
        <article>
          <span>Проверка нагрузки</span>
          <strong>${burstMatched.length ? `${burstMatched.length} серверов` : 'не включен'}</strong>
        </article>
        <article>
          <span>URL Xray</span>
          <strong>${escapeHtml(obs.probeURL || 'не применен')}</strong>
        </article>
        <article>
          <span>URL проверки нагрузки</span>
          <strong>${escapeHtml(burstPing.destination || 'не применен')}</strong>
        </article>
        <article>
          <span>Интервал автопроверки</span>
          <strong>${escapeHtml(obs.probeInterval || burstPing.interval || 'не применен')}</strong>
        </article>
        <article class="${missing.length ? 'warn' : ''}">
          <span>Нужно для групп</span>
          <strong>${required.length}${missing.length ? `, ${missing.length} не включены` : ''}</strong>
        </article>
      </div>
      <div class="observatory-tags">
        ${allSelectors.length ? allSelectors.map((selector) => `<span>${escapeHtml(selector)}</span>`).join('') : '<span class="muted">серверы для автопроверки Xray пока не выбраны</span>'}
      </div>
      ${matched.length ? `<div class="observatory-targets">
        ${matched.map((outbound) => {
          const check = checkForTag(outbound.tag);
          return `<article>
            <strong>${escapeHtml(outbound.tag)}</strong>
            <span>${escapeHtml(outboundAddress(outbound))}</span>
            <b class="check-badge ${check?.ok ? 'ok' : check ? 'bad' : ''}">${escapeHtml(checkLabel(check))}</b>
          </article>`;
        }).join('')}
      </div>` : ''}
      ${missing.length ? `<p class="settings-warning compact"><strong>Внимание</strong><span>Некоторые группы используют умную стратегию, но автопроверка Xray еще не проверяет их серверы.</span></p>` : ''}
    </section>
  `;
}

  return { observatoryPanel };
}
