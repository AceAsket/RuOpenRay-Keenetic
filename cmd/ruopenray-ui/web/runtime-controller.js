import { createRefreshTimers, isAuthError, loadAppSnapshot } from './refresh.js';
import { hydrateFirewallDraftFromStatus } from './firewall-state.js';

export function createRuntimeController({
  state,
  api,
  request,
  render,
  numberValue,
  activeProxyTag,
  syncConfig,
  proxyOutbounds,
  setActiveServerTag,
  inferredActiveProxyTag,
  syncLanDnsStatus,
  syncLoggingSettings,
  syncServiceSettings,
  clearAuth
}) {
  function logsUrl() {
    const params = new URLSearchParams({
      kind: state.logKind,
      level: state.logLevel,
      q: state.logQuery,
      sort: 'desc',
      lines: state.logLines
    });
    return `/api/logs?${params.toString()}`;
  }
  
  function displayLogText(text) {
    if (state.logSort !== 'asc') return text;
    const lines = String(text || '').split('\n');
    if (lines.length <= 1) return text;
    return lines.reverse().join('\n');
  }
  
  async function refreshLogs(renderAfter = true, patchOnly = false) {
    state.logs = displayLogText(await api.text(logsUrl()));
    if (!renderAfter) return;
    if (patchOnly) {
      const consoles = document.querySelectorAll('.log-console');
      if (consoles.length) {
        consoles.forEach((node) => {
          node.textContent = state.logs;
        });
        scrollLogsToBottom();
        return;
      }
      return;
    }
    render();
  }
  
  async function refreshDomainMonitor(renderAfter = true, options = {}) {
    if (state.domainMonitorPaused && !options.force) {
      if (renderAfter) render();
      return state.domainMonitor;
    }
    state.domainMonitor = await request('/api/domain-monitor?limit=1200');
    if (renderAfter) render();
    return state.domainMonitor;
  }
  
  async function controlDomainMonitor(action, extra = {}) {
    const result = await request('/api/domain-monitor', {
      method: 'POST',
      body: JSON.stringify({ action, ...extra })
    });
    state.message = result.stdout || result.stderr || 'SNI-монитор обновлен';
    await refreshDomainMonitor(true, { force: true });
  }
  
  async function probeMonitoredDomain(host) {
    const cleanHost = String(host || '').trim();
    if (!cleanHost) return;
    const tag = String(state.domainProbeTag || activeProxyTag() || '').trim();
    const probeKey = `${cleanHost}\u0000${tag}`;
    state.domainProbeChecking = probeKey;
    state.message = `Проверяю ${cleanHost}: напрямую и через proxy...`;
    render();
    try {
      const result = await request('/api/diagnostics/domain-probe', {
        method: 'POST',
        body: JSON.stringify({
          host: cleanHost,
          tag,
          timeoutMs: Math.max(1500, Number(state.serverCheckTimeout || 5000))
        })
      });
      state.domainProbeResults = { ...state.domainProbeResults, [probeKey]: result };
      state.message = `${cleanHost}: ${result.verdict?.label || 'проверено'}`;
    } catch (error) {
      state.domainProbeResults = {
        ...state.domainProbeResults,
        [probeKey]: { ok: false, stderr: error.message, host: cleanHost, tag }
      };
      state.message = error.message;
    } finally {
      state.domainProbeChecking = '';
      render();
    }
  }
  
  function scrollLogsToBottom() {
    if (!state.logFollow || state.logSort === 'desc') return;
    requestAnimationFrame(() => {
      document.querySelectorAll('.log-console').forEach((node) => {
        node.scrollTop = node.scrollHeight;
      });
    });
  }
  
  function shouldDeferBackgroundRender() {
    if (document.querySelector('[data-modal], .modal-backdrop')) return true;
    if (document.querySelector('details[open]:not(.dashboard-log-details)')) return true;
    if (state.tab === 'dashboard' && state.configExpanded) return true;
    const active = document.activeElement;
    if (!active || active === document.body) return false;
    const tag = active.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable;
  }
  
  function backgroundRender() {
    if (shouldDeferBackgroundRender()) {
      state.pendingBackgroundRender = true;
      return;
    }
    state.pendingBackgroundRender = false;
    render();
  }
  
  function flushPendingBackgroundRender() {
    if (!state.pendingBackgroundRender || shouldDeferBackgroundRender()) return;
    state.pendingBackgroundRender = false;
    render();
  }
  
  function recordTrafficSample(status = state.status) {
    const traffic = status?.system?.traffic || {};
    if (!traffic.interface && traffic.rxRate === undefined && traffic.txRate === undefined) return;
    const previous = state.trafficHistory[state.trafficHistory.length - 1];
    const sample = {
      at: Date.now(),
      iface: traffic.interface || previous?.iface || 'WAN',
      rxRate: Math.max(0, numberValue(traffic.rxRate)),
      txRate: Math.max(0, numberValue(traffic.txRate)),
      rxBytes: Math.max(0, numberValue(traffic.rxBytes)),
      txBytes: Math.max(0, numberValue(traffic.txBytes))
    };
    state.trafficHistory = [...state.trafficHistory, sample].slice(-72);
  }
  
  function recordXrayStatsSample(status = state.status) {
    const stats = status?.xrayStats || {};
    if (!stats.enabled || !Array.isArray(stats.outbounds)) return;
    const active = state.activeServerTag || activeProxyTag();
    const outbound = stats.outbounds.find((item) => item.tag === active) || stats.outbounds.find((item) => item.kind === 'proxy');
    if (!outbound) return;
    const sample = {
      at: Date.now(),
      tag: outbound.tag || active || 'proxy',
      downRate: Math.max(0, numberValue(outbound.downRate)),
      upRate: Math.max(0, numberValue(outbound.upRate)),
      downlink: Math.max(0, numberValue(outbound.downlink)),
      uplink: Math.max(0, numberValue(outbound.uplink))
    };
    state.xrayTrafficHistory = [...state.xrayTrafficHistory.filter((item) => item.tag === sample.tag), sample].slice(-72);
  }
  
  function recordStatusSnapshot(status) {
    state.status = status;
    if (status?.serverChecks?.results && typeof status.serverChecks.results === 'object' && !Array.isArray(status.serverChecks.results)) {
      state.serverChecks = { ...state.serverChecks, ...status.serverChecks.results };
    }
    if (status?.serverChecks?.history && typeof status.serverChecks.history === 'object' && !Array.isArray(status.serverChecks.history)) {
      state.serverCheckHistoryByTag = status.serverChecks.history;
    }
    if (status?.serverChecks?.historySettings && typeof status.serverChecks.historySettings === 'object') {
      const settings = status.serverChecks.historySettings;
      state.serverCheckHistoryLimit = String(settings.limit ?? state.serverCheckHistoryLimit ?? '24');
      state.serverCheckHistoryRetentionHours = String(settings.retentionHours ?? state.serverCheckHistoryRetentionHours ?? '168');
    }
    if (status?.serverChecks?.subscriptionCandidates && typeof status.serverChecks.subscriptionCandidates === 'object' && !Array.isArray(status.serverChecks.subscriptionCandidates)) {
      const next = { ...(state.subscriptionCandidateChecks || {}) };
      Object.entries(status.serverChecks.subscriptionCandidates).forEach(([tag, checks]) => {
        if (!checks || typeof checks !== 'object' || Array.isArray(checks)) return;
        next[tag] = { ...(next[tag] || {}), ...checks };
      });
      state.subscriptionCandidateChecks = next;
    }
    recordTrafficSample(status);
    recordXrayStatsSample(status);
  }

  const refreshTimers = createRefreshTimers({
    state,
    request,
    refreshLogs,
    refreshDomainMonitor,
    recordStatus: recordStatusSnapshot,
    backgroundRender,
    clearAuth,
    setMessage: (message) => {
      state.message = message;
    }
  });

  function configureLogTimer() {
    refreshTimers.configureLogTimer();
  }

  function configureStatusTimer() {
    refreshTimers.configureStatusTimer();
  }

  function hasConfigSurface(config) {
    return Boolean(config && typeof config === 'object' && (
      Array.isArray(config.inbounds)
      || Array.isArray(config.outbounds)
      || (config.routing && typeof config.routing === 'object')
      || (config.dns && typeof config.dns === 'object')
    ));
  }

  async function refresh(options = {}) {
    const renderAfter = options.renderAfter !== false;
    const background = Boolean(options.background);
    try {
      const {
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
      } = await loadAppSnapshot({ request, text: api.text, logsUrl });
      recordStatusSnapshot(status);
      state.profiles = Array.isArray(profiles) ? profiles : [];
      const activeConfig = hasConfigSurface(config) ? config : state.config;
      const usableDraft = configDraft?.exists && hasConfigSurface(configDraft.config);
      const draftConfig = usableDraft ? configDraft.config : activeConfig;
      const draftState = configDraft?.exists && !usableDraft
        ? { ...configDraft, exists: false, error: configDraft.error || 'Черновик config.json пустой и не используется' }
        : configDraft;
      syncConfig(draftConfig, {
        activeConfig,
        fromServer: true,
        persist: false,
        forceDraft: usableDraft,
        serverDraft: draftState
      });
      if (!state.activeServerTag || !proxyOutbounds().some((outbound) => outbound?.tag === state.activeServerTag)) {
        setActiveServerTag(inferredActiveProxyTag());
      }
      state.logs = displayLogText(logs);
      state.leases = leases.leases || [];
      state.leasesSource = leases.source || '';
      const loadedCoreReleases = Array.isArray(releases?.releases) ? releases.releases : [];
      state.coreReleasesError = releases?.error ? 'Не удалось загрузить список релизов Xray-core с GitHub. Попробуйте открыть выбор версии еще раз.' : '';
      if (loadedCoreReleases.length || !state.coreReleases.length) {
        state.coreReleases = loadedCoreReleases;
      }
      state.coreAsset = releases?.asset || state.coreAsset || '';
      state.coreArch = releases?.arch || state.coreArch || null;
      state.appRelease = appRelease?.release || null;
      if (!state.selectedCoreVersion) {
        const latestStable = state.coreReleases.find((release) => release.assetUrl && !release.prerelease);
        const latestInstallable = state.coreReleases.find((release) => release.assetUrl);
        state.selectedCoreVersion = latestStable?.tag || latestInstallable?.tag || state.coreReleases[0]?.tag || '';
      }
      state.geoStatus = geo;
      state.storageReport = storageReport;
      if (!state.domainMonitorPaused || !state.domainMonitor) {
        state.domainMonitor = domainMonitor;
      }
      state.tcpFastOpen = tcpFastOpen;
      syncLanDnsStatus(lanDns);
      state.firewallStatus = firewallStatus;
      hydrateFirewallDraftFromStatus(state, firewallStatus);
      state.subscriptionPools = Array.isArray(subscriptions?.pools) ? subscriptions.pools : [];
      if (Array.isArray(disabledRoutes?.rules)) {
        state.disabledRouteRules = disabledRoutes.rules.filter((item) => item && item.rule);
      }
      if (routeNames?.names && typeof routeNames.names === 'object' && !Array.isArray(routeNames.names)) {
        state.routeNames = Object.fromEntries(Object.entries(routeNames.names).filter(([, value]) => String(value || '').trim()));
      } else {
        state.routeNames = {};
      }
      state.legacyRouteNames = {};
      if (routePresets?.presets && typeof routePresets.presets === 'object' && !Array.isArray(routePresets.presets)) {
        state.customRoutePresets = routePresets.presets;
      } else {
        state.customRoutePresets = {};
      }
      if (routePresets?.externalPresets && typeof routePresets.externalPresets === 'object' && !Array.isArray(routePresets.externalPresets)) {
        state.externalRoutePresets = routePresets.externalPresets;
      } else {
        state.externalRoutePresets = {};
      }
      state.routePresetSources = Array.isArray(routePresets?.sources) ? routePresets.sources : [];
      state.legacyCustomRoutePresets = {};
      if (serverMeta?.items && typeof serverMeta.items === 'object' && !Array.isArray(serverMeta.items)) {
        state.serverMeta = Object.fromEntries(
          Object.entries(serverMeta.items)
            .filter(([tag, item]) => String(tag || '').trim() && item && typeof item === 'object')
            .map(([tag, item]) => [String(tag).trim(), {
              country: String(item.country || '').trim().toUpperCase(),
              label: String(item.label || '').trim()
            }])
        );
      }
      syncLoggingSettings(logging);
      syncServiceSettings(serviceSettings);
      state.geoCustomSources = Array.isArray(geo?.customSources) ? geo.customSources : state.geoCustomSources;
      state.geoPresetOverrides = geo?.presetOverrides && typeof geo.presetOverrides === 'object' && !Array.isArray(geo.presetOverrides) ? geo.presetOverrides : state.geoPresetOverrides;
      state.geoUserLists = Array.isArray(geo?.userLists) ? geo.userLists : state.geoUserLists;
      if (geo?.schedule && !state.geoScheduleLoaded) {
        const schedule = geo.schedule;
        state.geoScheduleLoaded = true;
        state.geoScheduleEnabled = Boolean(schedule.enabled);
        state.geoScheduleInterval = schedule.interval || 'weekly';
        state.geoScheduleWeekday = String(schedule.weekday ?? '0');
        state.geoScheduleTime = schedule.time || '04:20';
        state.geoBackup = schedule.backup !== false;
        const scheduledPresets = Array.isArray(schedule.presets) ? schedule.presets : [schedule.preset || 'loyalsoldier'];
        const presetList = Array.isArray(geo?.presets) ? geo.presets : [];
        const base = scheduledPresets.find((id) => presetList.find((preset) => preset.id === id && preset.mode !== 'extra-geosite')) || 'loyalsoldier';
        state.geoBasePreset = base;
        state.geoPreset = base;
        state.geoExtraPresets = scheduledPresets.filter((id) => presetList.find((preset) => preset.id === id && preset.mode === 'extra-geosite'));
        state.geoCustomSourceIds = Array.isArray(schedule.customSourceIds) ? schedule.customSourceIds : [];
      }
      if (renderAfter) {
        if (background) backgroundRender();
        else render();
      }
    } catch (error) {
      if (isAuthError(error)) {
        clearAuth();
        configureLogTimer();
        configureStatusTimer();
      }
      state.message = error.message;
      if (renderAfter) {
        if (background) backgroundRender();
        else render();
      }
    }
  }

  return {
    logsUrl,
    displayLogText,
    refreshLogs,
    refreshDomainMonitor,
    controlDomainMonitor,
    probeMonitoredDomain,
    scrollLogsToBottom,
    shouldDeferBackgroundRender,
    backgroundRender,
    flushPendingBackgroundRender,
    recordTrafficSample,
    recordXrayStatsSample,
    recordStatusSnapshot,
    configureLogTimer,
    configureStatusTimer,
    refresh
  };
}
