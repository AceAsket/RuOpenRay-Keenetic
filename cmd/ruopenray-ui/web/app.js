import { hiddenBuiltinRoutePresetKeys, labels, managedRouteTags, nav, routeBundles, routeKinds, routePlaceholders, routePresets, tabTitles } from './presets.js';
import { bindActionControls } from './action-bindings.js';
import { createApiClient } from './api-client.js';
import { createAuxPanelsView } from './aux-panels-view.js';
import { createConfigActions } from './config-actions.js';
import { bindConfigControls } from './config-bindings.js';
import { createConfigStateHelpers } from './config-state.js';
import { bindCoreControls } from './core-bindings.js';
import { createDashboardView } from './dashboard-view.js';
import { createDevicesActions } from './devices-actions.js';
import { bindDeviceControls } from './devices-bindings.js';
import { createDevicesModel } from './devices-model.js';
import { createDiagnosticsActions } from './diagnostics-actions.js';
import { bindDiagnosticsControls } from './diagnostics-bindings.js';
import { createDiagnosticsModel } from './diagnostics-model.js';
import { createDiagnosticsView } from './diagnostics-view.js';
import { createDnsActions } from './dns-actions.js';
import { bindDnsControls } from './dns-bindings.js';
import { createDnsModel } from './dns-model.js';
import { createDnsView } from './dns-view.js';
import { createGeoView } from './geo-view.js';
import { createFirewallActions } from './firewall-actions.js';
import { createFirewallModel } from './firewall-model.js';
import { byteRate, byteSize, escapeHtml, fmtUptime, formatDuration, formatDurationCompact, numberValue } from './formatters.js';
import { createImportDialogView } from './import-dialog-view.js';
import { bindGeoControls } from './geo-bindings.js';
import { createImportActions } from './import-actions.js';
import { bindImportControls } from './import-bindings.js';
import { createLoginView } from './login-view.js';
import { bindModalControls, bindNavigationControls } from './navigation-bindings.js';
import { noticeView } from './notice-view.js';
import { createObservatoryActions } from './observatory-actions.js';
import { createProfileActions } from './profile-actions.js';
import { bindProfileControls } from './profile-bindings.js';
import { createRouteBalancerActions } from './route-balancer-actions.js';
import { createRoutingActions } from './routing-actions.js';
import { bindRoutingControls } from './routing-bindings.js';
import { createSettingsView } from './settings-view.js';
import { bindSettingsControls } from './settings-bindings.js';
import { createRuntimeController } from './runtime-controller.js';
import { createRoutingView } from './routing-view.js';
import { createRoutingDialogsView } from './routing-dialogs-view.js';
import { createRoutingDsl } from './routing-dsl.js';
import { createRoutingModel } from './routing-model.js';
import { bindServerCheckControls } from './server-check-bindings.js';
import { createServerActions } from './server-actions.js';
import { createServerModel } from './server-model.js';
import { createServersView } from './servers-view.js';
import { createSettingsActions } from './settings-actions.js';
import { createSetupActions } from './setup-actions.js';
import { createSetupView } from './setup-view.js';
import { createUpdatesActions } from './updates-actions.js';
import { createSetupModel } from './setup-model.js';
import { createSniActions } from './sni-actions.js';
import { createSniView } from './sni-view.js';
import { createInitialState } from './state.js';
import { createXrayDraftActions } from './xray-draft-actions.js';
import { createXrayConfigModel } from './xray-config-model.js';
import {
  clearAuthToken,
  domainMonitorFilterStorageKey,
  installPasswordStorageKey,
  normalizeUiTheme,
  saveUiTheme,
  shellQuote,
  xrayStatsResetAtStorageKey
} from './storage.js';

const app = document.querySelector('#app');
const state = createInitialState();

function applyUiTheme(theme = state.uiTheme) {
  state.uiTheme = normalizeUiTheme(theme);
  document.body.dataset.theme = state.uiTheme;
}

function setUiTheme(theme) {
  applyUiTheme(saveUiTheme(theme));
  render();
}

applyUiTheme();

function clearAuth() {
  state.token = '';
  clearAuthToken({ preserveRemember: true });
  state.message = 'Сессия устарела. Войдите заново.';
  render();
}

const api = createApiClient({
  getToken: () => state.token,
  onUnauthorized: clearAuth
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function keepOperationVisible(startedAt, minMs = 700) {
  const elapsed = Date.now() - startedAt;
  if (elapsed < minMs) await delay(minMs - elapsed);
}

async function request(path, options = {}) {
  return api.request(path, options);
}

async function persistServerMeta(items = state.serverMeta) {
  const result = await request('/api/server-meta', {
    method: 'POST',
    body: JSON.stringify({ items: items || {} })
  });
  if (result?.items && typeof result.items === 'object') state.serverMeta = result.items;
  return result;
}

async function upload(path, formData, options = {}) {
  return api.upload(path, formData, options);
}

let serverDraftSaveTimer = null;
let serverDraftSaveSeq = 0;

function scheduleServerDraftSave(config) {
  if (!state.token || !config || typeof config !== 'object') return;
  const seq = ++serverDraftSaveSeq;
  clearTimeout(serverDraftSaveTimer);
  state.serverDraftSaving = true;
  state.serverDraftError = '';
  serverDraftSaveTimer = setTimeout(async () => {
    try {
      const result = await request('/api/config/draft', {
        method: 'POST',
        body: JSON.stringify({ config })
      });
      if (seq !== serverDraftSaveSeq) return;
      state.serverDraftExists = Boolean(result.exists);
      state.serverDraftSavedAt = result.updatedAt || '';
      state.serverDraftError = result.error || '';
    } catch (error) {
      if (seq === serverDraftSaveSeq) state.serverDraftError = error.message || 'Не удалось сохранить черновик на роутере';
    } finally {
      if (seq === serverDraftSaveSeq) state.serverDraftSaving = false;
    }
  }, 650);
}

function cancelServerDraftSave() {
  clearTimeout(serverDraftSaveTimer);
  serverDraftSaveTimer = null;
  serverDraftSaveSeq += 1;
  state.serverDraftSaving = false;
}

function saveRouteNamesToServer(names) {
  if (!state.token) return;
  request('/api/routing/names', {
    method: 'POST',
    body: JSON.stringify({ names: names || {} })
  }).catch((error) => {
    state.message = error.message || 'Не удалось сохранить названия маршрутов на роутере';
    render();
  });
}

const {
  syncConfig,
  syncLoggingSettings,
  syncServiceSettings,
  syncLanDnsStatus,
  lanDnsModeLabel
} = createConfigStateHelpers(state, { onDraftChange: scheduleServerDraftSave });

const routingModel = createRoutingModel({
  state,
  managedRouteTags,
  routeBundles,
  routeKinds,
  routePresets,
  proxyOutbounds: () => proxyOutbounds(),
  checkForTag: (tag) => checkForTag(tag),
  checkLabel: (result) => checkLabel(result),
  outboundAddress: (outbound) => outboundAddress(outbound),
  persistRouteNames: saveRouteNamesToServer
});
const {
  routeRules,
  routeBalancers,
  outboundOptions,
  balancerOptions,
  routeTargetOptions,
  routeTargetFlagMarkup,
  routeTargetStatus,
  encodedRouteTarget,
  splitRouteValues,
  routeTarget,
  routeRuleKey,
  compactRouteValue,
  readableRouteTag,
  routeTagValue,
  isRuOpenRayManagedRoute,
  routeRuleName,
  setRouteRuleName,
  copyRouteRuleName,
  saveRouteNames,
  describeRouteRule,
  routeStats,
  routeSectionDefinitions,
  routeCategoryForRule,
  routeRuleSource,
  routeStatsFor
} = routingModel;

function setRoutingDraft(rules) {
  const next = JSON.parse(JSON.stringify(state.config || {}));
  next.routing = next.routing && typeof next.routing === 'object' ? next.routing : {};
  next.routing.rules = rules;
  syncConfig(next);
}

function setRouteBalancersDraft(balancers) {
  const next = JSON.parse(JSON.stringify(state.config || {}));
  next.routing = next.routing && typeof next.routing === 'object' ? next.routing : {};
  next.routing.balancers = balancers;
  syncConfig(next);
}

function cloneRules(rules) {
  return JSON.parse(JSON.stringify(Array.isArray(rules) ? rules : []));
}

function cloneOutboundWithTag(outbound, tag) {
  const next = JSON.parse(JSON.stringify(outbound || {}));
  next.tag = tag;
  return next;
}

function saveDisabledRouteRules() {
  if (!state.token) return;
  request('/api/routing/disabled', {
    method: 'POST',
    body: JSON.stringify({ rules: state.disabledRouteRules })
  }).catch((error) => {
    state.message = error.message || 'Не удалось сохранить отключенные правила на роутере';
    render();
  });
}

async function refreshDisabledRouteRules() {
  try {
    const result = await request('/api/routing/disabled');
    if (Array.isArray(result.rules)) {
      state.disabledRouteRules = result.rules.filter((item) => item && item.rule);
    }
  } catch {
    state.disabledRouteRules = [];
  }
}



const xrayConfigModel = createXrayConfigModel(state);
const {
  configInbounds,
  configOutbounds,
  advancedInbounds,
  currentSnifferSettings,
  tcpFastOpenDraftEnabled,
  currentDnsMode,
  outboundAddress,
  outboundTransport
} = xrayConfigModel;

let serverActions;
const checkServers = (...args) => serverActions.checkServers(...args);

const observatoryActions = createObservatoryActions({
  state,
  syncConfig,
  render,
  routeBalancers,
  proxyOutbounds: () => proxyOutbounds(),
  checkServers
});
const {
  strategyObserverType,
  observatoryConfig,
  burstObservatoryConfig,
  observatorySelectors,
  burstObservatorySelectors,
  outboundMatchesSelectors,
  observatoryMatchedOutbounds,
  observatoryRequiredBalancers,
  applyObserverForStrategy,
  observerLabel,
  balancerStrategyLabel,
  enableObservatoryForProxy,
  checkObservatoryTargets
} = observatoryActions;

const activeProxyTagForRouting = (...args) => activeProxyTag(...args);

function resolveRoutingAlias(tag) {
  const value = String(tag || '').trim();
  if (value === 'proxy') return activeProxyTagForRouting() || 'proxy';
  return value;
}

const routingDsl = createRoutingDsl({
  state,
  escapeHtml,
  resolveRoutingAlias,
  routeStatsFor
});
const {
  parseRoutingDsl,
  isDslDefaultRule,
  dslPreviewStats,
  dslPreviewView
} = routingDsl;





const routingActions = createRoutingActions({
  state,
  render,
  escapeHtml,
  routeKinds,
  routePresets,
  routeBundles,
  hiddenBuiltinRoutePresetKeys,
  request,
  parseRoutingDsl,
  isDslDefaultRule,
  dslPreviewStats,
  dslPreviewView,
  routeRules,
  setRoutingDraft,
  activeProxyTag: activeProxyTagForRouting,
  balancerOptions,
  splitRouteValues,
  routeTarget,
  routeRuleKey,
  readableRouteTag,
  encodedRouteTarget,
  isRuOpenRayManagedRoute,
  routeRuleName,
  setRouteRuleName,
  copyRouteRuleName,
  saveRouteNames,
  describeRouteRule,
  routeTargetFlagMarkup,
  routeTargetStatus,
  routeSectionDefinitions,
  routeCategoryForRule,
  routeRuleSource,
  routeTargetOptions,
  saveDisabledRouteRules
});
const {
  previewRoutingDsl,
  configAnalysisView,
  applyRoutingDsl,
  addRoutingRule,
  testRouteRuleTarget,
  resetRouteRuleForm,
  routeRuleFromForm,
  openRoutingRuleEditor,
  saveRoutingRuleEdit,
  addRoutingPreset,
  normalizePresetRule,
  applySelectedRoutingPresets,
  routePresetRules,
  routePresetTitle,
  routePresetDetail,
  routeRuleConditionCount,
  routePresetConditionCount,
  routePresetInstallSummary,
  routePresetInstallLabel,
  builtinRoutePresetEntries,
  ruleCountLabel,
  customRoutePreset,
  customRoutePresetEntries,
  saveCustomRoutePresets,
  scenarioIdFromTitle,
  routeRuleToDslLines,
  clearRoutePresetEditor,
  newRoutingPreset,
  editRoutingPreset,
  previewRoutePresetEdit,
  routePresetCheckResultView,
  applyRoutePresetEdit,
  saveRoutePresetEdit,
  deleteCustomRoutePreset,
  checkRoutePresetSource,
  saveRoutePresetSource,
  updateRoutePresetSources,
  deleteRoutePresetSource,
  toggleRoutePresetSource,
  removeRoutingRule,
  removeRoutingRuleRange,
  disableRoutingRule,
  disableRoutingRuleRange,
  removeSelectedRoutingRules,
  disableSelectedRoutingRules,
  restoreDisabledRouteRule,
  deleteDisabledRouteRule,
  visibleRoutingRuleItems,
  managedRoutingRuleItems,
  routeRowHtml,
  orderedRouteList,
  disableVisibleRoutingRules,
  restoreAllDisabledRouteRules,
  updateRoutingTarget,
  updateRoutingTargetRange,
  openRouteTargetReplaceDialog,
  closeRouteTargetReplaceDialog,
  applyRouteTargetReplacement,
  routeTargetReplacementSummary,
  moveRoutingRule,
  moveRoutingRuleInsideGroup,
  moveRoutingRuleRange,
  reorderRoutingRule,
  reorderRoutingRuleInsideGroup,
  reorderRoutingRuleRange,
  renameRoutingRule,
  selectedRouteRuleIndexes,
  toggleRouteRuleSelection,
  clearRouteRuleSelection,
  openSelectedRouteGroupDialog,
  closeSelectedRouteGroupDialog,
  createSelectedRouteGroup,
  groupRoutingRuleWithNext,
  renameRoutingRuleGroup
} = routingActions;


const serverModel = createServerModel({
  state,
  configOutbounds,
  routeRules,
  routeBalancers,
  routeTarget,
  outboundAddress,
  outboundTransport,
  outboundMatchesSelectors,
  observatorySelectors,
  burstObservatorySelectors,
  strategyObserverType,
  observerLabel,
  checkForTag,
  checkLabel,
  ruleCountLabel,
  escapeHtml,
  splitRouteValues
});
const {
  outboundUsage,
  serverStats,
  isSystemOutbound,
  proxyOutbounds,
  inferredActiveProxyTag,
  activeProxyTag,
  activeProxyOutbound,
  setActiveServerTag,
  proxyRuleStrategyStats,
  proxyRuleSampleLabel,
  proxyDirectionSummary,
  proxyDirectionTitle,
  proxyDirectionDetail,
  dashboardProxyDirectionCards,
  balancerSelectorMatches,
  balancerTargetOptions,
  balancerMatchesTag,
  serverSubscriptionPool,
  serverBalancerLinks,
  serverObserverLabels,
  serverLocationChip,
  serverMetaChips,
  balancerObserverSummary,
  balancerMembersView
} = serverModel;

const routeBalancerActions = createRouteBalancerActions({
  state,
  render,
  routeBalancers,
  routeRules,
  splitRouteValues,
  setRouteBalancersDraft,
  syncConfig,
  strategyObserverType,
  applyObserverForStrategy,
  observerLabel
});
const {
  resetRouteBalancerForm,
  openRouteBalancerDialog,
  closeRouteBalancerDialog,
  setRouteBalancerSelector,
  moveRouteBalancerSelector,
  saveRouteBalancer,
  removeRouteBalancer
} = routeBalancerActions;

function checkForTag(tag) {
  return state.serverChecks[tag] || null;
}

function checkLabel(result) {
  if (!result) return 'не проверен';
  if (result.skipped) return 'нет адреса для проверки';
  if (result.httpOk === false && result.endpointOk) {
    const error = String(result.error || '').toLowerCase();
    if (error.includes('timeout') || error.includes('deadline')) return 'порт открыт, HTTP таймаут';
    return 'порт открыт, HTTP не прошел';
  }
  if (result.httpOk === false) return 'HTTP не прошел';
  if (result.ok && result.httpOk === true) return `${result.httpLatencyMs || result.latencyMs || 0} мс`;
  if (result.ok && result.method === 'http') return `${result.latencyMs || 0} мс`;
  if (result.endpointOk) return 'порт открыт';
  if (result.pingOk) return 'ping есть';
  return 'нет ответа';
}

function checkMethodLabel(result) {
  if (!result) return 'не проверен';
  if (result.method === 'http') return 'HTTP';
  return 'порт сервера';
}

function proxyInboundTags() {
  const tags = configInbounds()
    .map((item) => item?.tag)
    .filter((tag) => tag && /transparent|rule|socks|http/.test(tag));
  return tags.length ? [...new Set(tags)] : undefined;
}

const devicesModel = createDevicesModel({
  state,
  routeRules,
  routeRuleName,
  describeRouteRule,
  splitRouteValues,
  escapeHtml,
  formatDuration
});
const {
  leaseByIp,
  leaseSearchText,
  routeLeasePicker,
  deviceRules,
  deviceStats,
  normalizeDeviceIp
} = devicesModel;

const dnsModel = createDnsModel({ state });
const {
  dnsConfig,
  describeDnsServer,
  dnsAddressHasPort,
  normalizeDnsAddressInput,
  dnsStats,
  dnsAnswerText,
  ensureDnsServer
} = dnsModel;

const firewallModel = createFirewallModel({
  state,
  configInbounds,
  configOutbounds,
  routeRules,
  splitRouteValues,
  deviceRules,
  routeRuleName,
  describeRouteRule
});
const {
  firewallInfo,
  firewallPorts,
  firewallDeviceChoices,
  firewallSelectedDevices,
  firewallPolicyPreview,
  firewallCommands,
  firewallPayload,
  firewallSafetyCheck,
  firewallReadyStatus,
  firewallPendingReasons
} = firewallModel;

const firewallActions = createFirewallActions({
  state,
  request,
  render,
  delay,
  firewallPayload,
  firewallCommands,
  firewallSafetyCheck,
  firewallReadyStatus
});
const {
  applyFirewallWithRetry,
  applyFirewall,
  disableFirewall,
  refreshFirewallStatus,
  downloadFirewallRules,
  setFirewallBypassMode,
  setFirewallRouterMode,
  setFirewallDeviceMode,
  setFirewallPortMode,
  toggleFirewallDevice,
  setFirewallBlockQuic,
  setQuicPolicy,
  setFirewallKillSwitchEnabled,
  setFirewallKillSwitchDomainMode,
  setFirewallKillSwitchDeviceMode,
  toggleFirewallKillSwitchDevice,
  setFirewallKillSwitchTargets
} = firewallActions;

const runtimeController = createRuntimeController({
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
});
const {
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
} = runtimeController;

const setupModel = createSetupModel({
  state,
  byteSize,
  firewallInfo,
  firewallReadyStatus,
  proxyOutbounds,
  request,
  syncConfig,
  ensureDnsServer
});
const {
  setupReadiness,
  loadSetupSnapshot,
  saveSetupSnapshot,
  clearSetupSnapshot,
  captureSetupSnapshot,
  lanDnsRestorePayload,
  setupRuleSignature,
  isIpLiteral,
  hostnameFromUrl,
  serverBootstrapDomains,
  ensureDnsBootstrapHosts,
  isSetupManagedRule,
  normalizeSetupRules,
  prepareSetupDraft
} = setupModel;

const setupActions = createSetupActions({
  state,
  request,
  render,
  refresh,
  syncLanDnsStatus,
  lanDnsModeLabel,
  setupReadiness,
  loadSetupSnapshot,
  captureSetupSnapshot,
  clearSetupSnapshot,
  lanDnsRestorePayload,
  prepareSetupDraft,
  applyFirewallWithRetry,
  firewallReadyStatus
});
const {
  openInstallWizard,
  openSetupWizard,
  setupPrepareDraft,
  waitForLanDnsReadiness,
  runSetupWizard,
  rollbackSetupWizard
} = setupActions;

const settingsActions = createSettingsActions({
  state,
  request,
  render,
  refresh,
  refreshLogs,
  configureLogTimer,
  configureStatusTimer,
  syncLoggingSettings,
  syncServiceSettings
});
const {
  login,
  logout,
  changePanelPassword,
  saveLoggingSettings,
  clearLoggingFiles,
  refreshDhcpLeases,
  saveServiceSettings,
  refreshStorageReport,
  cleanupStorageBackups,
  cleanupPackageCache,
  cleanupUnusedDat,
  setSystemTcpFastOpen,
  service
} = settingsActions;

const loginViewController = createLoginView({
  state,
  app,
  escapeHtml,
  login
});
const { loginView } = loginViewController;

const updatesActions = createUpdatesActions({
  state,
  request,
  upload,
  render,
  refresh,
  geoSelectedPresetIds: (...args) => geoSelectedPresetIds(...args)
});
const {
  updateCore,
  updateApp,
  checkAppUpdate,
  appVersionClick,
  updateGeo,
  checkGeoAudit,
  saveGeoSchedule,
  installCorePackage,
  cleanupGeoBackups,
  uploadGeoFile,
  deleteGeoFile,
  cleanupExtraGeoDat,
  cleanGeoSourcePayload,
  saveGeoSources,
  addGeoSource,
  editGeoPreset,
  resetGeoPresetOverride,
  editGeoSource,
  cancelGeoSourceEdit,
  removeGeoSource,
  toggleGeoSourceEnabled,
  addGeoList,
  editGeoList,
  cancelGeoListEdit,
  loadGeoCatalog,
  openGeoCatalogCategory,
  saveGeoCatalogCategory,
  removeGeoList,
  toggleGeoListEnabled
} = updatesActions;

function addGeoListToRouting(id) {
  const list = state.geoUserLists.find((item) => item.id === id);
  if (!list || !Array.isArray(list.items) || !list.items.length) return;
  const target = ['direct', 'block'].includes(list.target) ? list.target : activeProxyTagForRouting();
  const rule = {
    type: 'field',
    outboundTag: target,
  };
  if (list.kind === 'ip') rule.ip = [...list.items];
  else rule.domain = [...list.items];
  setRoutingDraft([...cloneRules(routeRules()), rule]);
  setRouteRuleName(rule, list.name || 'Geo-список');
  saveRouteNames();
  state.message = `Geo-список «${list.name || id}» добавлен в черновик маршрутизации`;
  render();
}

const configActions = createConfigActions({
  state,
  request,
  render,
  refresh,
  keepOperationVisible,
  recordXrayStatsSample,
  xrayStatsResetAtStorageKey,
  cancelServerDraftSave,
  activeProxyTag
});
const {
  testConfig,
  applyConfig,
  setXrayStats,
  resetXrayStats,
  analyzeConfig,
  restoreLatestBackup,
  downloadConfig,
  downloadAnonymizedConfig
} = configActions;

async function applyConfigAndFirewall() {
  const configDirty = configHasUnappliedChanges();
  const firewallDirty = firewallHasUnappliedChanges();
  if (!configDirty && !firewallDirty) {
    state.message = 'Непримененных изменений нет';
    render();
    return;
  }

  const steps = [
    configDirty ? { id: 'check-xray', label: 'Проверяю черновик Xray перед перезапуском', status: 'pending' } : null,
    configDirty ? { id: 'apply-xray', label: 'Записываю конфигурацию и перезапускаю Xray', status: 'pending' } : null,
    firewallDirty ? { id: 'apply-firewall', label: 'Применяю nftables без перезапуска Xray', status: 'pending' } : null,
    { id: 'refresh', label: 'Обновляю состояние панели', status: 'pending' }
  ].filter(Boolean);
  const setStep = (id, status, label = '') => {
    state.applySteps = (state.applySteps.length ? state.applySteps : steps).map((step) => step.id === id ? { ...step, status, label: label || step.label } : step);
    const current = state.applySteps.find((step) => step.status === 'running') || state.applySteps.find((step) => step.status === 'pending');
    state.busyLabel = current?.label || 'Применяю изменения';
    render();
  };
  state.applySteps = steps;
  state.busyAction = 'apply';
  state.busyLabel = steps[0]?.label || 'Применяю изменения';
  render();
  try {
    if (configDirty) {
      setStep('check-xray', 'running');
      await applyConfig({
        progressMessage: firewallDirty
          ? 'Проверяю конфигурацию, перезапускаю Xray, затем обновлю firewall...'
          : 'Проверяю конфигурацию и перезапускаю Xray...',
        successMessage: firewallDirty
          ? 'Xray применен, применяю firewall...'
          : 'Конфигурация Xray применена'
      });
      setStep('check-xray', 'done', 'Черновик Xray проверен');
      setStep('apply-xray', 'done', 'Xray перезапущен с новой конфигурацией');
    }

    if (firewallDirty || firewallHasUnappliedChanges()) {
      setStep('apply-firewall', 'running');
      await applyFirewall({
        busyAction: 'apply',
        busyLabel: configDirty ? 'Применяю firewall без перезапуска Xray' : '',
        successMessage: configDirty
          ? 'Xray и firewall применены'
          : 'Firewall-правила применены и сохранены для автозагрузки'
      });
      setStep('apply-firewall', 'done', 'Firewall применен');
    }
    setStep('refresh', 'done', 'Состояние обновлено');
  } catch (error) {
    const current = state.applySteps.find((step) => step.status === 'running') || state.applySteps.find((step) => step.status === 'pending');
    if (current) setStep(current.id, 'error', `${current.label}: ошибка`);
    throw error;
  } finally {
    if (state.busyAction === 'apply') state.busyAction = '';
    state.busyLabel = '';
    render();
  }
}








const importActions = createImportActions({
  state,
  request,
  render,
  refresh,
  syncConfig,
  applyConfig,
  isSystemOutbound,
  cloneOutboundWithTag,
  routeRules,
  activeProxyTag,
  setRoutingDraft,
  setActiveServerTag,
  persistServerMeta
});
const {
  importLink,
  serverImportPreviewItem,
  activeProfileName,
  suggestedSubscriptionBalancerTag,
  setActiveProxyDraft,
  importToCurrent,
  importSubscriptionToCurrent,
  previewImport,
  previewSubscription,
  importSubscription
} = importActions;

serverActions = createServerActions({
  state,
  request,
  render,
  refresh,
  syncConfig,
  keepOperationVisible,
  configOutbounds,
  proxyOutbounds,
  proxyRuleStrategyStats,
  setActiveProxyDraft,
  setActiveServerTag,
  applyConfig
});
const {
  removeOutbound,
  openServerEditor,
  closeServerEditor,
  setServerEditCountry,
  updateServerEditField,
  saveServerEdit,
  routeAllToOutbound,
  saveServerCheckHistorySettings,
  fallbackSubscriptionPool,
  cancelSubscriptionFallback,
  selectSubscriptionCandidate,
  checkSubscriptionCandidate,
  refreshSubscriptionPool,
  exportSubscriptionCandidates,
  deleteSubscriptionPool
} = serverActions;

const profileActions = createProfileActions({
  state,
  request,
  render,
  refresh
});
const {
  activateProfile,
  openProfileEditor,
  closeProfileEditor,
  saveProfileEditor,
  deleteProfile,
  downloadProfile,
  saveProfile,
  backup
} = profileActions;










































const sniActions = createSniActions({
  state,
  request,
  render,
  outboundAddress,
  activeProxyOutbound
});
const {
  scanSni,
  focusSniResult
} = sniActions;

const devicesActions = createDevicesActions({
  state,
  render,
  normalizeDeviceIp,
  proxyInboundTags,
  routeRules,
  setRoutingDraft
});
const {
  addDeviceRule,
  updateDeviceRule,
  removeDeviceRule
} = devicesActions;

const dnsActions = createDnsActions({
  state,
  request,
  render,
  syncConfig,
  syncLanDnsStatus,
  activeProxyTag,
  splitRouteValues,
  dnsConfig,
  normalizeDnsAddressInput,
  ensureDnsBootstrapHosts
});
const {
  addDnsServer,
  saveDnsHost,
  editDnsHost,
  removeDnsHost,
  applyDnsGuardPreset,
  removeDnsServer,
  moveDnsServer,
  prioritizeDohDnsServers,
  editDnsPolicy,
  saveDnsPolicy,
  clearDnsPolicy,
  checkDnsServer,
  checkDnsDiagnostics,
  applyLanDnsUpstream,
  applyDnsBootstrapHosts,
  previewLanDnsUpstream
} = dnsActions;

const setupView = createSetupView({
  state,
  shellQuote,
  escapeHtml,
  byteSize,
  setupReadiness,
  loadSetupSnapshot,
  firewallReadyStatus,
  firewallPorts,
});
const {
  normalizeCoreVersion,
  versionParts,
  compareCoreVersions,
  installedCoreVersion,
  releaseDate,
  filteredCoreReleases,
  coreUpdateInfo,
  coreReleaseBadge,
  appVersionPill,
  coreArchitectureText,
  githubInstallCommand
} = setupView;

const xrayDraftActions = createXrayDraftActions({
  state,
  render,
  syncConfig,
  advancedInbounds,
  currentSnifferSettings,
  proxyOutbounds,
  normalizeSetupRules,
  firewallCommands,
  githubInstallCommand
});
const {
  setSnifferDraft,
  setTcpFastOpenDraft,
  setDnsModeDraft,
  prepareTransparentDraft,
  prepareDnsInboundDraft,
  saveLocalProxyDraft,
  copyFirewallCommands,
  copyInstallCommand
} = xrayDraftActions;

const {
  setupPage,
  installWizardDialog,
  coreUpdateDialog
} = setupView;
const dashboardView = createDashboardView({
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
  logsPanel: (...args) => logsPanel(...args),
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
  serverLocationChip,
  configHasUnappliedChanges,
});
const {
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
  xrayStatsTotals
} = dashboardView;

const importDialogView = createImportDialogView({
  state,
  escapeHtml,
  checkForTag,
  checkLabel,
  outboundTransport,
  outboundAddress,
  serverCheckButton,
  suggestedSubscriptionBalancerTag,
  serverImportPreviewItem,
});
const {
  importButton,
  serverMini,
  emptyMini,
  importDialog,
  previewBox
} = importDialogView;

const serversView = createServersView({
  activeProxyTag,
  checkForTag,
  configOutbounds,
  escapeHtml,
  isSystemOutbound,
  operationProgressView,
  outboundAddress,
  outboundTransport,
  outboundUsage,
  proxyOutbounds,
  proxyRuleStrategyStats,
  routingBalancersPanel: (...args) => routingBalancersPanel(...args),
  serverCheckButton,
  serverLocationChip,
  serverMetaChips,
  serverStats,
  serverTrafficView,
  state,
  stat,
});
const {
  serverCard,
  subscriptionPoolCard,
  serverAvailabilityPanel,
  serversPanel
} = serversView;

const sniView = createSniView({
  state,
  escapeHtml,
  stat,
  outboundAddress,
  activeProxyOutbound,
});
const {
  clamp,
  ipParts,
  sniRadar,
  sniPanel
} = sniView;

const geoView = createGeoView({ state, escapeHtml, stat });
const {
  fileSize,
  geoSelectedPresetIds,
  geoSelectedPresets,
  geoRequiredSpace,
  geoDiskWarning,
  selectedGeoPreset,
  geoActionLabel,
  geoNandCard,
  geoPurposeLabel,
  geoEditorPanel,
  geoPanel
} = geoView;

const dnsView = createDnsView({
  activeProxyTag,
  configInbounds,
  currentDnsMode,
  describeDnsServer,
  dnsAnswerText,
  dnsConfig,
  dnsStats,
  escapeHtml,
  lanDnsModeLabel,
  routeRules,
  state,
  stat,
});
const { dnsPanel } = dnsView;

const auxPanelsView = createAuxPanelsView({
  state,
  labels,
  escapeHtml,
  stat,
  deviceRules,
  deviceStats,
  outboundOptions,
  leaseSearchText,
  formatDuration,
  leaseByIp,
});
const {
  devicesPanel,
  profilesPanel,
  logsPanel,
  accessLogRows,
  accessLogTable
} = auxPanelsView;

function applyLeaseSearch(scope, query) {
  const text = String(query || '').trim().toLowerCase();
  let visible = 0;
  scope.querySelectorAll('[data-lease-search-item]').forEach((item) => {
    const match = !text || String(item.dataset.leaseSearchText || '').includes(text);
    item.hidden = !match;
    if (match) visible += 1;
  });
  scope.querySelectorAll('[data-lease-search-empty]').forEach((item) => {
    item.hidden = visible !== 0 || !text;
  });
}

const diagnosticsModel = createDiagnosticsModel({
  state,
  routeRules,
  describeRouteRule,
  isIpLiteral,
});
const {
  domainDiagnosticRows,
  isPrivateIp,
  cleanLogHost,
  logEvents,
  aggregateLogDevices,
  aggregateLogDomains,
  domainMonitorProtocols,
  domainMonitorDevicesText,
  domainMonitorHost,
  domainMonitorMatchesFilter,
  domainMonitorMatchesDevice,
  domainMonitorMatchesQuery,
  domainMonitorRows,
  domainMonitorFilterCounts,
  currentDomainMonitor,
  monitoredDomains,
  monitoredDevices,
  monitoredEvents,
  monitorSourceLabel,
  selectedDomainMonitorDevice,
  domainMonitorDomainQuality
} = diagnosticsModel;

const diagnosticsActions = createDiagnosticsActions({
  state,
  request,
  render,
  byteSize,
  xrayActiveStats,
  activeProxyTag,
});
const {
  nftBytes,
  totalXrayStatsBytes,
  triggerBrowserTraffic,
  runConnectivityDiagnostics,
  runDpiDiagnostics,
  startClientTrafficTest,
  finishClientTrafficTest
} = diagnosticsActions;

const diagnosticsView = createDiagnosticsView({
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
  domainMonitorMatchesDevice,
  domainMonitorMatchesQuery,
  domainMonitorProtocols,
  domainMonitorRows,
  currentDomainMonitor,
  escapeHtml,
  isIpLiteral,
  logsPanel,
  monitorSourceLabel,
  monitoredDevices,
  monitoredDomains,
  monitoredEvents,
  selectedDomainMonitorDevice,
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
});
const {
  clientTrafficTestView,
  diagnosticsChainView,
  diagnosticsPanel,
  observatoryPanel
} = diagnosticsView;
const routingView = createRoutingView({
  state,
  escapeHtml,
  operationProgressView,
  stat,
  routeRules,
  routeStats,
  routeTargetOptions,
    visibleRoutingRuleItems,
    managedRoutingRuleItems,
    routeSectionDefinitions,
  orderedRouteList,
  describeRouteRule,
  routeRuleName,
  resolveRoutingAlias,
  dslPreviewView,
  configAnalysisView,
  builtinRoutePresetEntries,
  customRoutePresetEntries,
  ruleCountLabel,
  routePresetConditionCount,
  routePresetInstallSummary,
  routePresetInstallLabel,
  routeBalancers,
  observatoryPanel,
  balancerSelectorMatches,
  balancerObserverSummary,
  balancerStrategyLabel,
  balancerMembersView,
  currentSnifferSettings,
  tcpFastOpenDraftEnabled,
  firewallInfo,
  firewallReadyStatus,
  firewallPendingReasons,
  firewallPolicyPreview,
  firewallSafetyCheck,
  firewallDeviceChoices,
  firewallSelectedDevices,
  firewallCommands,
  geoEditorPanel,
  geoPanel,
});
const {
  routingRulesPanel,
  routingScenariosPanel,
  routingBalancersPanel,
  interceptAdvancedSections,
  interceptAdvancedAccordion,
  routingPanel,
  firewallPanel,
  firewallApplyPanel
} = routingView;

function placeholder(title, body) {
  return `
    <section class="panel">
      <div class="panel-title"><div><h2>${title}</h2><span>${body}</span></div></div>
      <p class="muted">Раздел подготовлен в MVP и будет подключен следующим шагом: визуальные правила маршрутизации, firewall/TProxy, GeoIP/GeoSite и настройки.</p>
    </section>
  `;
}

function loadingDashboard() {
  return `
    <section class="dash-hero is-loading">
      <div class="dash-status">
        <span class="eyebrow">Состояние роутера</span>
        <h2>Проверяем Xray</h2>
        <p>Получаем статус сервиса, ядра и активной конфигурации с OpenWrt.</p>
        ${noticeView(state, escapeHtml, { className: 'dash-notice' })}
      </div>
      <div class="dash-actions">
        <button class="btn secondary" data-action="refresh">Обновить статус</button>
      </div>
    </section>

    <section class="stats stats-dashboard">
      ${stat('Сервис', 'Проверяем', 'Ждём ответ OpenWrt service manager')}
      ${stat('Ядро', 'Проверяем', 'Пока не показываем действия установки')}
    </section>

    <section class="panel">
      <div class="panel-title">
        <div><h2>Загрузка панели</h2><span>Это занимает пару секунд после обновления страницы или перезапуска сервиса.</span></div>
      </div>
      <p class="muted">Если статус долго не появляется, проверьте доступность RuOpenRay UI и повторите обновление.</p>
    </section>
  `;
}

const settingsView = createSettingsView({ state, byteSize, escapeHtml });
const { settingsPanel } = settingsView;

function normalizedConfigDraftText() {
  try {
    return JSON.stringify(JSON.parse(state.jsonDraft || '{}'), null, 2);
  } catch {
    return state.jsonDraft || '';
  }
}

function configHasUnappliedChanges() {
  return Boolean(state.appliedConfigText && normalizedConfigDraftText() !== state.appliedConfigText);
}

function parseConfigText(text) {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return null;
  }
}

function safeConfigArray(config, path) {
  let current = config;
  for (const key of path) current = current && typeof current === 'object' ? current[key] : undefined;
  return Array.isArray(current) ? current : [];
}

function sameJsonValue(before, after) {
  return JSON.stringify(before ?? null) === JSON.stringify(after ?? null);
}

function compactCountDiff(label, before, after) {
  return before === after ? `${label} изменены` : `${label}: ${before} -> ${after}`;
}

function configProxyTags(config) {
  return safeConfigArray(config, ['outbounds'])
    .filter((outbound) => outbound?.tag && !['proxy', 'direct', 'block', 'dns-out', 'ruopenray-api'].includes(outbound.tag))
    .filter((outbound) => !['freedom', 'blackhole', 'dns'].includes(outbound?.protocol))
    .map((outbound) => outbound.tag);
}

function configTagDiff(beforeTags, afterTags) {
  const before = new Set(beforeTags);
  const after = new Set(afterTags);
  const added = afterTags.filter((tag) => !before.has(tag));
  const removed = beforeTags.filter((tag) => !after.has(tag));
  const parts = [];
  if (added.length) parts.push(`добавлено ${added.slice(0, 2).join(', ')}${added.length > 2 ? ` +${added.length - 2}` : ''}`);
  if (removed.length) parts.push(`удалено ${removed.slice(0, 2).join(', ')}${removed.length > 2 ? ` +${removed.length - 2}` : ''}`);
  return parts.join(' · ');
}

function pendingXrayChangeItems() {
  if (!configHasUnappliedChanges()) return [];
  const before = parseConfigText(state.appliedConfigText);
  const after = parseConfigText(normalizedConfigDraftText());
  if (!after) return ['Xray: черновик JSON не читается, сначала исправьте синтаксис'];
  if (!before) return ['Xray: будет применен новый черновик конфигурации'];

  const items = [];
  const beforeProxyTags = configProxyTags(before);
  const afterProxyTags = configProxyTags(after);
  if (!sameJsonValue(beforeProxyTags, afterProxyTags) || !sameJsonValue(safeConfigArray(before, ['outbounds']), safeConfigArray(after, ['outbounds']))) {
    const tagDiff = configTagDiff(beforeProxyTags, afterProxyTags);
    items.push(`Xray: proxy-серверы ${beforeProxyTags.length} -> ${afterProxyTags.length}${tagDiff ? ` · ${tagDiff}` : ''}`);
  }

  const beforeRules = safeConfigArray(before, ['routing', 'rules']);
  const afterRules = safeConfigArray(after, ['routing', 'rules']);
  if (!sameJsonValue(beforeRules, afterRules)) items.push(`Xray: ${compactCountDiff('правила маршрутизации', beforeRules.length, afterRules.length)}`);

  const beforeBalancers = safeConfigArray(before, ['routing', 'balancers']);
  const afterBalancers = safeConfigArray(after, ['routing', 'balancers']);
  if (!sameJsonValue(beforeBalancers, afterBalancers)) items.push(`Xray: ${compactCountDiff('группы серверов', beforeBalancers.length, afterBalancers.length)}`);

  const beforeInbounds = safeConfigArray(before, ['inbounds']);
  const afterInbounds = safeConfigArray(after, ['inbounds']);
  if (!sameJsonValue(beforeInbounds, afterInbounds)) items.push(`Xray: ${compactCountDiff('входящие потоки', beforeInbounds.length, afterInbounds.length)}`);

  const beforeDnsServers = safeConfigArray(before, ['dns', 'servers']);
  const afterDnsServers = safeConfigArray(after, ['dns', 'servers']);
  if (!sameJsonValue(before?.dns, after?.dns)) {
    items.push(`Xray: DNS ${beforeDnsServers.length} -> ${afterDnsServers.length}${!sameJsonValue(before?.dns?.hosts, after?.dns?.hosts) ? ' · hosts изменены' : ''}`);
  }

  if (!sameJsonValue(before?.stats, after?.stats) || !sameJsonValue(before?.policy, after?.policy)) items.push('Xray: статистика и policy изменены');
  if (!sameJsonValue(before?.log, after?.log)) items.push('Xray: настройки логирования изменены');
  if (!sameJsonValue(before?.observatory, after?.observatory) || !sameJsonValue(before?.burstObservatory, after?.burstObservatory)) items.push('Xray: наблюдение серверов изменено');

  return items.length ? items : ['Xray: черновик конфигурации отличается от примененной версии'];
}

function firewallHasUnappliedChanges() {
  if (!state.firewallStatus || typeof firewallReadyStatus !== 'function') return false;
  return !firewallReadyStatus(state.firewallStatus);
}

function pendingApplyRisks(configDirty, firewallDirty) {
  const risks = [];
  if (configDirty) {
    const missingGeo = Number(state.geoStatus?.audit?.summary?.missing || 0);
    const warnings = Number(state.geoStatus?.audit?.summary?.warnings || 0);
    if (missingGeo > 0) {
      risks.push({ level: 'danger', text: `Geo Doctor: ${missingGeo} ссылок не найдены в текущих dat-файлах` });
    } else if (warnings > 0) {
      risks.push({ level: 'warn', text: `Geo Doctor: есть ${warnings} предупреждений перед проверкой Xray` });
    }
  }
  if (firewallDirty && typeof firewallSafetyCheck === 'function') {
    const safety = firewallSafetyCheck();
    const items = Array.isArray(safety?.items) ? safety.items : [];
    items
      .filter((item) => item?.level === 'danger' || item?.level === 'warn')
      .slice(0, 3)
      .forEach((item) => risks.push({
        level: item.level,
        text: `${item.title || 'Firewall'}: ${item.detail || 'проверьте правило перед применением'}`
      }));
  }
  if (firewallDirty && state.firewallPortMode === 'all') {
    risks.push({ level: 'warn', text: 'Перехват всех портов: проверьте исключения роутера и локальной сети' });
  }
  return risks;
}

function pendingChangesBanner() {
  const configDirty = configHasUnappliedChanges();
  const firewallDirty = firewallHasUnappliedChanges();
  if (!configDirty && !firewallDirty) return '';
  const firewallReasons = firewallDirty && typeof firewallPendingReasons === 'function'
    ? firewallPendingReasons(state.firewallStatus || {})
    : [];
  const visibleFirewallReasons = firewallReasons.slice(0, 4);
  const xrayReasons = pendingXrayChangeItems();
  const visibleXrayReasons = xrayReasons.slice(0, 5);
  const applying = state.configApplying || state.firewallSaving || state.busyAction === 'apply';
  const changeItems = [
    configDirty ? 'Xray: будет проверена конфигурация и выполнен перезапуск сервиса' : '',
    firewallDirty ? 'Firewall: nftables и policy routing применятся без перезапуска Xray' : '',
    ...visibleXrayReasons,
    firewallDirty ? `Firewall: ${visibleFirewallReasons.join(' · ') || 'выбранные настройки перехвата будут применены в nftables'}` : '',
  ].filter(Boolean);
  const applyLabel = applying ? 'Применяю изменения...' : 'Применить изменения';
  const applySteps = Array.isArray(state.applySteps) && state.applySteps.length && applying ? state.applySteps : [];
  const risks = pendingApplyRisks(configDirty, firewallDirty);
  return `
    <section class="pending-changes" role="status" aria-live="polite">
      <div>
        <strong>Есть непримененные изменения</strong>
        <span>Ниже показано, что будет изменено и где потребуется перезапуск.</span>
        <ul class="pending-change-list">
          ${changeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
        ${xrayReasons.length > visibleXrayReasons.length ? `<small class="pending-more">Еще ${xrayReasons.length - visibleXrayReasons.length} ${xrayReasons.length - visibleXrayReasons.length === 1 ? 'отличие' : 'отличия'} в черновике Xray</small>` : ''}
        ${firewallReasons.length > visibleFirewallReasons.length ? `<small class="pending-more">Еще ${firewallReasons.length - visibleFirewallReasons.length} ${firewallReasons.length - visibleFirewallReasons.length === 1 ? 'отличие' : 'отличия'} в настройках перехвата</small>` : ''}
        ${risks.length ? `<div class="pending-risk-list">
          ${risks.map((item) => `<article class="${escapeHtml(item.level)}"><i></i><span>${escapeHtml(item.text)}</span></article>`).join('')}
        </div>` : ''}
        ${applySteps.length ? `<ol class="apply-step-list">
          ${applySteps.map((step) => `<li class="${escapeHtml(step.status || 'pending')}"><i></i><span>${escapeHtml(step.label)}</span></li>`).join('')}
        </ol>` : ''}
      </div>
      <div class="pending-actions">
        <button class="btn warning ${applying ? 'is-busy' : ''}" data-action="apply" ${applying || state.configTesting ? 'disabled' : ''}>${applyLabel}</button>
      </div>
    </section>
  `;
}

function setupStepOrder() {
  return ['environment', 'mode', 'dns', 'server', 'routing', 'firewall', 'verify'];
}

function setupStepGate(step) {
  const readiness = setupReadiness();
  const byKey = new Map((readiness.items || []).map((item) => [item.key, item]));
  const proxyCount = proxyOutbounds().length;
  const transparentReady = Boolean(byKey.get('transparent')?.ok);
  const firewallReady = typeof firewallReadyStatus === 'function' ? firewallReadyStatus(state.firewallStatus || {}) : false;
  const notice = (level, title, detail) => ({ ok: false, notice: { step, level, title, detail } });
  if (step === 'environment') {
    if (!byKey.get('core')?.ok) return notice('bad', 'Xray не найден', 'Сначала установите xray-core и зависимости OpenWrt. Откройте установку Xray на этом шаге.');
    if (!byKey.get('geo')?.ok) {
      return {
        ok: true,
        notice: {
          step,
          level: 'warn',
          title: 'Geo-файлы не готовы',
          detail: 'Для правил geoip/geosite нужны geoip.dat и geosite.dat. Мастер может идти дальше, но финальная проверка покажет ошибку, если правило ссылается на отсутствующую категорию.'
        }
      };
    }
  }
  if (step === 'server' && proxyCount < 1) {
    return notice('bad', 'Нет прокси-сервера', 'Добавьте сервер или подписку в разделе “Серверы”, затем вернитесь в мастер.');
  }
  if (step === 'firewall') {
    if (!transparentReady) {
      prepareSetupDraft({ message: false });
      return {
        ok: true,
        notice: {
          step,
          level: 'warn',
          title: 'Черновик перехвата подготовлен',
          detail: 'Мастер добавил входящий поток перехвата и служебные правила в черновик. На финальном шаге он проверит Xray и применит firewall.'
        }
      };
    }
    if (!firewallReady) {
      return {
        ok: true,
        notice: {
          step,
          level: 'warn',
          title: 'Firewall еще не применен',
          detail: 'Это нормально перед финальным шагом: мастер покажет, что изменится, и применит nftables вместе с Xray.'
        }
      };
    }
  }
  return { ok: true, notice: null };
}

function content() {
  if (!state.status) return loadingDashboard();
  if (state.tab === 'dashboard') return dashboard();
  if (state.tab === 'setup') return setupPage();
  if (state.tab === 'servers') return serversPanel();
  if (state.tab === 'diagnostics') return diagnosticsPanel();
  if (state.tab === 'sni') return sniPanel();
  if (state.tab === 'geo') return geoPanel();
  if (state.tab === 'devices') return devicesPanel();
  if (state.tab === 'dns') return dnsPanel();
  if (state.tab === 'profiles') return profilesPanel();
  if (state.tab === 'logs') return logsPanel();
  if (state.tab === 'routing') return routingPanel();
  if (state.tab === 'firewall') return firewallPanel();
  if (state.tab === 'settings') return settingsPanel();
  return placeholder('Настройки', 'Пароль панели, адрес привязки, имя сервиса и канал обновлений.');
}

const routingDialogsView = createRoutingDialogsView({
  state,
  escapeHtml,
  routeKinds,
  routePlaceholders,
  customRoutePresetEntries,
  builtinRoutePresetEntries,
  ruleCountLabel,
  routePresetConditionCount,
  routePresetInstallSummary,
  routePresetInstallLabel,
  routeTargetOptions,
  balancerOptions,
  routeLeasePicker,
  dslPreviewView,
  routeBalancers,
  balancerTargetOptions,
  splitRouteValues,
  balancerSelectorMatches,
  strategyObserverType,
  observerLabel,
  routeRules,
  balancerStrategyLabel,
  routePresetCheckResultView,
  describeRouteRule,
  routePresetRules,
  routeTargetReplacementSummary,
});

function routeRuleDialog(...args) {
  return routingDialogsView.routeRuleDialog(...args);
}

function routeBalancerDialog(...args) {
  return routingDialogsView.routeBalancerDialog(...args);
}

function routePresetDialog(...args) {
  return routingDialogsView.routePresetDialog(...args);
}

function selectedRouteGroupDialog(...args) {
  return routingDialogsView.selectedRouteGroupDialog(...args);
}

function routeTargetReplaceDialog(...args) {
  return routingDialogsView.routeTargetReplaceDialog(...args);
}

function captureRenderState() {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { tab: state.tab, scrollY: 0, details: { ...(state.openDetails || {}) } };
  }
  const details = { ...(state.openDetails || {}) };
  document.querySelectorAll('details[data-details-key]').forEach((node) => {
    const key = node.getAttribute('data-details-key');
    if (key) details[key] = node.open;
  });
  state.openDetails = details;
  return {
    tab: state.tab,
    scrollY: window.scrollY || 0,
    details,
  };
}

function restoreRenderState(snapshot) {
  if (!snapshot || typeof document === 'undefined') return;
  const details = { ...(state.openDetails || {}), ...(snapshot.details || {}) };
  Object.entries(details).forEach(([key, open]) => {
    const node = Array.from(document.querySelectorAll('details[data-details-key]'))
      .find((item) => item.getAttribute('data-details-key') === key);
    if (node) node.open = Boolean(open);
  });
  if (typeof window === 'undefined' || snapshot.tab !== state.tab) return;
  const top = Number(snapshot.scrollY || 0);
  requestAnimationFrame(() => window.scrollTo({ top, left: 0 }));
}

function render() {
  const renderSnapshot = captureRenderState();
  state.pendingBackgroundRender = false;
  applyUiTheme();
  if (!state.token) return loginView();
  document.body.classList.remove('is-login-page');
  const statusLoaded = Boolean(state.status);
  const running = state.status?.service?.running;
  const serviceManaged = Boolean(state.status?.service?.managed);
  const xrayUptime = Number(state.status?.service?.uptime || 0);
  const xrayOwner = state.status?.service?.external && state.status?.service?.owner
    ? ` через ${state.status.service.owner}`
    : '';
  const serviceBusy = ['start', 'stop', 'restart'].includes(state.busyAction);
  const xrayStatusText = statusLoaded
    ? running
      ? `Xray работает${xrayOwner}${xrayUptime > 0 ? ` · ${fmtUptime(xrayUptime)}` : ''}`
      : 'Xray остановлен'
    : 'Проверяем Xray';
  const activeProfile = activeProfileName();
  const hasApplySteps = Array.isArray(state.applySteps) && state.applySteps.length > 0 && state.busyAction === 'apply';
  const hasAppUpdateProgress = state.busyAction === 'checkAppUpdate' || state.appReleaseChecking;
  const hasLocalOperationProgress = state.configApplying || state.configTesting || state.firewallSaving || state.serverChecking || hasApplySteps || hasAppUpdateProgress;
  const showTopActionPill = state.busyAction && !hasAppUpdateProgress;
  const serviceButtons = [
    !statusLoaded
      ? null
      : running
        ? null
        : `<button class="service-icon ${state.busyAction === 'start' ? 'is-busy' : ''}" data-action="start" title="Запустить Xray" aria-label="Запустить Xray" ${serviceBusy ? 'disabled' : ''}>▶</button>`,
    statusLoaded && running && serviceManaged
      ? `<button class="service-icon ${state.busyAction === 'restart' ? 'is-busy' : ''}" data-action="restart" title="Перезапустить Xray" aria-label="Перезапустить Xray" ${serviceBusy ? 'disabled' : ''}>↻</button>`
      : null,
    statusLoaded && running && serviceManaged
      ? `<button class="service-icon danger ${state.busyAction === 'stop' ? 'is-busy' : ''}" data-action="stop" title="Остановить Xray" aria-label="Остановить Xray" ${serviceBusy ? 'disabled' : ''}>■</button>`
      : null,
  ].filter(Boolean).join('');
  app.innerHTML = `
    ${routeRuleDialog()}
    ${routeBalancerDialog()}
    ${routeTargetReplaceDialog()}
    ${importDialog(state.importDialog)}
    <div class="shell">
      <aside class="sidebar ${state.mobileNavOpen ? 'nav-open' : ''}">
        <div class="brand">
          <img class="brand-mark" src="/assets/ruopenray-icon-512.png" alt="" />
          <div><strong>RuOpenRay UI</strong><span>Панель Xray для OpenWrt</span></div>
        </div>
        <button class="mobile-menu-toggle" data-action="toggleMobileNav" type="button" aria-expanded="${state.mobileNavOpen ? 'true' : 'false'}">
          <span>${state.mobileNavOpen ? 'Закрыть меню' : 'Меню'}</span>
        </button>
        <nav class="nav">
          ${nav.map(([key, title]) => `<button class="${key === state.tab ? 'active' : ''}" data-tab="${key}">${title}</button>`).join('')}
        </nav>
        <div class="sidebar-footer">
          <button class="logout-button" data-action="logout" type="button" title="Выйти из панели" aria-label="Выйти из панели">
            <span aria-hidden="true">↩</span>
            <span>Выйти</span>
          </button>
        </div>
      </aside>
      <main class="main">
        ${state.busyAction && !hasLocalOperationProgress ? `
          <div class="global-action-progress" role="status" aria-live="polite">
            <span>${escapeHtml(state.busyLabel || 'Выполняю действие')}</span>
            <i></i>
          </div>
        ` : ''}
        <header class="topbar">
          <div class="title">
            <h1>${tabTitles[state.tab] || state.tab}</h1>
            ${state.status ? '' : '<p>Загрузка статуса роутера</p>'}
          </div>
          <div class="top-actions">
            ${showTopActionPill ? `<span class="pill action-pill"><i></i>${escapeHtml(state.busyLabel || 'Выполняю действие')}</span>` : ''}
            ${appVersionPill()}
            <span class="pill" title="${xrayUptime > 0 ? `xray-core запущен ${fmtUptime(xrayUptime)}` : 'Аптайм xray-core пока не определен'}"><i class="dot ${running ? 'ok' : ''}"></i>${escapeHtml(xrayStatusText)}</span>
            <button class="pill profile-pill" data-tab-jump="profiles" type="button" title="Выбрать профиль">${escapeHtml(activeProfile)}</button>
            <div class="service-controls" aria-label="Управление сервисом Xray">
              ${serviceButtons}
            </div>
          </div>
        </header>
        ${pendingChangesBanner()}
        ${content()}
      </main>
    </div>
    ${installWizardDialog()}
    ${coreUpdateDialog()}
    ${selectedRouteGroupDialog()}
    ${routePresetDialog()}
  `;
  bind();
  bindDetailsPersistence();
  decorateBusyActionButtons();
  restoreConfigScroll();
  restoreRenderState(renderSnapshot);
  scrollLogsToBottom();
}

function bindDetailsPersistence() {
  document.querySelectorAll('details[data-details-key]').forEach((node) => {
    const key = node.getAttribute('data-details-key');
    if (!key) return;
    node.addEventListener('toggle', () => {
      state.openDetails = { ...(state.openDetails || {}), [key]: node.open };
    });
  });
}

function decorateBusyActionButtons() {
  if (!state.busyAction) return;
  document.querySelectorAll('[data-action]').forEach((button) => {
    if (button.dataset.action !== state.busyAction) return;
    if (!(button instanceof HTMLButtonElement)) return;
    if (button.dataset.busyInline === '0') return;
    button.classList.add('is-busy');
    if (button.dataset.busyDisabled !== '0') button.disabled = true;
    const label = busyButtonLabel(state.busyAction, state.busyLabel || button.textContent || '');
    if (!label || button.dataset.busyLabelInline === '0') return;
    button.textContent = label;
    if (button.classList.contains('service-icon')) {
      button.classList.add('is-busy-label');
      button.setAttribute('aria-label', label);
      button.title = label;
    }
  });
}

function busyButtonLabel(action, fallback = '') {
  const map = {
    start: 'Запускаю',
    stop: 'Останавливаю',
    restart: 'Перезапускаю',
    refresh: 'Обновляю',
    test: 'Проверяю',
    apply: 'Применяю изменения',
    applyFirewall: 'Применяю firewall',
    disableFirewall: 'Отключаю',
    refreshFirewallStatus: 'Обновляю',
    downloadFirewallRules: 'Готовлю файл',
    prepareTransparent: 'Готовлю',
    prepareDnsInbound: 'Готовлю',
    checkServers: 'Проверяю',
    checkDns: 'Проверяю DNS',
    runSetupWizard: 'Применяю',
    setupPrepareDraft: 'Готовлю',
    installCorePackage: 'Устанавливаю',
    updateCore: 'Устанавливаю',
    updateGeo: 'Обновляю',
    checkGeoAudit: 'Проверяю geo',
    saveLoggingSettings: 'Сохраняю',
    saveServiceSettings: 'Сохраняю',
    previewLanDnsUpstream: 'Проверяю',
    applyLanDnsUpstream: 'Применяю DNS'
  };
  return map[action] || String(fallback || '').replace(/\s+/g, ' ').trim() || 'Выполняю';
}

function restoreConfigScroll() {
  const node = document.querySelector('#jsonDraft');
  if (!node || !state.configScrollTop) return;
  requestAnimationFrame(() => {
    const current = document.querySelector('#jsonDraft');
    if (current) current.scrollTop = state.configScrollTop;
  });
}

function openRoutePresetPicker() {
  resetRouteRuleForm();
  state.routeRuleDialog = true;
  state.routeRuleMode = 'presets';
  state.selectedRoutePresets = [];
  state.message = '';
  render();
}

async function loadCoreReleases({ force = false } = {}) {
  if (state.coreReleaseChecking) return;
  if (!force && state.coreReleases.length) return;
  state.coreReleaseChecking = true;
  state.coreReleasesError = '';
  if (force) state.message = 'Проверяю обновления Xray-core...';
  render();
  try {
    const result = await request('/api/core/releases');
    const loaded = Array.isArray(result?.releases) ? result.releases : [];
    state.coreReleases = loaded;
    state.coreAsset = result?.asset || state.coreAsset || '';
    state.coreArch = result?.arch || state.coreArch || null;
    state.coreReleasesError = loaded.length ? '' : 'GitHub вернул пустой список релизов Xray-core.';
    const selectedStillExists = state.selectedCoreVersion && loaded.some((release) => release.tag === state.selectedCoreVersion);
    if (!selectedStillExists) {
      const latestStable = loaded.find((release) => release.assetUrl && !release.prerelease);
      const latestInstallable = loaded.find((release) => release.assetUrl);
      state.selectedCoreVersion = latestStable?.tag || latestInstallable?.tag || loaded[0]?.tag || '';
    }
    if (force) {
      const info = coreUpdateInfo();
      state.message = info.hasUpdate
        ? `Доступно обновление Xray-core: ${info.current || 'текущая'} → ${info.target?.tag || state.selectedCoreVersion}`
        : state.coreReleasesError || 'Список релизов Xray-core обновлен';
    }
  } catch (error) {
    state.coreReleasesError = error.message || 'Не удалось загрузить список релизов Xray-core.';
    if (force) state.message = state.coreReleasesError;
  } finally {
    state.coreReleaseChecking = false;
    render();
  }
}

function bind() {
  bindNavigationControls({ state, render, configureLogTimer });
  bindModalControls();
  bindActionControls({
    state,
    render,
    handlers: {
      start: () => service('start'),
      stop: () => service('stop'),
      restart: () => service('restart'),
      toggleMobileNav: () => {
        state.mobileNavOpen = !state.mobileNavOpen;
        render();
      },
      logout,
      refresh,
      changePanelPassword,
      saveLoggingSettings,
      clearLoggingFiles,
      refreshDhcpLeases,
      saveServiceSettings,
      appVersionClick,
      checkAppUpdate,
      updateApp,
      test: testConfig,
      apply: applyConfigAndFirewall,
      applyFirewall,
      disableFirewall,
      refreshFirewallStatus,
      downloadFirewallRules,
      enableXrayStats: () => setXrayStats(true),
      disableXrayStats: () => setXrayStats(false),
      resetXrayStats,
      analyzeConfig,
      openCoreDialog: async () => {
        state.coreDialogOpen = true;
        render();
        await loadCoreReleases();
        const info = coreUpdateInfo();
        state.selectedCoreVersion = state.selectedCoreVersion || info.target?.tag || filteredCoreReleases().find((release) => release.assetUrl)?.tag || '';
        render();
      },
      checkCoreUpdates: () => loadCoreReleases({ force: true }),
      closeCoreDialog: () => {
        state.coreDialogOpen = false;
        render();
      },
      openRouteRuleDialog: () => {
        resetRouteRuleForm();
        state.routeRuleDialog = true;
        state.routeRuleMode = 'single';
        state.message = '';
        render();
      },
      openRouteRulePresets: () => openRoutePresetPicker(),
      openRoutePresetDialog: () => openRoutePresetPicker(),
      closeRouteRuleDialog: () => {
        state.routeRuleDialog = false;
        resetRouteRuleForm();
        state.selectedRoutePresets = [];
        state.message = '';
        render();
      },
      openRouteBalancerDialog,
      closeRouteBalancerDialog,
      saveRouteBalancer,
      newRoutePreset: newRoutingPreset,
      closeRoutePresetDialog: () => {
        state.routePresetDialog = false;
        clearRoutePresetEditor();
        render();
      },
      backToRoutePresets: () => {
        clearRoutePresetEditor();
        state.message = '';
        render();
      },
      selectAllRoutePresets: () => {
        state.selectedRoutePresets = [
          ...customRoutePresetEntries().map(([key]) => key),
          ...builtinRoutePresetEntries().map(([key]) => key)
        ].filter((key) => !routePresetInstallSummary(key).installed);
        render();
      },
      clearRoutePresets: () => {
        state.selectedRoutePresets = [];
        render();
      },
      applyRoutePresets: applySelectedRoutingPresets,
      openSelectedRouteGroupDialog,
      openRouteTargetReplaceDialog,
      closeRouteTargetReplaceDialog,
      applyRouteTargetReplacement,
      disableSelectedRouteRules: disableSelectedRoutingRules,
      removeSelectedRouteRules: removeSelectedRoutingRules,
      clearRouteRuleSelection,
      closeSelectedRouteGroupDialog,
      createSelectedRouteGroup,
      checkRoutePresetSource,
      saveRoutePresetSource,
      updateRoutePresetSources: () => updateRoutePresetSources(),
      previewRoutePresetEdit,
      saveRoutePresetEdit,
      applyRoutePresetEdit,
      openInstallWizard,
      openSetupWizard,
      closeSetupWizard: () => {
        state.setupWizardOpen = false;
        render();
      },
      setupStepBack: () => {
        const steps = setupStepOrder();
        const index = Math.max(0, steps.indexOf(state.setupStep || 'environment'));
        state.setupStep = steps[Math.max(0, index - 1)] || 'environment';
        state.setupStepNotice = null;
        render();
      },
      setupStepNext: () => {
        const gate = setupStepGate(state.setupStep || 'environment');
        if (!gate.ok) {
          state.setupStepNotice = gate.notice;
          render();
          return;
        }
        const steps = setupStepOrder();
        const index = Math.max(0, steps.indexOf(state.setupStep || 'environment'));
        const nextStep = steps[Math.min(steps.length - 1, index + 1)] || 'verify';
        state.setupStep = nextStep;
        state.setupStepNotice = gate.notice ? { ...gate.notice, step: nextStep } : null;
        render();
      },
      setupPrepareDraft,
      runSetupWizard,
      rollbackSetupWizard,
      clearSetupSnapshot: () => {
        clearSetupSnapshot();
        render();
      },
      refreshInstallPlan: async () => {
        state.installPlan = await request('/api/install/plan');
        render();
      },
      closeInstallWizard: () => {
        state.installWizardOpen = false;
        render();
      },
      updateCore,
      installCorePackage,
      updateGeo,
      checkGeoAudit,
      saveGeoSchedule,
      cleanupGeoBackups,
      refreshStorageReport,
      cleanupStorageBackups,
      cleanupPackageCache,
      cleanupUnusedDat,
      uploadGeoFile,
      cleanupExtraGeoDat,
      addGeoSource,
      addGeoList,
      saveGeoCatalogCategory,
      refreshLogs: () => refreshLogs(true, true),
      runConnectivityDiagnostics,
      runDpiDiagnostics,
      refreshDomainMonitor: () => refreshDomainMonitor(true, { force: true }),
      startDomainMonitor: () => controlDomainMonitor('start'),
      stopDomainMonitor: () => controlDomainMonitor('stop'),
      clearDomainMonitor: () => controlDomainMonitor('clear'),
      enableDnsmasqLogqueries: () => controlDomainMonitor('dnsmasq-logqueries', { enabled: true }),
      disableDnsmasqLogqueries: () => controlDomainMonitor('dnsmasq-logqueries', { enabled: false }),
      toggleConfig: () => {
        state.configExpanded = !state.configExpanded;
        render();
      },
      downloadConfig,
      downloadAnonymizedConfig,
      import: importLink,
      previewImport,
      importToCurrent: () => importToCurrent(false),
      importActive: () => importToCurrent(true),
      previewSubscription,
      importSubscription,
      importSubscriptionToCurrent: () => importSubscriptionToCurrent(false),
      importSubscriptionActive: () => importSubscriptionToCurrent(true),
      closeImport: () => {
        state.importDialog = '';
        state.importCountry = '';
        state.importCountrySearch = '';
        render();
      },
      closeServerEdit: closeServerEditor,
      saveServerEdit,
      addRoute: addRoutingRule,
      testRouteRuleTarget,
      saveRouteEdit: saveRoutingRuleEdit,
      previewRouteDsl: previewRoutingDsl,
      appendRouteDsl: () => applyRoutingDsl('append'),
      appendRouteDslFromDialog: () => applyRoutingDsl('append', true),
      replaceRouteDsl: () => applyRoutingDsl('replace'),
      filterRoutes: render,
      disableVisibleRoutes: disableVisibleRoutingRules,
      restoreAllDisabledRoutes: restoreAllDisabledRouteRules,
      enableTcpFastOpenSystem: () => setSystemTcpFastOpen(true),
      disableTcpFastOpenSystem: () => setSystemTcpFastOpen(false),
      enableTcpFastOpenDraft: () => setTcpFastOpenDraft(true),
      disableTcpFastOpenDraft: () => setTcpFastOpenDraft(false),
      prepareTransparent: prepareTransparentDraft,
      prepareDnsInbound: prepareDnsInboundDraft,
      saveLocalProxyDraft,
      copyFirewall: copyFirewallCommands,
      copyInstallCommand: () => copyInstallCommand(),
      copyInstallWithXrayCommand: () => copyInstallCommand(true),
      startClientTrafficTest,
      finishClientTrafficTest,
      addDevice: addDeviceRule,
      addDns: addDnsServer,
      saveDnsHost,
      saveDnsPolicy,
      clearDnsPolicy,
      previewLanDnsUpstream,
      applyLanDnsUpstream,
      dnsWizardSecure: () => applyDnsGuardPreset('secure'),
      dnsWizardRu: () => applyDnsGuardPreset('ru'),
      dnsWizardStrict: () => applyDnsGuardPreset('strict'),
      checkDns: checkDnsServer,
      checkDnsDiagnostics,
      applyDnsBootstrapHosts,
      checkServers,
      saveServerCheckHistorySettings,
      checkObservatoryTargets,
      enableObservatoryForProxy,
      fallbackSubscription: (button) => fallbackSubscriptionPool(button.dataset.subscriptionFallback || ''),
      cancelSubscriptionFallback,
      selectSubscriptionCandidate: (button) => selectSubscriptionCandidate(button.dataset.subscriptionSelect || '', button.dataset.subscriptionCandidateIndex || 0),
      checkSubscriptionCandidate: (button) => checkSubscriptionCandidate(button.dataset.subscriptionCheck || '', button.dataset.subscriptionCandidateIndex || 0),
      refreshSubscription: (button) => refreshSubscriptionPool(button.dataset.subscriptionRefresh || ''),
      exportSubscriptionSelected: (button) => {
        const tag = button.dataset.subscriptionExport || '';
        const indexes = [...document.querySelectorAll(`[data-subscription-candidate-pick="${CSS.escape(tag)}"]:checked`)].map((item) => Number(item.value));
        exportSubscriptionCandidates(tag, indexes);
      },
      exportSubscriptionAll: (button) => exportSubscriptionCandidates(button.dataset.subscriptionExport || '', [], { all: true }),
      deleteSubscription: (button) => deleteSubscriptionPool(button.dataset.subscriptionDelete || ''),
      scanSni,
      closeProfileEdit: closeProfileEditor,
      saveProfileEditor,
      saveProfile,
      backup,
      restoreLatestBackup,
    },
  });
  bindCoreControls({
    state,
    render,
    filteredCoreReleases,
  });
  bindSettingsControls({
    state,
    render,
    setUiTheme,
    installPasswordStorageKey,
    githubInstallCommand,
  });
  bindGeoControls({
    state,
    render,
    toggleGeoSourceEnabled,
    removeGeoSource,
    editGeoPreset,
    resetGeoPresetOverride,
    editGeoSource,
    cancelGeoSourceEdit,
    deleteGeoFile,
    toggleGeoListEnabled,
    removeGeoList,
    editGeoList,
    cancelGeoListEdit,
    loadGeoCatalog,
    openGeoCatalogCategory,
    saveGeoCatalogCategory,
    addGeoListToRouting,
  });
  bindDeviceControls({
    state,
    render,
    updateDeviceRule,
    removeDeviceRule,
  });
  bindDnsControls({
    state,
    render,
    removeDnsServer,
    moveDnsServer,
    prioritizeDohDnsServers,
    editDnsHost,
    removeDnsHost,
    editDnsPolicy,
    setDnsModeDraft,
  });
  bindRoutingControls({
    state,
    render,
    addRoutingPreset,
    editRoutingPreset,
    deleteCustomRoutePreset,
    deleteRoutePresetSource,
    toggleRoutePresetSource,
    updateRoutePresetSources,
    removeRoutingRule,
    removeRoutingRuleRange,
    disableRoutingRule,
    disableRoutingRuleRange,
    removeSelectedRoutingRules,
    disableSelectedRoutingRules,
    restoreDisabledRouteRule,
    deleteDisabledRouteRule,
    moveRoutingRule,
    moveRoutingRuleInsideGroup,
    reorderRoutingRuleInsideGroup,
    moveRoutingRuleRange,
    toggleRouteRuleSelection,
    groupRoutingRuleWithNext,
    renameRoutingRuleGroup,
    openRoutingRuleEditor,
    openRouteBalancerDialog,
    removeRouteBalancer,
    setFirewallBypassMode,
    setFirewallRouterMode,
    setFirewallDeviceMode,
    toggleFirewallDevice,
    reorderRoutingRule,
    reorderRoutingRuleRange,
    routeRules,
    describeRouteRule,
    routeTargetFlagMarkup,
    routeTargetStatus,
    updateRoutingTarget,
    updateRoutingTargetRange,
    removeOutbound,
    openServerEditor,
    setServerEditCountry,
    updateServerEditField,
    routeAllToOutbound,
    checkServers,
    setSnifferDraft,
    setQuicPolicy,
    currentSnifferSettings,
    setFirewallPortMode,
    setFirewallBlockQuic,
    setFirewallKillSwitchEnabled,
    setFirewallKillSwitchDomainMode,
    setFirewallKillSwitchDeviceMode,
    toggleFirewallKillSwitchDevice,
    setFirewallKillSwitchTargets,
    applyLeaseSearch,
    setRouteBalancerSelector,
    moveRouteBalancerSelector,
    balancerOptions,
  });
  bindDiagnosticsControls({
    state,
    render,
    domainMonitorFilterStorageKey,
    activeProxyTag,
    runDpiDiagnostics,
    probeMonitoredDomain,
    focusSniResult,
    refreshLogs,
    configureLogTimer,
    scrollLogsToBottom,
  });
  bindProfileControls({ state, activateProfile, openProfileEditor, deleteProfile, downloadProfile });
  bindConfigControls({ state, scheduleServerDraftSave });
  bindImportControls({ state, render });
  bindServerCheckControls({ state, render });

}

render();
if (state.token) {
  configureLogTimer();
  configureStatusTimer();
  refresh({ background: true });
}

document.addEventListener('focusout', () => {
  setTimeout(flushPendingBackgroundRender, 80);
}, true);
document.addEventListener('pointerup', () => {
  setTimeout(flushPendingBackgroundRender, 80);
}, true);
