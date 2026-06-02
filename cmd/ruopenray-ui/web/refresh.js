export function isAuthError(error) {
  return /Authentication|authorization|авторизац/i.test(String(error?.message || ''));
}

function timeoutError(path) {
  const error = new Error(`Timeout while loading ${path}`);
  error.name = 'TimeoutError';
  return error;
}

async function optionalRequest(request, path, fallback, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(timeoutError(path)), timeoutMs);
  try {
    return await request(path, { signal: controller.signal });
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadAppSnapshot({ request, text, logsUrl }) {
  const [
    status,
    profiles,
    config,
    configDraft,
    logs,
    leases,
    releases,
    appRelease,
    geo,
    domainMonitor,
    logging,
    serviceSettings,
    storageReport,
    tcpFastOpen,
    lanDns,
    firewallStatus,
    subscriptions,
    disabledRoutes,
    routeNames,
    routePresets,
    serverMeta
  ] = await Promise.all([
    request('/api/status'),
    request('/api/profiles'),
    request('/api/config'),
    request('/api/config/draft').catch(() => ({ ok: false, exists: false })),
    text(logsUrl()),
    request('/api/dhcp/leases').catch(() => ({ leases: [] })),
    optionalRequest(request, '/api/core/releases', { releases: [], asset: '', error: true }, 15000),
    optionalRequest(request, '/api/app/releases', null),
    optionalRequest(request, '/api/geo/status', null),
    request('/api/domain-monitor?limit=1200').catch(() => null),
    request('/api/settings/logging').catch(() => null),
    request('/api/settings/service').catch(() => null),
    optionalRequest(request, '/api/storage/report', null),
    request('/api/network/tcp-fast-open').catch(() => null),
    request('/api/dns/lan-upstream').catch(() => null),
    request('/api/firewall/status').catch(() => null),
    request('/api/subscriptions').catch(() => ({ pools: [] })),
    request('/api/routing/disabled').catch(() => null),
    request('/api/routing/names').catch(() => null),
    request('/api/routing/presets').catch(() => null),
    request('/api/server-meta').catch(() => null)
  ]);
  return {
    status,
    profiles,
    config,
    configDraft,
    logs,
    leases,
    releases,
    appRelease,
    geo,
    domainMonitor,
    logging,
    serviceSettings,
    storageReport,
    tcpFastOpen,
    lanDns,
    firewallStatus,
    subscriptions,
    disabledRoutes,
    routeNames,
    routePresets,
    serverMeta
  };
}

export function createRefreshTimers({
  state,
  request,
  refreshLogs,
  refreshDomainMonitor,
  recordStatus,
  backgroundRender,
  clearAuth,
  setMessage
}) {
  function configureLogTimer() {
    if (state.logTimer) {
      clearInterval(state.logTimer);
      state.logTimer = null;
    }
    const liveLogs = state.tab === 'diagnostics' && state.diagnosticsView === 'live';
    const liveDomainMonitor = state.tab === 'diagnostics' && ['domains', 'devices'].includes(state.diagnosticsView);
    if (!state.token || (!liveLogs && !liveDomainMonitor)) return;
    const interval = Math.max(1, Number(state.logIntervalSec) || 2) * 1000;
    state.logTimer = setInterval(async () => {
      try {
        if (liveLogs && state.logLive) {
          await refreshLogs(true, true);
        }
        if (liveDomainMonitor && !state.domainMonitorPaused) {
          await refreshDomainMonitor(false);
          backgroundRender();
        }
      } catch (error) {
        if (isAuthError(error)) {
          clearAuth();
          configureLogTimer();
        }
        setMessage(error.message);
        backgroundRender();
      }
    }, interval);
  }

  function configureStatusTimer() {
    if (state.statusTimer) {
      clearInterval(state.statusTimer);
      state.statusTimer = null;
    }
    if (!state.token) return;
    state.statusTimer = setInterval(async () => {
      if (state.tab !== 'dashboard' && state.tab !== 'servers' && !(state.tab === 'diagnostics' && state.diagnosticsView === 'traffic')) return;
      try {
        const status = await request('/api/status');
        recordStatus(status);
        backgroundRender();
      } catch (error) {
        if (isAuthError(error)) {
          clearAuth();
          configureLogTimer();
          configureStatusTimer();
        }
      }
    }, 5000);
  }

  return { configureLogTimer, configureStatusTimer };
}
