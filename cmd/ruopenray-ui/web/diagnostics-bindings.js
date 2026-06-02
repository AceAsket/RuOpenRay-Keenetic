let delegatedDiagnosticsDeps = null;
let delegatedDiagnosticsBound = false;

function openDeviceEvents(deps, ip) {
  const { state, render, domainMonitorFilterStorageKey } = deps;
  state.domainMonitorDeviceFilter = ip || '';
  state.domainMonitorQuery = '';
  state.domainMonitorMode = 'events';
  state.domainMonitorFilter = 'all';
  globalThis.localStorage?.setItem(domainMonitorFilterStorageKey, state.domainMonitorFilter);
  render();
}

function openDomainRouteDialog(deps, value) {
  const { state, render, activeProxyTag } = deps;
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return;
  const ip = /^\d{1,3}(\.\d{1,3}){3}$/.test(cleanValue);
  state.routeKind = ip ? 'ip' : 'domain';
  state.routeValue = ip ? cleanValue : `domain:${cleanValue}`;
  state.routeName = ip ? `IP ${cleanValue}` : cleanValue;
  state.routeTargetType = 'outbound';
  state.routeOutbound = activeProxyTag() || 'proxy';
  state.routeRuleEditingIndex = -1;
  state.routeRuleMode = 'single';
  state.routeRuleDialog = true;
  render();
}

function cloneDomainMonitorSnapshot(value) {
  if (!value) return null;
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }
}

function setDomainMonitorMode(deps, mode) {
  const { state, render } = deps;
  if (!['domains', 'devices', 'events'].includes(mode)) return;
  state.domainMonitorMode = mode;
  if (mode === 'devices') state.domainMonitorDeviceFilter = '';
  render();
}

function clearDomainMonitorDevice(deps) {
  const { state, render } = deps;
  state.domainMonitorDeviceFilter = '';
  state.domainMonitorMode = 'devices';
  render();
}

function handleDiagnosticsDelegatedClick(event) {
  const deps = delegatedDiagnosticsDeps;
  const target = event.target;
  if (!deps || !target?.closest) return;
  const { state, render, domainMonitorFilterStorageKey, probeMonitoredDomain, configureLogTimer } = deps;

  const routeButton = target.closest('[data-domain-to-route]');
  if (routeButton) {
    event.preventDefault();
    event.stopPropagation();
    openDomainRouteDialog(deps, routeButton.dataset.domainToRoute || '');
    return;
  }

  const probeButton = target.closest('[data-domain-probe]');
  if (probeButton) {
    event.preventDefault();
    event.stopPropagation();
    if (!state.domainProbeChecking) void probeMonitoredDomain(probeButton.dataset.domainProbe || '');
    return;
  }

  const deviceToggle = target.closest('[data-domain-device-toggle]');
  if (deviceToggle) {
    event.preventDefault();
    event.stopPropagation();
    const ip = deviceToggle.dataset.domainDeviceToggle || 'router';
    state.domainMonitorExpandedDevices = {
      ...(state.domainMonitorExpandedDevices || {}),
      [ip]: !state.domainMonitorExpandedDevices?.[ip],
    };
    render();
    return;
  }

  const deviceEvents = target.closest('[data-domain-device-events]');
  if (deviceEvents) {
    event.preventDefault();
    event.stopPropagation();
    openDeviceEvents(deps, deviceEvents.dataset.domainDeviceEvents || '');
    return;
  }

  const domainMode = target.closest('[data-domain-mode]');
  if (domainMode) {
    event.preventDefault();
    event.stopPropagation();
    setDomainMonitorMode(deps, domainMode.dataset.domainMode);
    return;
  }

  const domainEventWindow = target.closest('[data-domain-event-window], [data-domain-list-window]');
  if (domainEventWindow) {
    event.preventDefault();
    event.stopPropagation();
    const size = domainEventWindow.dataset.domainEventWindow || domainEventWindow.dataset.domainListWindow;
    if (!['compact', 'medium', 'large'].includes(size)) return;
    state.domainMonitorEventWindow = size;
    state.domainMonitorListWindow = size;
    render();
    return;
  }

  const domainSort = target.closest('[data-domain-sort]');
  if (domainSort) {
    event.preventDefault();
    state.domainMonitorSort = domainSort.dataset.domainSort;
    render();
    return;
  }

  const domainPause = target.closest('[data-domain-pause]');
  if (domainPause) {
    event.preventDefault();
    if (state.domainMonitorPaused) {
      state.domainMonitorPaused = false;
      state.domainMonitorPausedSnapshot = null;
    } else {
      state.domainMonitorPausedSnapshot = cloneDomainMonitorSnapshot(state.domainMonitor);
      state.domainMonitorPaused = true;
    }
    if (typeof configureLogTimer === 'function') configureLogTimer();
    render();
    return;
  }

  const domainFilter = target.closest('[data-domain-filter]');
  if (domainFilter) {
    event.preventDefault();
    state.domainMonitorFilter = domainFilter.dataset.domainFilter;
    globalThis.localStorage?.setItem(domainMonitorFilterStorageKey, state.domainMonitorFilter);
    render();
    return;
  }

  const clearFilter = target.closest('[data-domain-clear-filter]');
  if (clearFilter) {
    event.preventDefault();
    state.domainMonitorQuery = '';
    state.domainMonitorDeviceFilter = '';
    state.domainMonitorFilter = 'all';
    globalThis.localStorage?.setItem(domainMonitorFilterStorageKey, state.domainMonitorFilter);
    render();
    return;
  }

  const clearDevice = target.closest('[data-domain-clear-device]');
  if (clearDevice) {
    event.preventDefault();
    event.stopPropagation();
    clearDomainMonitorDevice(deps);
    return;
  }

  const deviceCard = target.closest('[data-domain-device-card]');
  if (deviceCard && !target.closest('button, a, input, select, textarea')) {
    event.preventDefault();
    openDeviceEvents(deps, deviceCard.dataset.domainDeviceCard || '');
  }
}

function handleDiagnosticsDelegatedKeydown(event) {
  const deps = delegatedDiagnosticsDeps;
  const target = event.target;
  if (!deps || !target?.closest || (event.key !== 'Enter' && event.key !== ' ')) return;
  const deviceCard = target.closest('[data-domain-device-card]');
  if (!deviceCard) return;
  event.preventDefault();
  openDeviceEvents(deps, deviceCard.dataset.domainDeviceCard || '');
}

export function bindDiagnosticsControls(deps) {
  const {
    state,
    render,
    refreshLogs,
    configureLogTimer,
    scrollLogsToBottom,
  } = deps;

  delegatedDiagnosticsDeps = deps;
  if (!delegatedDiagnosticsBound && typeof document?.addEventListener === 'function') {
    document.addEventListener('click', handleDiagnosticsDelegatedClick);
    document.addEventListener('keydown', handleDiagnosticsDelegatedKeydown);
    delegatedDiagnosticsBound = true;
  }

  document.querySelectorAll('[data-domain-probe], [data-domain-to-route], [data-domain-device-events], [data-domain-device-card], [data-domain-device-toggle], [data-domain-mode], [data-domain-clear-device], [data-domain-event-window], [data-domain-list-window], [data-domain-sort], [data-domain-filter], [data-domain-pause]').forEach((node) => {
    node.dataset.delegated = '1';
  });

  document.querySelectorAll('[data-domain-mode]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setDomainMonitorMode(deps, button.dataset.domainMode);
    });
  });
  document.querySelectorAll('[data-domain-clear-device]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearDomainMonitorDevice(deps);
    });
  });

  document.querySelectorAll('[data-sni-map]').forEach((button) => {
    button.addEventListener('click', () => focusSniResult(button.dataset.sniMap));
  });
  document.querySelector('#diagnosticsTestUrl')?.addEventListener('input', (event) => {
    state.diagnosticsTestUrl = event.target.value;
  });
  document.querySelector('#clientTrafficUrl')?.addEventListener('input', (event) => {
    state.clientTrafficUrl = event.target.value;
  });
  document.querySelector('#dpiTarget')?.addEventListener('input', (event) => {
    state.dpiTarget = event.target.value;
  });
  document.querySelector('#dpiTarget')?.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && typeof deps.runDpiDiagnostics === 'function') {
      state.dpiTarget = event.target.value;
      await deps.runDpiDiagnostics();
    }
  });
  document.querySelector('#dpiProxyTag')?.addEventListener('change', (event) => {
    state.dpiProxyTag = event.target.value;
    render();
  });
  document.querySelector('#domainProbeTag')?.addEventListener('change', (event) => {
    state.domainProbeTag = event.target.value;
    render();
  });

  document.querySelector('#logKind')?.addEventListener('change', async (event) => {
    state.logKind = event.target.value;
    await refreshLogs();
  });
  document.querySelector('#logLevel')?.addEventListener('change', async (event) => {
    state.logLevel = event.target.value;
    await refreshLogs();
  });
  document.querySelector('#logSort')?.addEventListener('change', async (event) => {
    state.logSort = event.target.value;
    if (state.logSort === 'desc') state.logFollow = false;
    await refreshLogs();
  });
  document.querySelector('#logLines')?.addEventListener('input', (event) => {
    state.logLines = event.target.value;
  });
  document.querySelector('#logIntervalSec')?.addEventListener('input', (event) => {
    state.logIntervalSec = event.target.value;
    configureLogTimer();
  });
  document.querySelector('#logLive')?.addEventListener('change', (event) => {
    state.logLive = event.target.checked;
    configureLogTimer();
    render();
  });
  document.querySelector('.dashboard-log-details')?.addEventListener('toggle', (event) => {
    state.dashboardLogsOpen = event.currentTarget.open;
  });
  document.querySelector('#logFollow')?.addEventListener('change', (event) => {
    state.logFollow = event.target.checked;
    scrollLogsToBottom();
  });
  document.querySelector('#logQuery')?.addEventListener('input', (event) => {
    state.logQuery = event.target.value;
  });
  document.querySelector('#logQuery')?.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      state.logQuery = event.target.value;
      await refreshLogs();
    }
  });
  document.querySelector('#domainMonitorQuery')?.addEventListener('input', (event) => {
    state.domainMonitorQuery = event.target.value;
  });
  document.querySelector('#domainMonitorQuery')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') render();
  });

  document.querySelector('#sniTarget')?.addEventListener('input', (event) => {
    state.sniTarget = event.target.value;
  });
  document.querySelector('#sniCidr')?.addEventListener('change', (event) => {
    state.sniCidr = event.target.value;
  });
  document.querySelector('#sniTimeout')?.addEventListener('input', (event) => {
    state.sniTimeout = event.target.value;
  });
  document.querySelector('#sniThreads')?.addEventListener('input', (event) => {
    state.sniThreads = event.target.value;
  });
  document.querySelector('#sniLimit')?.addEventListener('input', (event) => {
    state.sniLimit = event.target.value;
  });
}
