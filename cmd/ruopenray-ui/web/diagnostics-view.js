import { createDiagnosticsDomainView } from './diagnostics-domain-view.js';
import { createDiagnosticsObservatoryView } from './diagnostics-observatory-view.js';
import { createDiagnosticsTrafficView } from './diagnostics-traffic-view.js';

export function createDiagnosticsView(deps) {
  const {
    deviceRules,
    domainDiagnosticRows,
    logsPanel,
    sniPanel,
    stat,
    state
  } = deps;

  const { diagnosticsDomainMonitorView } = createDiagnosticsDomainView(deps);
  const {
    clientTrafficTestView,
    diagnosticsChainView,
    diagnosticsDpiView,
    diagnosticsTrafficView
  } = createDiagnosticsTrafficView(deps);
  const { observatoryPanel } = createDiagnosticsObservatoryView(deps);

  function diagnosticsLiveView() {
    const checks = Object.values(state.serverChecks);
    return `
      <section class="stats route-stats">
        ${stat('Проверки', checks.length || '—', checks.length ? `${checks.filter((item) => item?.ok).length} доступно` : 'серверы еще не проверялись')}
        ${stat('Live-Xray', state.logLive ? 'Live' : 'Пауза', `${state.logLines} строк · ${state.logSort === 'desc' ? 'новые сверху' : 'новые снизу'}`)}
        ${stat('Устройства', deviceRules().length, 'source-правила LAN')}
        ${stat('Домены', domainDiagnosticRows().length, 'доменные правила')}
      </section>
      ${logsPanel(false)}
    `;
  }

  function diagnosticsPanel() {
    const checks = Object.values(state.serverChecks);
    const alive = checks.filter((item) => item?.ok).length;
    const views = {
      live: diagnosticsLiveView,
      chain: diagnosticsChainView,
      dpi: diagnosticsDpiView,
      traffic: diagnosticsTrafficView,
      sni: sniPanel,
      domains: diagnosticsDomainMonitorView
    };
    const activeView = views[state.diagnosticsView] ? state.diagnosticsView : 'live';
    return `
      <section class="route-hero diagnostics-hero">
        <div>
          <h2>Диагностика</h2>
          <p>SNI-поиск, логи в реальном времени, проверка цепочки и мониторинг доменов.</p>
        </div>
        <div class="route-score">
          <strong>${checks.length ? `${alive}/${checks.length}` : '—'}</strong>
          <span>последняя проверка серверов</span>
        </div>
      </section>

      <section class="panel diagnostic-switcher">
        <div class="segmented diagnostics-tabs" aria-label="Режим диагностики">
          ${[
            ['live', 'Live-Xray'],
            ['chain', 'Проверка связи'],
            ['dpi', 'DPI'],
            ['traffic', 'Трафик'],
            ['sni', 'SNI'],
            ['domains', 'Домены']
          ].map(([value, label]) => `<button type="button" class="${activeView === value ? 'active' : ''}" data-diagnostics-view="${value}">${label}</button>`).join('')}
        </div>
      </section>

      ${views[activeView]()}
    `;
  }

  return {
    clientTrafficTestView,
    diagnosticsChainView,
    diagnosticsPanel,
    observatoryPanel
  };
}
