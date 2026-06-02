import { createAuxPanelsView } from '../cmd/ruopenray-ui/web/aux-panels-view.js';
import { bindActionControls } from '../cmd/ruopenray-ui/web/action-bindings.js';
import { anonymizeConfig, createConfigActions } from '../cmd/ruopenray-ui/web/config-actions.js';
import { bindConfigControls } from '../cmd/ruopenray-ui/web/config-bindings.js';
import { createDevicesModel } from '../cmd/ruopenray-ui/web/devices-model.js';
import { bindCoreControls } from '../cmd/ruopenray-ui/web/core-bindings.js';
import { bindDiagnosticsControls } from '../cmd/ruopenray-ui/web/diagnostics-bindings.js';
import { createDiagnosticsActions } from '../cmd/ruopenray-ui/web/diagnostics-actions.js';
import { createDiagnosticsModel } from '../cmd/ruopenray-ui/web/diagnostics-model.js';
import { createDevicesActions } from '../cmd/ruopenray-ui/web/devices-actions.js';
import { bindDeviceControls } from '../cmd/ruopenray-ui/web/devices-bindings.js';
import { createDnsActions } from '../cmd/ruopenray-ui/web/dns-actions.js';
import { bindDnsControls } from '../cmd/ruopenray-ui/web/dns-bindings.js';
import { createDnsModel } from '../cmd/ruopenray-ui/web/dns-model.js';
import { createDashboardView } from '../cmd/ruopenray-ui/web/dashboard-view.js';
import { byteSize as formatByteSize, escapeHtml, formatDurationCompact } from '../cmd/ruopenray-ui/web/formatters.js';
import { createFirewallActions } from '../cmd/ruopenray-ui/web/firewall-actions.js';
import { bindGeoControls } from '../cmd/ruopenray-ui/web/geo-bindings.js';
import { firewallDraftFromStatus, hydrateFirewallDraftFromStatus } from '../cmd/ruopenray-ui/web/firewall-state.js';
import { createImportActions } from '../cmd/ruopenray-ui/web/import-actions.js';
import { bindImportControls } from '../cmd/ruopenray-ui/web/import-bindings.js';
import { bindModalControls, bindNavigationControls } from '../cmd/ruopenray-ui/web/navigation-bindings.js';
import { createObservatoryActions } from '../cmd/ruopenray-ui/web/observatory-actions.js';
import { createProfileActions } from '../cmd/ruopenray-ui/web/profile-actions.js';
import { bindProfileControls } from '../cmd/ruopenray-ui/web/profile-bindings.js';
import { bindRoutingControls } from '../cmd/ruopenray-ui/web/routing-bindings.js';
import { createRuntimeController } from '../cmd/ruopenray-ui/web/runtime-controller.js';
import {
  expandRoutePresetRules,
  routePresetRuleSetMatches,
  routeRuleConditionKey,
  splitMixedRouteRule
} from '../cmd/ruopenray-ui/web/routing-rule-helpers.js';
import { createRouteBalancerActions } from '../cmd/ruopenray-ui/web/route-balancer-actions.js';
import { routePresetExportIcon, routePresetIconView } from '../cmd/ruopenray-ui/web/route-visuals.js';
import { createRoutingActions } from '../cmd/ruopenray-ui/web/routing-actions.js';
import { createRoutingDialogsView } from '../cmd/ruopenray-ui/web/routing-dialogs-view.js';
import { createRoutingDsl } from '../cmd/ruopenray-ui/web/routing-dsl.js';
import { createRoutingModel } from '../cmd/ruopenray-ui/web/routing-model.js';
import { bindServerCheckControls } from '../cmd/ruopenray-ui/web/server-check-bindings.js';
import { createServerActions } from '../cmd/ruopenray-ui/web/server-actions.js';
import { createFirewallModel } from '../cmd/ruopenray-ui/web/firewall-model.js';
import { createServerModel } from '../cmd/ruopenray-ui/web/server-model.js';
import { createServersView } from '../cmd/ruopenray-ui/web/servers-view.js';
import { createSettingsActions } from '../cmd/ruopenray-ui/web/settings-actions.js';
import { createSetupActions } from '../cmd/ruopenray-ui/web/setup-actions.js';
import { createSetupModel } from '../cmd/ruopenray-ui/web/setup-model.js';
import { bindSettingsControls } from '../cmd/ruopenray-ui/web/settings-bindings.js';
import { authRememberStorageKey, clearAuthToken, loadAuthToken } from '../cmd/ruopenray-ui/web/storage.js';
import { createSniView } from '../cmd/ruopenray-ui/web/sni-view.js';
import { createSniActions } from '../cmd/ruopenray-ui/web/sni-actions.js';
import { createUpdatesActions } from '../cmd/ruopenray-ui/web/updates-actions.js';
import { createXrayDraftActions } from '../cmd/ruopenray-ui/web/xray-draft-actions.js';
import { createXrayConfigModel } from '../cmd/ruopenray-ui/web/xray-config-model.js';

const state = {
  clientTrafficUrl: 'https://www.gstatic.com/generate_204',
  dashboardLogsOpen: false,
  deviceIp: '',
  deviceMode: 'proxy',
  deviceName: '',
  diagnosticsTestUrl: 'https://www.gstatic.com/generate_204',
  domainMonitor: {
    devices: [{ name: 'phone', ip: '192.168.1.2', hits: 2, topDomains: [{ host: 'chatgpt.com' }] }],
    domains: [{ host: 'chatgpt.com', hits: 2, protocols: ['TCP'], lastSeenTs: 2 }],
    events: [{ host: 'chatgpt.com', protocol: 'TCP', timestamp: 2 }],
    source: 'xray-access',
  },
  domainMonitorFilter: 'all',
  domainMonitorMode: 'domains',
  domainMonitorQuery: '',
  domainMonitorSort: 'hits',
  leaseSearch: '',
  leases: [],
  leasesSource: '/tmp/dhcp.leases',
  logFollow: true,
  logIntervalSec: 2,
  logKind: 'all',
  logLevel: 'all',
  logLines: 240,
  logLive: true,
  logQuery: '',
  logSort: 'asc',
  logs: 'tcp:192.168.1.2:50000 accepted tcp:chatgpt.com:443 [proxy]',
  message: '',
  profiles: [],
  routeName: '',
  routeOutbound: 'proxy',
  routeRuleDialog: false,
  routeRuleEditingIndex: -1,
  routeRuleMode: 'single',
  routeTargetType: 'outbound',
  routeValue: '',
  sniCidr: '24',
  sniLimit: '256',
  sniScan: null,
  sniScanning: false,
  sniTarget: '',
  sniThreads: '16',
  sniTimeout: '1500',
};

const stat = (label, value, detail) => `<div>${escapeHtml(label)}${escapeHtml(value)}${escapeHtml(detail)}</div>`;
let renders = 0;
const render = () => { renders += 1; };

const aux = createAuxPanelsView({
  state,
  labels: { active: 'active', stored: 'stored' },
  escapeHtml,
  stat,
  deviceRules: () => [],
  deviceStats: () => ({ proxy: 0, direct: 0, block: 0, other: 0 }),
  outboundOptions: () => ['proxy', 'direct', 'block'],
  leaseSearchText: () => '',
  formatDuration: () => '',
  leaseByIp: () => null,
});

const dashboardState = {
  config: {
    outbounds: [
      { tag: 'cloudtwo', protocol: 'vless', settings: { vnext: [{ address: 'cloudtwo.example', port: 443 }] } },
      { tag: 'direct', protocol: 'freedom' },
      { tag: 'block', protocol: 'blackhole' },
    ],
    routing: { rules: [
      { outboundTag: 'cloudtwo', domain: ['domain:telegram.org'] },
      { outboundTag: 'direct', ip: ['geoip:private'] },
    ] },
    dns: { servers: ['https://dns.google/dns-query'] },
  },
  status: {
    service: { running: true },
    core: { available: true, version: 'Xray test' },
    config: { path: '/etc/xray/config.json', inbounds: 6, outbounds: 7, routingRules: 61 },
  },
  leases: [{ ip: '192.168.1.10' }],
  logs: '',
  serverCheckMode: 'http',
  serverChecks: {},
  serverCheckingTags: [],
  dashboardSelectedServerTag: '',
};
const dashboardView = createDashboardView({
  state: dashboardState,
  labels: { available: 'Доступно', missing: 'Не найден' },
  escapeHtml,
  routeStats: () => ({ proxy: dashboardState.config.routing?.rules?.filter((rule) => rule.outboundTag === 'cloudtwo').length || 0, direct: 1, block: 0, other: 0 }),
  deviceStats: () => ({ proxy: 3, direct: 0, block: 0, other: 0 }),
  dnsStats: () => ({ servers: dashboardState.config.dns?.servers?.length || 0, doh: 1 }),
  coreUpdateInfo: () => ({}),
  proxyOutbounds: () => (dashboardState.config.outbounds || []).filter((outbound) => outbound.tag === 'cloudtwo'),
  deviceRules: () => [{ source: ['192.168.1.10'] }],
  outboundAddress: (outbound) => outbound?.settings?.vnext?.[0]?.address || '',
  logsPanel: () => '',
  byteSize: formatByteSize,
  fmtUptime: () => '',
  byteRate: (value) => `${Number(value || 0)} B/s`,
  numberValue: (value) => Number(value || 0),
  activeProxyTag: () => 'cloudtwo',
  configOutbounds: () => dashboardState.config.outbounds || [],
  releaseDate: () => '',
  coreReleaseBadge: () => '',
  outboundTransport: () => 'tcp',
  proxyDirectionSummary: () => ({ outbounds: new Map([['cloudtwo', { rules: 33 }]]), balancers: new Map(), total: 33 }),
  proxyDirectionTitle: () => 'Proxy-направления',
  proxyDirectionDetail: () => '1 активное направление',
  dashboardProxyDirectionCards: () => '',
  checkForTag: () => null,
  checkLabel: () => '',
  checkMethodLabel: () => '',
  serverLocationChip: () => '',
  configHasUnappliedChanges: () => false,
});
const dashboardWarmHtml = dashboardView.dashboard();
dashboardState.config = { outbounds: [], routing: { rules: [] }, dns: { servers: [] } };
const dashboardAfterTransientEmptyConfig = dashboardView.dashboard();
const dashboardKeepsLastSnapshot = dashboardWarmHtml.includes('cloudtwo')
  && dashboardAfterTransientEmptyConfig.includes('cloudtwo')
  && dashboardAfterTransientEmptyConfig.includes('proxy 1 / direct 1')
  && !dashboardAfterTransientEmptyConfig.includes('Серверы пока не добавлены');

const model = createDiagnosticsModel({
  state,
  routeRules: () => [{ domain: ['domain:chatgpt.com'] }],
  describeRouteRule: (rule) => (rule.domain ? { kind: 'domain' } : { kind: 'other' }),
  isIpLiteral: (value) => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(value || '')),
});
state.domainMonitorPaused = true;
state.domainMonitorPausedSnapshot = {
  domains: [{ host: 'paused.example', hits: 1, protocols: ['DNS'], lastSeenTs: 1 }],
  devices: [{ name: 'paused-phone', ip: '192.168.1.50', hits: 1 }],
  events: [{ host: 'paused.example', protocol: 'DNS', timestamp: 1 }],
  source: 'xray-access',
};
const pausedMonitorFrozen = model.monitoredEvents()[0]?.host === 'paused.example'
  && model.monitoredDomains()[0]?.host === 'paused.example'
  && model.monitoredDevices()[0]?.ip === '192.168.1.50';
state.domainMonitorPaused = false;
state.domainMonitorPausedSnapshot = null;
const devicesModel = createDevicesModel({
  state: {
    routeKind: 'source',
    routeValue: '192.168.1.2',
    leaseSearch: '',
    leasesSource: '/tmp/dhcp.leases',
    leases: [{ name: 'phone', ip: '192.168.1.2', mac: 'aa:bb', remaining: 3600 }],
  },
  routeRules: () => [{ source: ['192.168.1.2'], outboundTag: 'proxy' }],
  routeRuleName: () => 'phone',
  describeRouteRule: () => ({ kind: 'source' }),
  splitRouteValues: (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
  escapeHtml,
  formatDuration: () => '1 ч',
});

const deviceActionState = {
  config: { routing: { rules: [] } },
  deviceIp: '192.168.1.77',
  deviceMode: 'proxy',
  deviceName: '',
};
const devicesActions = createDevicesActions({
  state: deviceActionState,
  render,
  normalizeDeviceIp: (value) => String(value || '').trim(),
  proxyInboundTags: () => ['transparent_ipv4'],
  routeRules: () => deviceActionState.config.routing.rules,
  setRoutingDraft: (rules) => {
    deviceActionState.config.routing.rules = rules;
  },
});
devicesActions.addDeviceRule();

const actions = createDiagnosticsActions({
  state,
  request: async (path) => {
    if (path === '/api/firewall/status') return { nft: { stdout: 'counter packets 1 bytes 64' } };
    if (path === '/api/xray/stats') return { outbounds: [{ uplink: 10, downlink: 20 }] };
    return { ok: true };
  },
  render,
  byteSize: (value) => `${value} B`,
  xrayActiveStats: () => ({ tag: 'proxy' }),
  activeProxyTag: () => 'proxy',
});
const runtimeState = {
  logKind: 'all',
  logLevel: 'all',
  logQuery: 'chatgpt',
  logLines: 50,
  logSort: 'asc',
  trafficHistory: [],
  xrayTrafficHistory: [],
  status: {},
};
const runtime = createRuntimeController({
  state: runtimeState,
  api: { text: async () => '2\n1' },
  request: async () => ({}),
  render,
  numberValue: (value) => Number(value || 0),
  activeProxyTag: () => 'proxy',
  syncConfig: () => {},
  proxyOutbounds: () => [{ tag: 'proxy' }],
  setActiveServerTag: () => {},
  inferredActiveProxyTag: () => 'proxy',
  syncLanDnsStatus: () => {},
  disabledRouteRulesStorageKey: 'ruopenray:test:disabled',
  syncLoggingSettings: () => {},
  syncServiceSettings: () => {},
  clearAuth: () => {},
});
const setupConfig = {
  inbounds: [],
  outbounds: [{ tag: 'proxy', protocol: 'vless', settings: { vnext: [{ address: 'cloudone.example', port: 443 }] } }],
  routing: { rules: [{ outboundTag: 'direct', ip: ['geoip:private'] }] },
  dns: { servers: ['https://dns.google/dns-query'] },
};
const setupState = {
  config: setupConfig,
  jsonDraft: JSON.stringify(setupConfig),
  status: { core: { available: true, version: 'Xray test' } },
  geoStatus: { geoip: { exists: true, size: 1 }, geosite: { exists: true, size: 1 } },
  firewallStatus: { active: true, persistent: true, routerMode: 'tproxy' },
  lanDnsStatus: { mode: 'xray', readiness: { ready: true } },
  firewallRouterMode: 'tproxy',
  setupLanDnsMode: 'keep',
};
const setupModel = createSetupModel({
  state: setupState,
  byteSize: formatByteSize,
  firewallInfo: () => ({ ready: true, transparent: [{}], transparentPort: 52345 }),
  proxyOutbounds: () => setupConfig.outbounds,
  setupSnapshotStorageKey: 'ruopenray:test:setup-snapshot',
  request: async (path) => {
    if (path === '/api/install/plan') return { ok: true, steps: [] };
    if (path === '/api/config') return setupState.config;
    if (path === '/api/firewall/snapshot') return { ok: true };
    if (path === '/api/dns/lan-upstream') return { ok: true, mode: 'xray', readiness: { ready: true } };
    return {};
  },
  syncConfig: (config) => {
    setupState.config = config;
    setupState.jsonDraft = JSON.stringify(config);
  },
  ensureDnsServer: (config, server) => {
    config.dns = config.dns || {};
    config.dns.servers = config.dns.servers || [];
    if (!config.dns.servers.includes(server)) config.dns.servers.push(server);
  },
});
function createMemoryStorage() {
  return {
    data: new Map(),
    getItem(key) { return this.data.get(key) || null; },
    setItem(key, value) { this.data.set(key, String(value)); },
    removeItem(key) { this.data.delete(key); },
    clear() { this.data.clear(); },
  };
}

globalThis.localStorage = globalThis.localStorage || createMemoryStorage();
globalThis.sessionStorage = globalThis.sessionStorage || createMemoryStorage();
const firewallHydrateStorage = {
  data: new Map(),
  getItem(key) { return this.data.get(key) || null; },
  setItem(key, value) { this.data.set(key, String(value)); },
  removeItem(key) { this.data.delete(key); },
};
const firewallHydrateState = {
  firewallBypassMode: 'off',
  firewallRouterMode: 'tproxy',
  firewallDeviceMode: 'all',
  firewallSelectedDevices: [],
  firewallPortMode: 'custom',
  firewallPorts: '80,443',
  firewallBlockQuic: true,
  firewallDnsIntercept: true,
  firewallKillSwitchEnabled: false,
  firewallKillSwitchTargets: '',
  firewallKillSwitchDomainMode: 'dns-block',
};
const firewallHydrateStatus = {
  persistent: true,
  routerMode: 'redirect',
  bypassMode: 'bypass',
  deviceMode: 'selected',
  devices: ['192.168.1.50'],
  portMode: 'all',
  ports: [],
  blockQuic: false,
  dnsIntercept: false,
  killSwitch: true,
  killSwitchDeviceMode: 'exclude',
  killSwitchDevices: ['192.168.1.10'],
  killSwitchDomainMode: 'nftset',
  killSwitchDomains: ['chatgpt.com'],
  killSwitchIps: ['1.1.1.1'],
};
const firewallHydrateDraft = firewallDraftFromStatus(firewallHydrateStatus);
const firewallHydrated = hydrateFirewallDraftFromStatus(firewallHydrateState, firewallHydrateStatus, {
  storage: firewallHydrateStorage
});
const firewallHydrateOk = firewallHydrated
  && firewallHydrateDraft.firewallBypassMode === 'bypass'
  && firewallHydrateState.firewallRouterMode === 'redirect'
  && firewallHydrateState.firewallDeviceMode === 'selected'
  && firewallHydrateState.firewallPortMode === 'all'
  && firewallHydrateState.firewallPorts === ''
  && firewallHydrateState.firewallKillSwitchTargets.includes('chatgpt.com')
  && firewallHydrateState.firewallKillSwitchTargets.includes('1.1.1.1');
const firewallHydratePreservesDraft = !hydrateFirewallDraftFromStatus({ firewallHydratedFromStatus: true }, firewallHydrateStatus);
const firewallActiveStatusHydrates = firewallDraftFromStatus({
  active: true,
  persistent: false,
  routerMode: 'tproxy',
  bypassMode: 'redirect',
  portMode: 'all',
})?.firewallBypassMode === 'redirect';
const setupActions = createSetupActions({
  state: setupState,
  request: async (path) => {
    if (path === '/api/install/plan') return { ok: true, steps: [] };
    if (path === '/api/config') return setupState.config;
    if (path === '/api/firewall/snapshot') return { ok: true };
    if (path === '/api/dns/lan-upstream') return { ok: true, mode: 'xray', readiness: { ready: true } };
    if (path === '/api/config/test') return { ok: true, stdout: 'ok' };
    if (path === '/api/config/apply') return { ok: true, test: { stdout: 'applied' } };
    return { ok: true };
  },
  render,
  refresh: async () => { setupState.refreshed = true; },
  syncLanDnsStatus: (status) => { setupState.lanDnsStatus = status; },
  lanDnsModeLabel: (mode) => mode,
  setupReadiness: setupModel.setupReadiness,
  loadSetupSnapshot: setupModel.loadSetupSnapshot,
  captureSetupSnapshot: setupModel.captureSetupSnapshot,
  clearSetupSnapshot: setupModel.clearSetupSnapshot,
  lanDnsRestorePayload: setupModel.lanDnsRestorePayload,
  prepareSetupDraft: setupModel.prepareSetupDraft,
  applyFirewallWithRetry: async () => ({ ok: true, status: { active: true, persistent: true, routerMode: 'tproxy' } }),
  firewallReadyStatus: () => true,
  firewallRouterModeStorageKey: 'ruopenray:test:setup-fw-mode',
});
await setupActions.openSetupWizard();
await setupActions.runSetupWizard();
const settingsActionState = {
  serviceStartupDelaySec: '1',
  serviceApplyDelaySec: '2',
  serviceGoMemLimit: '32MiB',
  serviceGoGC: '80',
  downloadMirror: 'github',
  mirrorPrefix: '',
};
const settingsActions = createSettingsActions({
  state: settingsActionState,
  request: async (path) => {
    if (path === '/api/settings/service') return { ok: true, stdout: 'saved', settings: { goGC: 80 } };
    if (path === '/api/service') return { ok: true, stdout: 'service ok' };
    return { ok: true, settings: {} };
  },
  render,
  refresh: async () => { settingsActionState.refreshed = true; },
  refreshLogs: async () => {},
  configureLogTimer: () => {},
  configureStatusTimer: () => {},
  syncLoggingSettings: (settings) => { settingsActionState.logging = settings; },
  syncServiceSettings: (settings) => { settingsActionState.service = settings; },
  savedPasswordStorageKey: 'ruopenray:test:password',
});
await settingsActions.saveServiceSettings();
await settingsActions.service('restart');
settingsActionState.token = 'test-token';
localStorage.setItem('openray_token', 'test-token');
localStorage.setItem(authRememberStorageKey, '1');
sessionStorage.setItem('openray_token', 'test-token');
settingsActions.logout();
const logoutClearedSession = !settingsActionState.token
  && !localStorage.getItem('openray_token')
  && !localStorage.getItem(authRememberStorageKey)
  && !sessionStorage.getItem('openray_token')
  && settingsActionState.tab === 'dashboard';

let loginRefreshStarted = false;
let loginRefreshResolved = false;
let loginRenderCount = 0;
const loginBodies = [];
const loginActionState = { password: '', rememberPassword: false, message: '' };
const loginActions = createSettingsActions({
  state: loginActionState,
  request: async (path, options = {}) => {
    if (path === '/api/login') {
      loginBodies.push(JSON.parse(options.body || '{}'));
      return { token: 'login-token' };
    }
    return { ok: true };
  },
  render: () => { loginRenderCount += 1; },
  refresh: () => {
    loginRefreshStarted = true;
    return new Promise((resolve) => {
      setTimeout(() => {
        loginRefreshResolved = true;
        resolve();
      }, 25);
    });
  },
  refreshLogs: async () => {},
  configureLogTimer: () => {},
  configureStatusTimer: () => {},
  syncLoggingSettings: () => {},
  syncServiceSettings: () => {},
  savedPasswordStorageKey: 'ruopenray:test:login-password',
});

const profileActionState = {
  jsonDraft: JSON.stringify({ outbounds: [] }),
};
const profileDownloaded = {};
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
URL.createObjectURL = (blob) => {
  profileDownloaded.blob = blob;
  return 'blob:profile-test';
};
URL.revokeObjectURL = () => {};
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({
    set href(value) { profileDownloaded.href = value; },
    set download(value) { profileDownloaded.filename = value; },
    set rel(value) { profileDownloaded.rel = value; },
    click: () => { profileDownloaded.clicked = true; },
    remove: () => {},
  }),
  body: { appendChild: () => {} },
};
const profileActions = createProfileActions({
  state: profileActionState,
  request: async (path) => {
    if (path === '/api/profiles/activate') return { ok: true };
    if (path.startsWith('/api/profiles/get')) {
      return {
        name: 'diag',
        config: {
          outbounds: [{
            tag: 'real-proxy',
            protocol: 'vless',
            settings: { vnext: [{ address: 'secret.example', users: [{ id: 'real-uuid' }] }] }
          }],
          routing: { rules: [{ type: 'field', outboundTag: 'real-proxy', domain: ['domain:example.com'] }] }
        }
      };
    }
    if (path === '/api/backup') return { path: '/tmp/backup.json' };
    return { ok: true };
  },
  render,
  refresh: async () => { profileActionState.refreshed = true; },
});
await profileActions.activateProfile('default');
await profileActions.backup();
await profileActions.downloadProfile('diag', { anonymized: true });
const profileAnonymizedDownload = JSON.parse(await profileDownloaded.blob.text());
const profileAnonymizedDownloadWorks = profileDownloaded.clicked
  && profileDownloaded.filename === 'diag-anonymized.json'
  && profileAnonymizedDownload.outbounds[0]?.tag === 'proxy-1'
  && profileAnonymizedDownload.routing.rules[0]?.outboundTag === 'proxy-1'
  && profileAnonymizedDownload.outbounds[0]?.settings?.vnext?.[0]?.address?.startsWith('[masked')
  && profileAnonymizedDownload.outbounds[0]?.settings?.vnext?.[0]?.users?.[0]?.id?.startsWith('[masked')
  && profileAnonymizedDownload._ruopenray_export?.anonymized;
URL.createObjectURL = originalCreateObjectURL;
URL.revokeObjectURL = originalRevokeObjectURL;

const importActionState = {
  importLink: 'link-placeholder',
  importOutboundTag: 'proxy-new',
  importPreview: null,
  profileName: '',
  profiles: [{ name: 'default', active: true }],
  config: {
    outbounds: [{ tag: 'direct', protocol: 'freedom' }],
    routing: { rules: [] }
  },
  subscriptionAutoBalancer: true,
  subscriptionBalancerTag: '',
  subscriptionAuthEnabled: false,
  subscriptionAuthUser: '',
  subscriptionAuthPassword: '',
  subscriptionUrl: '',
  requestLog: [],
};
const importActions = createImportActions({
  state: importActionState,
  request: async (path, options = {}) => {
    importActionState.requestLog.push({ path, options });
    if (path === '/api/import/preview') {
      return {
        links: 1,
        items: [{ tag: 'preview-tag', protocol: 'vless', address: 'example.com:443' }],
        outbound: { tag: 'preview-tag', protocol: 'vless', settings: {} },
        outbounds: [{ tag: 'preview-tag', protocol: 'vless', settings: {} }]
      };
    }
    return { ok: true };
  },
  render,
  refresh: async () => { importActionState.refreshed = true; },
  syncConfig: (config) => { importActionState.config = config; },
  applyConfig: async () => { importActionState.applied = true; },
  isSystemOutbound: (outbound) => ['direct', 'block'].includes(outbound?.tag),
  cloneOutboundWithTag: (outbound, tag) => ({ ...JSON.parse(JSON.stringify(outbound)), tag }),
  routeRules: () => importActionState.config.routing?.rules || [],
  activeProxyTag: () => 'proxy-old',
  setRoutingDraft: (rules) => {
    importActionState.config = {
      ...importActionState.config,
      routing: { ...(importActionState.config.routing || {}), rules }
    };
  },
  setActiveServerTag: (tag) => { importActionState.activeServerTag = tag; },
});
await importActions.previewImport();
await importActions.importToCurrent(true);
const importActiveOk = importActionState.applied
  && importActionState.activeServerTag === 'proxy-new'
  && importActionState.config.outbounds[0]?.tag === 'proxy-new';
importActionState.subscriptionUrl = 'https://subscriptions.example/list';
importActionState.subscriptionAuthEnabled = true;
importActionState.subscriptionAuthUser = 'alice@example.com';
importActionState.subscriptionAuthPassword = 'p a/s';
await importActions.previewSubscription();
await importActions.importSubscriptionToCurrent(false);
const subscriptionPreviewRequest = importActionState.requestLog.findLast((item) => item.path === '/api/import/preview');
const subscriptionPoolRequest = importActionState.requestLog.findLast((item) => item.path === '/api/subscriptions/pool');
const subscriptionPreviewBody = JSON.parse(subscriptionPreviewRequest?.options?.body || '{}');
const subscriptionPoolBody = JSON.parse(subscriptionPoolRequest?.options?.body || '{}');
const subscriptionAuthUrlOk = subscriptionPreviewBody.url === 'https://alice%40example.com:p%20a%2Fs@subscriptions.example/list'
  && subscriptionPoolBody.url === subscriptionPreviewBody.url
  && importActionState.subscriptionAuthPassword === '';

const splitRouteSwitchState = {
  config: {
    outbounds: [{ tag: 'vpn-a', protocol: 'vless' }, { tag: 'vpn-b', protocol: 'vless' }],
    routing: {
      rules: [
        { type: 'field', outboundTag: 'vpn-a', domain: ['domain:discord.com'] },
        { type: 'field', outboundTag: 'vpn-a', inboundTag: ['transparent_ipv4'] },
        { type: 'field', outboundTag: 'proxy', domain: ['domain:chatgpt.com'] },
        { type: 'field', outboundTag: 'vpn-a' },
      ]
    }
  },
};
const splitRouteSwitchActions = createImportActions({
  state: splitRouteSwitchState,
  request: async () => ({ ok: true }),
  render,
  refresh: async () => {},
  syncConfig: (config) => { splitRouteSwitchState.config = config; },
  applyConfig: async () => {},
  isSystemOutbound: () => false,
  cloneOutboundWithTag: (outbound, tag) => ({ ...outbound, tag }),
  routeRules: () => splitRouteSwitchState.config.routing?.rules || [],
  activeProxyTag: () => 'vpn-a',
  setRoutingDraft: (rules) => {
    splitRouteSwitchState.config = {
      ...splitRouteSwitchState.config,
      routing: { ...(splitRouteSwitchState.config.routing || {}), rules }
    };
  },
  setActiveServerTag: (tag) => { splitRouteSwitchState.activeServerTag = tag; },
});
splitRouteSwitchActions.setActiveProxyDraft('vpn-b');

const serverActionState = {
  config: {
    outbounds: [{ tag: 'proxy-old' }, { tag: 'proxy-new' }],
    routing: { rules: [{ outboundTag: 'proxy-old', type: 'field', domain: ['domain:example.com'] }] },
  },
  serverCheckTimeout: 100,
  serverCheckAttempts: 1,
  serverCheckMode: 'tcp',
  serverCheckUrl: 'https://www.gstatic.com/generate_204',
  serverChecks: {},
  serverCheckHistory: [],
  serverChecking: false,
  serverCheckingTags: [],
  pendingServerTag: '',
};
const serverActions = createServerActions({
  state: serverActionState,
  request: async (path) => {
    if (path === '/api/outbounds/check') return { results: [{ tag: 'proxy-new', ok: true, latencyMs: 10 }] };
    if (path === '/api/subscriptions/fallback') return { ok: true, selected: { tag: 'proxy-new' } };
    if (path === '/api/subscriptions/select') {
      serverActionState.selectedSubscription = true;
      return { ok: true, selected: { tag: 'sub-candidate-2' } };
    }
    return { ok: true };
  },
  render,
  refresh: async () => { serverActionState.refreshed = true; },
  syncConfig: (config) => { serverActionState.config = config; },
  keepOperationVisible: async () => {},
  configOutbounds: () => serverActionState.config.outbounds || [],
  proxyOutbounds: () => (serverActionState.config.outbounds || []).filter((item) => item.tag?.startsWith('proxy')),
  proxyRuleStrategyStats: () => ({ primary: 1, pinned: 0 }),
  setActiveProxyDraft: (tag) => {
    serverActionState.config.routing.rules = serverActionState.config.routing.rules.map((rule) => ({ ...rule, outboundTag: tag }));
  },
  applyConfig: async () => { serverActionState.applied = true; },
});
await serverActions.checkServers(['proxy-new']);
await serverActions.routeAllToOutbound('proxy-new');
await serverActions.fallbackSubscriptionPool('subscription');
await serverActions.selectSubscriptionCandidate('subscription', 1);

const observatoryState = {
  config: {},
  serverCheckUrl: 'https://www.gstatic.com/generate_204',
  observatoryInterval: '15',
  message: '',
};
let observatoryConfigDraft = null;
let observatoryCheckedTags = [];
const observatoryActions = createObservatoryActions({
  state: observatoryState,
  syncConfig: (config) => {
    observatoryState.config = config;
    observatoryConfigDraft = config;
  },
  render,
  routeBalancers: () => [{ tag: 'auto', selector: ['proxy'], strategy: { type: 'leastPing' } }],
  proxyOutbounds: () => [{ tag: 'proxy-one' }, { tag: 'other' }],
  checkServers: async (tags) => { observatoryCheckedTags = tags; },
});
observatoryActions.enableObservatoryForProxy();
await observatoryActions.checkObservatoryTargets();

const configActionState = {
  jsonDraft: JSON.stringify({ outbounds: [] }),
  status: {},
  xrayTrafficHistory: [],
};
const configActions = createConfigActions({
  state: configActionState,
  request: async (path) => {
    if (path === '/api/config/analyze') return { errors: [], warnings: [] };
    if (path === '/api/config/test') return { ok: true, stdout: 'ok' };
    if (path === '/api/config/apply') return { ok: true, test: { stdout: 'applied' }, analysis: { errors: [] }, backup: '/tmp/backup.json' };
    if (path === '/api/xray/stats/reset') return { ok: true };
    return { ok: true };
  },
  render,
  refresh: async () => { configActionState.refreshed = true; },
  keepOperationVisible: async () => {},
  recordXrayStatsSample: () => { configActionState.sampled = true; },
  xrayStatsResetAtStorageKey: 'ruopenray:test:xray-reset',
});
await configActions.analyzeConfig();
await configActions.applyConfig();

const sniActionState = {
  sniTarget: 'cloudone.example',
  sniCidr: '24',
  sniTimeout: '1500',
  sniThreads: '16',
  sniLimit: '64',
};
const sniActions = createSniActions({
  state: sniActionState,
  request: async () => ({ results: [{ ip: '1.1.1.1' }], scanned: 1 }),
  render,
  outboundAddress: () => 'cloudone.example:443',
  activeProxyOutbound: () => ({}),
});
await sniActions.scanSni();

const updatesState = {
  geoCustomSources: [],
  geoSourceName: '  Custom Geo  ',
  geoSourceKind: 'base',
  geoSourceGeoipUrl: ' https://example.test/geoip.dat ',
  geoSourceGeositeUrl: ' https://example.test/geosite.dat ',
  geoSourceUrl: '',
  geoSourceTarget: '',
};
const updatesActions = createUpdatesActions({
  state: updatesState,
  request: async (path, options = {}) => {
    if (path === '/api/geo/sources') {
      const payload = JSON.parse(options.body || '{}');
      return { ok: true, sources: payload.sources || [], status: {} };
    }
    return { ok: true, sources: [], status: {} };
  },
  render,
  refresh: async () => {},
  geoSelectedPresetIds: () => ['loyalsoldier'],
});
await updatesActions.addGeoSource();

const sni = createSniView({
  state,
  escapeHtml,
  stat,
  outboundAddress: () => 'example.com:443',
  activeProxyOutbound: () => ({}),
});

globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
};
globalThis.localStorage = globalThis.localStorage || {
  data: new Map(),
  getItem(key) { return this.data.get(key) || null; },
  setItem(key, value) { this.data.set(key, String(value)); },
  removeItem(key) { this.data.delete(key); },
};
globalThis.window = globalThis.window || {
  crypto: {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index + 1;
      return bytes;
    },
  },
};
globalThis.document = {
  ...globalThis.document,
  querySelector: (selector) => {
    if (selector === '#password') return { value: 'admin' };
    if (selector === '#rememberPassword') return { checked: false };
    return null;
  },
  querySelectorAll: () => [],
};
await loginActions.login({ preventDefault: () => {} });
const loginStoresSessionOnly = sessionStorage.getItem('openray_token') === 'login-token'
  && !localStorage.getItem('openray_token')
  && !localStorage.getItem(authRememberStorageKey)
  && loginBodies.at(-1)?.remember === false
  && localStorage.getItem('ruopenray:test:login-password') === null;
const loginReturnedBeforeRefresh = loginRefreshStarted && !loginRefreshResolved && loginActionState.token === 'login-token' && loginRenderCount > 0;
await new Promise((resolve) => setTimeout(resolve, 35));

sessionStorage.removeItem('openray_token');
localStorage.removeItem('openray_token');
loginActionState.rememberPassword = true;
globalThis.document = {
  ...globalThis.document,
  querySelector: (selector) => {
    if (selector === '#password') return { value: 'admin' };
    if (selector === '#rememberPassword') return { checked: true };
    return null;
  },
  querySelectorAll: () => [],
};
await loginActions.login({ preventDefault: () => {} });
const loginRememberStoresLocalOnly = localStorage.getItem('openray_token') === 'login-token'
  && !sessionStorage.getItem('openray_token')
  && localStorage.getItem(authRememberStorageKey) === '1'
  && loginBodies.at(-1)?.remember === true
  && localStorage.getItem('ruopenray:test:login-password') === null;
clearAuthToken({ preserveRemember: true });
const expiredRememberLoginPreserved = !localStorage.getItem('openray_token')
  && !sessionStorage.getItem('openray_token')
  && loadAuthToken().remembered;

const { createInitialState } = await import('../cmd/ruopenray-ui/web/state.js');
const initialState = createInitialState();
const routingModel = createRoutingModel({
  state: {
    config: {
      routing: { rules: [{ domain: ['domain:chatgpt.com'], outboundTag: 'proxy', type: 'field' }] },
      outbounds: [{ tag: 'proxy', protocol: 'vless' }],
    },
    routeNames: {},
  },
  managedRouteTags: { proxy: 'proxy' },
  routeBundles: {},
  routeKinds: { domain: 'Сайт или домен' },
  routePresets: {},
  proxyOutbounds: () => [{ tag: 'proxy' }],
});
const managedRoutingModel = createRoutingModel({
  state: {
    config: {
      routing: {
        rules: [
          { type: 'field', inboundTag: ['ruopenray_dns_in'], outboundTag: 'dns-out' },
          { type: 'field', inboundTag: ['ruopenray-api'], outboundTag: 'ruopenray-api' },
          { type: 'field', inboundTag: ['transparent_ipv4'], outboundTag: 'direct' },
          { type: 'field', inboundTag: ['transparent_ipv4'], outboundTag: 'direct', ip: ['10.0.0.0/8', '192.168.0.0/16'] },
          { type: 'field', inboundTag: ['transparent_ipv4'], outboundTag: 'direct', domain: ['domain:apple.com'] },
          { type: 'field', inboundTag: ['transparent_ipv4'], outboundTag: 'direct', ip: ['192.168.50.157'] },
          { type: 'field', inboundTag: ['transparent_ipv4'], outboundTag: 'direct', ip: ['107.155.0.0/16'] },
        ]
      },
      outbounds: [
        { tag: 'direct', protocol: 'freedom' },
        { tag: 'dns-out', protocol: 'dns' },
        { tag: 'ruopenray-api', protocol: 'freedom' },
      ],
    },
    routeNames: {},
  },
  managedRouteTags: { direct: 'direct', 'dns-out': 'DNS', 'ruopenray-api': 'API' },
  routeBundles: {},
  routeKinds: {},
  routePresets: {},
  proxyOutbounds: () => [],
});
const subscriptionRoutingModel = createRoutingModel({
  state: {
    config: { routing: { rules: [{ domain: ['domain:telegram.org'], outboundTag: 'sub-main', type: 'field' }] }, outbounds: [] },
    routeNames: {},
    serverMeta: {},
    subscriptionPools: [{
      tag: 'sub-main',
      count: 2,
      activeCandidate: { tag: 'sub-node-1', protocol: 'vless', address: 'sub.example', port: 443, security: 'reality' },
    }],
    serverChecks: {},
  },
  managedRouteTags: { proxy: 'proxy' },
  routeBundles: {},
  routeKinds: { domain: 'РЎР°Р№С‚ РёР»Рё РґРѕРјРµРЅ' },
  routePresets: {},
  proxyOutbounds: () => [],
  checkForTag: () => null,
  checkLabel: () => '',
});
const routingDsl = createRoutingDsl({
  state: { routeDslName: 'Discord' },
  escapeHtml,
  resolveRoutingAlias: (tag) => (tag === 'proxy' ? 'cloudone' : tag),
  routeStatsFor: () => ({}),
});
const parsedDsl = routingDsl.parseRoutingDsl('domain(domain:discord.com) -> proxy\nnetwork(udp) && ip(104.16.0.0/12) -> proxy\ndefault: direct');
const routingActionState = {
  config: { routing: { rules: [] } },
  routeKind: 'domain',
  routeValue: 'domain:example.com',
  routeName: 'Example',
  routeTargetType: 'outbound',
  routeOutbound: 'proxy',
  routeBalancer: '',
  routeNames: {},
  disabledRouteRules: [],
  customRoutePresets: {},
  selectedRoutePresets: [],
  routeRuleDialog: true,
  routeRuleMode: 'single',
  routeRuleEditingIndex: -1,
  routeSearch: '',
};
const routingActionModel = createRoutingModel({
  state: routingActionState,
  managedRouteTags: { proxy: 'proxy' },
  routeBundles: {},
  routeKinds: { domain: 'Сайт или домен' },
  routePresets: {},
  proxyOutbounds: () => [{ tag: 'proxy' }],
});
let routeRuleProbeRequest = null;
const routeRuleProbeRequests = [];
const routingActions = createRoutingActions({
  state: routingActionState,
  render,
  request: async (path, options = {}) => {
    routeRuleProbeRequest = {
      path,
      payload: JSON.parse(options.body || '{}')
    };
    routeRuleProbeRequests.push(routeRuleProbeRequest);
    return {
      ok: true,
      verdict: { label: 'через proxy' },
      proxy: { ok: true, latencyMs: 12 },
      checks: { tcpProxy: { ok: true, latencyMs: 8 } }
    };
  },
  escapeHtml,
  routeKinds: { domain: 'Сайт или домен' },
  routePresets: {},
  routeBundles: {},
  hiddenBuiltinRoutePresetKeys: new Set(),
  customRoutePresetsStorageKey: 'ruopenray:test:custom-presets',
  parseRoutingDsl: routingDsl.parseRoutingDsl,
  isDslDefaultRule: routingDsl.isDslDefaultRule,
  dslPreviewStats: routingDsl.dslPreviewStats,
  dslPreviewView: routingDsl.dslPreviewView,
  routeRules: routingActionModel.routeRules,
  setRoutingDraft: (rules) => {
    routingActionState.config.routing = { ...(routingActionState.config.routing || {}), rules };
  },
  activeProxyTag: () => 'proxy',
  balancerOptions: () => [],
  splitRouteValues: routingActionModel.splitRouteValues,
  routeTarget: routingActionModel.routeTarget,
  routeRuleKey: routingActionModel.routeRuleKey,
  readableRouteTag: routingActionModel.readableRouteTag,
  encodedRouteTarget: routingActionModel.encodedRouteTarget,
  isRuOpenRayManagedRoute: routingActionModel.isRuOpenRayManagedRoute,
  routeRuleName: routingActionModel.routeRuleName,
  setRouteRuleName: routingActionModel.setRouteRuleName,
  copyRouteRuleName: routingActionModel.copyRouteRuleName,
  describeRouteRule: routingActionModel.describeRouteRule,
  routeSectionDefinitions: routingActionModel.routeSectionDefinitions,
  routeCategoryForRule: routingActionModel.routeCategoryForRule,
  routeRuleSource: routingActionModel.routeRuleSource,
  routeTargetOptions: routingActionModel.routeTargetOptions,
  saveRouteNames: routingActionModel.saveRouteNames,
  saveDisabledRouteRules: () => {},
});
routingActions.addRoutingRule();
routingActionState.routeRuleDialog = true;
routingActionState.routeRuleMode = 'single';
routingActionState.routeKind = 'domain';
routingActionState.routeValue = 'domain:example.com';
routingActionState.routeOutbound = 'proxy';
await routingActions.testRouteRuleTarget();
const routeRuleTargetTestWorks = routeRuleProbeRequest?.path === '/api/diagnostics/domain-probe'
  && routeRuleProbeRequest?.payload?.host === 'example.com'
  && routeRuleProbeRequest?.payload?.tag === 'proxy'
  && routingActionState.routeRuleTestResult?.ok;
routingActionState.routeValue = 'domain:one.example\ndomain:two.example\nregexp:.*';
routeRuleProbeRequests.length = 0;
await routingActions.testRouteRuleTarget();
const routeRuleTargetListTestWorks = routeRuleProbeRequests.length === 2
  && routeRuleProbeRequests[0]?.payload?.host === 'one.example'
  && routeRuleProbeRequests[1]?.payload?.host === 'two.example'
  && routingActionState.routeRuleTestResult?.title?.includes('2/2');
const routeGroupState = {
  config: { outbounds: [{ tag: 'vpn-a', protocol: 'vless' }, { tag: 'vpn-b', protocol: 'vless' }], routing: { rules: [
    { type: 'field', outboundTag: 'vpn-a', domain: ['domain:telegram.org', 'domain:t.me', 'domain:telegra.ph', 'domain:telegram.me'] },
    { type: 'field', outboundTag: 'vpn-a', network: 'udp', ip: ['91.108.4.0/22'] },
  ] } },
  routeNames: {},
  disabledRouteRules: [],
  customRoutePresets: {},
  selectedRoutePresets: [],
  selectedRouteRuleIndexes: [],
  routeGroupDialog: false,
  routeGroupTitle: '',
  routeGroupDetail: '',
  routeGroupIcon: '',
  routeSearch: '',
  routeValuesDrawerIndex: null,
  routeValuesDrawerAnchor: null,
  message: '',
};
const routeGroupBundles = {
  telegramFull: {
    title: 'Telegram полный',
    rules: [
      { type: 'field', outboundTag: 'proxy', domain: ['domain:telegram.org', 'domain:t.me', 'domain:telegra.ph', 'domain:telegram.me'] },
      { type: 'field', outboundTag: 'proxy', network: 'udp', ip: ['91.108.4.0/22'] },
    ],
  },
  mixedOpenai: {
    title: 'ChatGPT / OpenAI',
    rules: [
      { type: 'field', outboundTag: 'proxy', domain: ['domain:chatgpt.com', 'domain:openai.com'], ip: ['172.64.150.0/24'] },
    ],
  },
};
const routeGroupModel = createRoutingModel({
  state: routeGroupState,
  managedRouteTags: { proxy: 'proxy' },
  routeBundles: routeGroupBundles,
  routeKinds: { domain: 'РЎР°Р№С‚ РёР»Рё РґРѕРјРµРЅ', ip: 'IP РёР»Рё РїРѕРґСЃРµС‚СЊ' },
  routePresets: {},
  proxyOutbounds: () => [{ tag: 'vpn-a' }, { tag: 'vpn-b' }],
  persistRouteNames: () => {},
});
const routeGroupActions = createRoutingActions({
  state: routeGroupState,
  render,
  request: async () => ({ ok: true }),
  escapeHtml,
  routeKinds: { domain: 'РЎР°Р№С‚ РёР»Рё РґРѕРјРµРЅ', ip: 'IP РёР»Рё РїРѕРґСЃРµС‚СЊ' },
  routePresets: {},
  routeBundles: routeGroupBundles,
  hiddenBuiltinRoutePresetKeys: new Set(),
  parseRoutingDsl: routingDsl.parseRoutingDsl,
  isDslDefaultRule: routingDsl.isDslDefaultRule,
  dslPreviewStats: routingDsl.dslPreviewStats,
  dslPreviewView: routingDsl.dslPreviewView,
  routeRules: routeGroupModel.routeRules,
  setRoutingDraft: (rules) => {
    routeGroupState.config.routing = { ...(routeGroupState.config.routing || {}), rules };
  },
  activeProxyTag: () => 'vpn-a',
  balancerOptions: () => [],
  splitRouteValues: routeGroupModel.splitRouteValues,
  routeTarget: routeGroupModel.routeTarget,
  routeRuleKey: routeGroupModel.routeRuleKey,
  readableRouteTag: routeGroupModel.readableRouteTag,
  encodedRouteTarget: routeGroupModel.encodedRouteTarget,
  isRuOpenRayManagedRoute: routeGroupModel.isRuOpenRayManagedRoute,
  routeRuleName: routeGroupModel.routeRuleName,
  setRouteRuleName: routeGroupModel.setRouteRuleName,
  copyRouteRuleName: routeGroupModel.copyRouteRuleName,
  describeRouteRule: routeGroupModel.describeRouteRule,
  routeTargetFlagMarkup: routeGroupModel.routeTargetFlagMarkup,
  routeTargetStatus: routeGroupModel.routeTargetStatus,
  routeSectionDefinitions: routeGroupModel.routeSectionDefinitions,
  routeCategoryForRule: routeGroupModel.routeCategoryForRule,
  routeRuleSource: routeGroupModel.routeRuleSource,
  routeTargetOptions: routeGroupModel.routeTargetOptions,
  saveRouteNames: routeGroupModel.saveRouteNames,
  saveDisabledRouteRules: () => {},
});
const routeGroupBefore = routeGroupActions.visibleRoutingRuleItems(80);
routeGroupActions.updateRoutingTargetRange(0, 2, 'outbound:vpn-b');
const routeGroupAfter = routeGroupActions.visibleRoutingRuleItems(80);
const routePresetGroupStableAcrossTarget = routeGroupBefore[0]?.kind === 'presetGroup'
  && routeGroupAfter[0]?.kind === 'presetGroup'
  && routeGroupAfter[0]?.items?.length === 2
  && routeGroupState.config.routing.rules.every((rule) => rule.outboundTag === 'vpn-b');
routeGroupActions.moveRoutingRuleInsideGroup(1, 0, 2, -1);
const routeGroupAfterInnerMove = routeGroupActions.visibleRoutingRuleItems(80);
const routePresetGroupInnerMoveWorks = routeGroupAfterInnerMove[0]?.kind === 'presetGroup'
  && routeGroupState.config.routing.rules[0]?.network === 'udp'
  && routeGroupState.config.routing.rules[1]?.domain?.includes('domain:telegram.org');
routeGroupActions.reorderRoutingRuleInsideGroup(0, 0, 2, 2);
const routeGroupAfterInnerDrag = routeGroupActions.visibleRoutingRuleItems(80);
const routePresetGroupInnerDragWorks = routeGroupAfterInnerDrag[0]?.kind === 'presetGroup'
  && routeGroupState.config.routing.rules[0]?.domain?.includes('domain:telegram.org')
  && routeGroupState.config.routing.rules[1]?.network === 'udp';
const routePresetGroupHtmlClosed = routeGroupActions.orderedRouteList(
  routeGroupActions.visibleRoutingRuleItems(80),
  routeGroupModel.routeTargetOptions(),
  routeGroupState.config.routing.rules.length,
);
routeGroupState.routeValuesDrawerIndex = 0;
routeGroupState.routeValuesDrawerAnchor = { top: 120, left: 640, maxHeight: 280 };
const routePresetGroupHtmlOpen = routeGroupActions.orderedRouteList(
  routeGroupActions.visibleRoutingRuleItems(80),
  routeGroupModel.routeTargetOptions(),
  routeGroupState.config.routing.rules.length,
);
routeGroupState.routeValuesDrawerIndex = null;
routeGroupState.routeValuesDrawerAnchor = null;
const routeValuesDrawerWorks = routePresetGroupHtmlClosed.includes('route-value-chips')
  && routePresetGroupHtmlClosed.includes('data-route-values-panel="0"')
  && !routePresetGroupHtmlClosed.includes('route-values-drawer')
  && routePresetGroupHtmlOpen.includes('route-values-drawer')
  && routePresetGroupHtmlOpen.includes('--route-values-drawer-top:120px')
  && routePresetGroupHtmlOpen.includes('domain:telegram.org');
routeGroupState.config.routing.rules = [
  { type: 'field', outboundTag: 'vpn-a', domain: ['domain:one.example'] },
  { type: 'field', outboundTag: 'dns-out', port: '53' },
  { type: 'field', outboundTag: 'vpn-a', domain: ['domain:two.example'] },
  { type: 'field', outboundTag: 'ruopenray-api', inboundTag: ['ruopenray-api'] },
  { type: 'field', outboundTag: 'direct', inboundTag: ['transparent_ipv4'], ip: ['10.0.0.0/8', '192.168.0.0/16'] },
  { type: 'field', outboundTag: 'direct', inboundTag: ['transparent_ipv4'], domain: ['domain:direct.example'] },
  { type: 'field', outboundTag: 'vpn-b', domain: ['domain:three.example'] },
];
routeGroupState.routeNames = {};
const routeVisibleNumberingHtml = routeGroupActions.orderedRouteList(
  routeGroupActions.visibleRoutingRuleItems(80),
  routeGroupModel.routeTargetOptions(),
  routeGroupState.config.routing.rules.length,
);
const routeVisibleNumbering = [...routeVisibleNumberingHtml.matchAll(/<\/button>\s*<span>([^<]+)<\/span>\s*<\/div>/g)]
  .map((match) => match[1]);
const routeVisibleNumberingSkipsManaged = routeVisibleNumbering.slice(0, 4).join(',') === '1,2,3,4';
routeGroupState.config.routing.rules = [
  { type: 'field', outboundTag: 'vpn-a', domain: ['domain:one.example'] },
  { type: 'field', outboundTag: 'vpn-a', domain: ['domain:two.example'] },
  { type: 'field', outboundTag: 'vpn-a', domain: ['domain:three.example'] },
];
routeGroupState.routeNames = {};
routeGroupActions.toggleRouteRuleSelection(0, true);
routeGroupActions.toggleRouteRuleSelection(2, true);
routeGroupState.routeGroupTitle = 'Моя группа';
routeGroupState.routeGroupDetail = 'Выбранные правила';
routeGroupState.routeGroupIcon = 'simple-icons:telegram';
routeGroupActions.createSelectedRouteGroup();
const routeCustomGroupItems = routeGroupActions.visibleRoutingRuleItems(80);
const routeCustomGroupHtml = routeGroupActions.orderedRouteList(
  routeCustomGroupItems,
  routeGroupModel.routeTargetOptions(),
  routeGroupState.config.routing.rules.length,
);
const routeCustomGroupWorks = routeCustomGroupItems[0]?.kind === 'presetGroup'
  && routeCustomGroupItems[0]?.items?.length === 2
  && routeGroupState.config.routing.rules[0]?.domain?.includes('domain:one.example')
  && routeGroupState.config.routing.rules[1]?.domain?.includes('domain:three.example')
  && routeGroupState.config.routing.rules[2]?.domain?.includes('domain:two.example')
  && routeCustomGroupHtml.includes('Моя группа')
  && routeCustomGroupHtml.includes('route-preset-iconify');
routeGroupState.config.routing.rules = [
  { type: 'field', outboundTag: 'vpn-a', domain: ['domain:keep.example'] },
  { type: 'field', outboundTag: 'vpn-a', domain: ['domain:disable.example'] },
  { type: 'field', outboundTag: 'vpn-a', domain: ['domain:delete.example'] },
];
routeGroupState.routeNames = {};
routeGroupState.disabledRouteRules = [];
routeGroupState.selectedRouteRuleIndexes = [];
routeGroupActions.toggleRouteRuleSelection(1, true);
routeGroupActions.disableSelectedRoutingRules();
const routeSelectedDisableWorks = routeGroupState.config.routing.rules.length === 2
  && routeGroupState.disabledRouteRules.length === 1
  && routeGroupState.disabledRouteRules[0]?.rule?.domain?.includes('domain:disable.example')
  && routeGroupState.selectedRouteRuleIndexes.length === 0;
routeGroupActions.toggleRouteRuleSelection(1, true);
routeGroupActions.removeSelectedRoutingRules();
const routeSelectedDeleteWorks = routeGroupState.config.routing.rules.length === 1
  && routeGroupState.config.routing.rules[0]?.domain?.includes('domain:keep.example')
  && routeGroupState.selectedRouteRuleIndexes.length === 0;
routeGroupState.config.routing.rules = [
  { type: 'field', outboundTag: 'vpn-a', domain: ['domain:a.example'] },
  { type: 'field', outboundTag: 'vpn-b', domain: ['domain:b.example'] },
  { type: 'field', outboundTag: 'vpn-a', domain: ['domain:c.example'] },
];
routeGroupState.selectedRouteRuleIndexes = [];
routeGroupActions.openRouteTargetReplaceDialog();
const routeReplaceInitialSummary = routeGroupActions.routeTargetReplacementSummary();
routeGroupState.routeReplaceFrom = 'outbound:vpn-a';
routeGroupState.routeReplaceTo = 'outbound:vpn-b';
routeGroupActions.applyRouteTargetReplacement();
const routeTargetReplaceWorks = routeReplaceInitialSummary.sources.some((option) => option.value === 'outbound:vpn-a' && option.count === 2)
  && routeGroupState.config.routing.rules.filter((rule) => rule.outboundTag === 'vpn-b').length === 3
  && !routeGroupState.routeTargetReplaceDialog
  && /2/.test(routeGroupState.message || '');
routeGroupState.config.routing.rules = [];
routeGroupState.selectedRoutePresets = ['mixedOpenai'];
routeGroupActions.applySelectedRoutingPresets();
const routeMixedItems = routeGroupActions.visibleRoutingRuleItems(80);
const routeMixedPresetSplitsConditions = routeMixedItems[0]?.kind === 'presetGroup'
  && routeMixedItems[0]?.items?.length === 2
  && routeGroupState.config.routing.rules.some((rule) => rule.domain?.includes('domain:chatgpt.com') && !rule.ip)
  && routeGroupState.config.routing.rules.some((rule) => rule.ip?.includes('172.64.150.0/24') && !rule.domain);
const routePatreonExportIcon = routePresetExportIcon('patreon', { title: 'Patreon' });
const routeIntelExportIcon = routePresetExportIcon('intel', { title: 'Intel' });
const routeTorrentExportIcon = routePresetExportIcon('torrentTrackers', { title: 'Торрент-трекеры' });
const routeExternalBrandIconView = routePresetIconView(escapeHtml, 'external:linkedin', {
  icon: {
    type: 'svg',
    svg: '<svg class="brand-icon" viewBox="0 0 24 24" focusable="false"><rect width="24" height="24" fill="#0a66c2"></rect></svg>'
  }
});
const routeChatGptBrandIconView = routePresetIconView(escapeHtml, 'external:chatgpt', {
  title: 'ChatGPT / OpenAI',
  icon: {
    type: 'svg',
    svg: '<svg class="brand-icon" viewBox="0 0 16 16" focusable="false"><path fill="#fff" d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1"></path></svg>'
  }
});
routeGroupActions.editRoutingPreset('telegramFull');
routeGroupState.routePresetEditTitle = 'Telegram export';
routeGroupActions.saveRoutePresetEdit();
const routePresetEditorKeepsFallbackIcon = routeGroupState.customRoutePresets['telegram-export']?.icon?.type === 'svg'
  && routeGroupState.customRoutePresets['telegram-export']?.icon?.svg?.includes('brand-icon')
  && routePatreonExportIcon?.type === 'svg'
  && routePatreonExportIcon.svg.includes('#ff6854')
  && routeIntelExportIcon?.type === 'svg'
  && routeIntelExportIcon.svg.includes('#0068b5')
  && routeTorrentExportIcon?.type === 'svg'
  && routeTorrentExportIcon.svg.includes('#17b26a')
  && routeExternalBrandIconView.includes('route-preset-inline-svg')
  && routeExternalBrandIconView.includes('route-preset-icon-brand')
  && routeChatGptBrandIconView.includes('route-preset-icon-framed')
  && routeChatGptBrandIconView.includes('--route-icon-bg:#10a37f');
const routeDialogState = {
  routeRuleDialog: true,
  routeRuleMode: 'presets',
  routeRuleEditingIndex: -1,
  selectedRoutePresets: [],
  customRoutePresets: {},
  message: '',
};
const routeDialogView = createRoutingDialogsView({
  state: routeDialogState,
  escapeHtml,
  routeKinds: { domain: 'Сайт или домен' },
  routePlaceholders: { domain: 'domain:example.com' },
  customRoutePresetEntries: () => [],
  builtinRoutePresetEntries: () => [
    ['chatgpt', { title: 'ChatGPT', rule: { type: 'field', outboundTag: 'proxy', domain: ['domain:chatgpt.com'] } }],
    ['patreon', { title: 'Patreon через proxy', rule: { type: 'field', outboundTag: 'proxy', domain: ['domain:patreon.com'] } }],
    ['speedtestOokla', { title: 'Speedtest / Ookla', rules: [{ type: 'field', outboundTag: 'proxy', domain: ['domain:speedtest.net'] }, { type: 'field', outboundTag: 'proxy', port: '8080' }] }]
  ],
  ruleCountLabel: (count) => `${count} правило`,
  routePresetConditionCount: () => 1,
  routeTargetOptions: () => [],
  balancerOptions: () => [],
  outboundOptions: () => ['proxy'],
  routeLeasePicker: () => '',
  dslPreviewView: () => '',
  routeBalancers: () => [],
  balancerTargetOptions: () => [],
  splitRouteValues: (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
  balancerSelectorMatches: () => [],
  strategyObserverType: () => '',
  observerLabel: () => '',
  routeRules: () => [],
  balancerStrategyLabel: () => '',
  routePresetCheckResultView: () => '',
  describeRouteRule: (rule) => ({ fullValue: rule?.domain?.join(', ') || 'правило' }),
  routePresetRules: (key) => key === 'chatgpt'
    ? [{ type: 'field', outboundTag: 'proxy', domain: ['domain:chatgpt.com'] }]
    : key === 'patreon'
      ? [{ type: 'field', outboundTag: 'proxy', domain: ['domain:patreon.com'] }]
      : key === 'speedtestOokla'
        ? [{ type: 'field', outboundTag: 'proxy', domain: ['domain:speedtest.net'] }, { type: 'field', outboundTag: 'proxy', port: '8080' }]
      : [],
});
const routeDialogPresetsHtml = routeDialogView.routeRuleDialog();
routeDialogState.routeRuleMode = 'single';
routeDialogState.routeKind = 'domain';
routeDialogState.routeValue = 'domain:example.com';
routeDialogState.routeOutbound = 'proxy';
routeDialogState.routeTargetType = 'outbound';
routeDialogState.routeRuleTestResult = { ok: true, title: 'example.com: работает', detail: 'Через proxy: HTTP 12 ms' };
const routeDialogSingleHtml = routeDialogView.routeRuleDialog();
routeDialogState.routeValue = 'domain:one.example, domain:two.example, domain:three.example';
routeDialogState.routeRuleTestResult = null;
const routeDialogMultiValueHtml = routeDialogView.routeRuleDialog();
const routeBalancerState = {
  config: { routing: { balancers: [] } },
  routeBalancerEditingIndex: -1,
  routeBalancerTag: 'auto',
  routeBalancerStrategy: 'leastPing',
  routeBalancerSelectors: 'proxy-one\nproxy-two',
  routeBalancerFallback: 'proxy-one',
  routeBalancer: '',
  routeTargetType: 'outbound',
};
const routeBalancerActions = createRouteBalancerActions({
  state: routeBalancerState,
  render,
  routeBalancers: () => routeBalancerState.config.routing.balancers || [],
  routeRules: () => [],
  splitRouteValues: (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
  setRouteBalancersDraft: (balancers) => {
    routeBalancerState.config.routing = { ...(routeBalancerState.config.routing || {}), balancers };
  },
  syncConfig: (config) => {
    routeBalancerState.config = config;
  },
  strategyObserverType: (strategy) => (strategy === 'leastPing' ? 'observatory' : ''),
  applyObserverForStrategy: (config) => ({ ...config, observatory: { enabled: true } }),
  observerLabel: () => 'Observatory',
});
routeBalancerActions.saveRouteBalancer();
const dnsModel = createDnsModel({
  state: {
    config: {
      dns: {
        servers: ['https://dns.google/dns-query', { address: '1.1.1.1', port: 53, network: 'tcp' }],
        hosts: { 'example.test': '127.0.0.1' },
      },
    },
  },
});
const dnsActionState = {
  config: { dns: { servers: [], hosts: {} }, routing: { rules: [] } },
  dnsAddress: '192.168.1.1',
  dnsAuthEnabled: false,
  dnsAuthUser: '',
  dnsAuthPassword: '',
  dnsDomains: 'lan',
  dnsHostName: 'router.lan',
  dnsHostValue: '192.168.1.1',
  dnsCheckHost: 'example.com',
  lanDnsMode: 'xray',
  lanDnsUpstream: '127.0.0.1#5353',
  lanDnsRestart: false,
};
const dnsActionModel = createDnsModel({ state: dnsActionState });
const dnsActions = createDnsActions({
  state: dnsActionState,
  request: async (path) => {
    if (path === '/api/dns/check') return { ok: true, a: ['93.184.216.34'], addresses: ['93.184.216.34'] };
    if (path === '/api/dns/lan-upstream') return { ok: true, mode: dnsActionState.lanDnsMode, upstream: dnsActionState.lanDnsUpstream };
    return { ok: true };
  },
  render,
  syncConfig: (config) => { dnsActionState.config = config; },
  syncLanDnsStatus: (status) => { dnsActionState.lanDnsStatus = status; },
  activeProxyTag: () => 'proxy',
  splitRouteValues: (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
  dnsConfig: dnsActionModel.dnsConfig,
  normalizeDnsAddressInput: dnsActionModel.normalizeDnsAddressInput,
  ensureDnsBootstrapHosts: (config) => {
    config.dns = config.dns || {};
    config.dns.hosts = { ...(config.dns.hosts || {}), 'dns.google': '8.8.8.8' };
  },
});
dnsActions.addDnsServer();
dnsActionState.dnsAddress = 'https://dns.google/dns-query';
dnsActionState.dnsDomains = '';
dnsActions.addDnsServer();
dnsActionState.dnsAddress = 'https://secure-dns.example/dns-query';
dnsActionState.dnsAuthEnabled = true;
dnsActionState.dnsAuthUser = 'user@example';
dnsActionState.dnsAuthPassword = 'secret value';
dnsActions.addDnsServer();
const dnsAuthServer = dnsActionState.config.dns.servers.find((server) => String(server).includes('secure-dns.example'));
const dnsAuthServerMasked = dnsAuthServer?.includes('user%40example:secret%20value@')
  && dnsActionModel.describeDnsServer(dnsAuthServer).address.includes('user%40example:***@')
  && !dnsActionModel.describeDnsServer(dnsAuthServer).address.includes('secret');
dnsActionState.dnsAuthEnabled = false;
dnsActions.moveDnsServer(0, 1);
dnsActions.prioritizeDohDnsServers();
dnsActions.saveDnsHost();
const firewallState = {
  config: {
    inbounds: [{ tag: 'transparent_ipv4', protocol: 'dokodemo-door', port: 52345, streamSettings: { sockopt: { tproxy: 'tproxy' } } }],
    outbounds: [{ tag: 'dns-out', protocol: 'dns' }],
    routing: { rules: [
      { outboundTag: 'direct', ip: ['geoip:private'] },
      { outboundTag: 'direct', domain: ['domain:router.lan'] },
      { outboundTag: 'proxy', domain: ['domain:telegram.org', 'geosite:youtube'] },
    ] },
  },
  firewallBlockQuic: true,
  firewallBypassMode: 'off',
  firewallDeviceMode: 'all',
  firewallPortMode: 'custom',
  firewallPorts: '80,443',
  firewallRouterMode: 'tproxy',
  firewallSelectedDevices: [],
  firewallKillSwitchEnabled: true,
  firewallKillSwitchTargets: '162.159.140.0/24, openai.com',
  leases: [],
};
const firewallModel = createFirewallModel({
  state: firewallState,
  configInbounds: () => firewallState.config.inbounds,
  configOutbounds: () => firewallState.config.outbounds,
  routeRules: () => firewallState.config.routing.rules,
  splitRouteValues: (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
  deviceRules: () => [],
  routeRuleName: () => 'rule',
  describeRouteRule: () => ({ kind: 'ip' }),
});
const dnsOnlyFirewallModel = createFirewallModel({
  state: firewallState,
  configInbounds: () => [{ tag: 'ruopenray_dns_in', protocol: 'dokodemo-door', port: 5353, settings: { network: 'tcp,udp' } }],
  configOutbounds: () => [{ tag: 'dns-out', protocol: 'dns' }],
  routeRules: () => [{ outboundTag: 'dns-out', inboundTag: ['ruopenray_dns_in'], type: 'field' }],
  splitRouteValues: (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
  deviceRules: () => [],
  routeRuleName: () => 'rule',
  describeRouteRule: () => ({ kind: 'ip' }),
});
const firewallActions = createFirewallActions({
  state: firewallState,
  request: async (path) => {
    if (path === '/api/firewall/apply') return { ok: true, status: { active: true, routerMode: 'tproxy', ipRule: true, ipRoute: true } };
    if (path === '/api/firewall/status') return { active: true, routerMode: 'tproxy', ipRule: true, ipRoute: true };
    if (path === '/api/firewall/preview') return { ok: true, nft: 'table inet ruopenray {}', status: { active: true } };
    if (path === '/api/firewall/disable') return { ok: true, status: { active: false } };
    return { ok: true };
  },
  render,
  delay: async () => {},
  firewallPayload: firewallModel.firewallPayload,
  firewallCommands: firewallModel.firewallCommands,
  firewallReadyStatus: firewallModel.firewallReadyStatus,
  storageKeys: {
    firewallBypassModeStorageKey: 'ruopenray:test:fw:bypass',
    firewallRouterModeStorageKey: 'ruopenray:test:fw:router',
    firewallDeviceModeStorageKey: 'ruopenray:test:fw:device',
    firewallPortModeStorageKey: 'ruopenray:test:fw:port',
    firewallSelectedDevicesStorageKey: 'ruopenray:test:fw:selected',
    firewallBlockQuicStorageKey: 'ruopenray:test:fw:quic',
    firewallKillSwitchEnabledStorageKey: 'ruopenray:test:fw:ks',
    firewallKillSwitchTargetsStorageKey: 'ruopenray:test:fw:ks-targets',
  },
});
firewallActions.setFirewallBypassMode('redirect');
firewallActions.setFirewallPortMode('all');
firewallActions.setFirewallKillSwitchTargets('172.64.150.0/24, chatgpt.com');
const xrayDraftState = {
  config: {
    inbounds: [{ tag: 'transparent_ipv4', protocol: 'dokodemo-door', streamSettings: {} }],
    outbounds: [{ tag: 'proxy', protocol: 'vless', streamSettings: {} }],
    routing: { rules: [] },
    dns: { servers: [] },
  },
  firewallRouterMode: 'tproxy',
};
const xrayDraftActions = createXrayDraftActions({
  state: xrayDraftState,
  render,
  syncConfig: (config) => { xrayDraftState.config = config; },
  advancedInbounds: () => xrayDraftState.config.inbounds,
  currentSnifferSettings: () => ({ mode: 'http-tls', routeOnly: true, excluded: '' }),
  proxyOutbounds: () => xrayDraftState.config.outbounds.filter((item) => item.tag === 'proxy'),
  normalizeSetupRules: (config) => { config.routing.rules.push({ type: 'field', ip: ['geoip:private'], outboundTag: 'direct' }); },
  firewallCommands: () => 'nft list ruleset',
  githubInstallCommand: () => 'install command',
});
xrayDraftActions.setDnsModeDraft('fakedns');
xrayDraftActions.setTcpFastOpenDraft(true);
xrayDraftActions.prepareTransparentDraft();
const serverModel = createServerModel({
  state: {
    activeServerTag: '',
    config: {
      outbounds: [
        { tag: 'cloudone', protocol: 'vless', settings: { vnext: [{ address: 'cloudone.example', port: 443 }] } },
        { tag: 'direct', protocol: 'freedom' },
      ],
      routing: { rules: [{ outboundTag: 'proxy', domain: ['domain:chatgpt.com'], type: 'field' }] },
    },
    subscriptionPools: [],
  },
  configOutbounds: () => [
    { tag: 'cloudone', protocol: 'vless', settings: { vnext: [{ address: 'cloudone.example', port: 443 }] } },
    { tag: 'direct', protocol: 'freedom' },
  ],
  routeRules: () => [{ outboundTag: 'proxy', domain: ['domain:chatgpt.com'], type: 'field' }],
  routeBalancers: () => [],
  routeTarget: (rule) => ({ kind: 'domain', values: rule.domain || [] }),
  outboundAddress: () => 'cloudone.example:443',
  outboundTransport: () => 'tcp / reality',
  outboundMatchesSelectors: () => false,
  observatorySelectors: () => [],
  burstObservatorySelectors: () => [],
  strategyObserverType: () => '',
  observerLabel: () => '',
  checkForTag: () => null,
  checkLabel: () => 'не проверен',
  ruleCountLabel: (count) => `${count} правило`,
  escapeHtml,
  splitRouteValues: (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
});
const xrayConfigModel = createXrayConfigModel({
  config: {
    inbounds: [{ tag: 'transparent_ipv4', protocol: 'dokodemo-door', sniffing: { enabled: true, destOverride: ['http', 'tls'] } }],
    outbounds: [{ tag: 'proxy', protocol: 'vless', settings: { vnext: [{ address: 'example.com', port: 443 }] } }],
    dns: {},
  },
});

bindDiagnosticsControls({
  state,
  render,
  domainMonitorFilterStorageKey: 'ruopenray:test',
  activeProxyTag: () => 'proxy',
  probeMonitoredDomain: async () => {},
  focusSniResult: () => {},
  refreshLogs: async () => {},
  configureLogTimer: () => {},
  scrollLogsToBottom: () => {},
});

bindCoreControls({
  state,
  render,
  filteredCoreReleases: () => [],
});

bindSettingsControls({
  state,
  render,
  installPasswordStorageKey: 'ruopenray:test:install-password',
  githubInstallCommand: () => 'install command',
});

bindGeoControls({
  state,
  render,
  toggleGeoSourceEnabled: () => {},
  removeGeoSource: () => {},
  deleteGeoFile: () => {},
});

bindDeviceControls({
  state,
  render,
  updateDeviceRule: () => {},
  removeDeviceRule: () => {},
});

bindDnsControls({
  state,
  render,
  removeDnsServer: () => {},
  moveDnsServer: () => {},
  prioritizeDohDnsServers: () => {},
  editDnsHost: () => {},
  removeDnsHost: () => {},
  setDnsModeDraft: () => {},
});

bindRoutingControls({
  state,
  render,
  firewallPortsStorageKey: 'ruopenray:test:ports',
  addRoutingPreset: () => {},
  editRoutingPreset: () => {},
  deleteCustomRoutePreset: () => {},
  deleteRoutePresetSource: () => {},
  toggleRoutePresetSource: () => {},
  updateRoutePresetSources: () => {},
  removeRoutingRule: () => {},
  removeRoutingRuleRange: () => {},
  disableRoutingRule: () => {},
  disableRoutingRuleRange: () => {},
  restoreDisabledRouteRule: () => {},
  deleteDisabledRouteRule: () => {},
  moveRoutingRule: () => {},
  moveRoutingRuleInsideGroup: () => {},
  moveRoutingRuleRange: () => {},
  toggleRouteRuleSelection: () => {},
  groupRoutingRuleWithNext: () => {},
  renameRoutingRuleGroup: () => {},
  openRoutingRuleEditor: () => {},
  openRouteBalancerDialog: () => {},
  removeRouteBalancer: () => {},
  setFirewallBypassMode: () => {},
  setFirewallRouterMode: () => {},
  setFirewallDeviceMode: () => {},
  toggleFirewallDevice: () => {},
  reorderRoutingRule: () => {},
  reorderRoutingRuleInsideGroup: () => {},
  reorderRoutingRuleRange: () => {},
  routeRules: () => [],
  describeRouteRule: () => null,
  routeTargetFlagMarkup: () => '',
  routeTargetStatus: () => null,
  updateRoutingTarget: () => {},
  updateRoutingTargetRange: () => {},
  removeOutbound: () => {},
  routeAllToOutbound: async () => {},
  checkServers: async () => {},
  setSnifferDraft: () => {},
  setQuicPolicy: () => {},
  currentSnifferSettings: () => ({ mode: 'off' }),
  setFirewallPortMode: () => {},
  setFirewallBlockQuic: () => {},
  applyLeaseSearch: () => {},
  setRouteBalancerSelector: () => {},
  moveRouteBalancerSelector: () => {},
  balancerOptions: () => [],
});

bindProfileControls({
  activateProfile: () => {},
});

bindNavigationControls({
  state,
  render,
});
bindModalControls();

bindConfigControls({ state });

bindImportControls({
  state,
  render,
});

bindServerCheckControls({
  state,
  render,
});

bindActionControls({
  state,
  render,
  handlers: {},
});

const actionBusyState = {
  busyAction: '',
  busyLabel: '',
  configTesting: false,
  configApplying: false,
  serverChecking: false,
  serverCheckingTags: [],
  message: '',
};
let actionBusySeen = false;
let actionBusyDuringHandler = false;
let actionClickHandler = null;
let actionErrorClickHandler = null;
const actionButton = {
  dataset: { action: 'apply' },
  classList: { contains: () => false },
  textContent: 'Применить',
  addEventListener: (_event, handler) => { actionClickHandler = handler; },
};
const actionErrorButton = {
  dataset: { action: 'restart' },
  classList: { contains: () => false },
  textContent: 'Перезапустить',
  addEventListener: (_event, handler) => { actionErrorClickHandler = handler; },
};
globalThis.document = {
  ...globalThis.document,
  querySelectorAll: (selector) => (selector === '[data-action]' ? [actionButton, actionErrorButton] : []),
};
bindActionControls({
  state: actionBusyState,
  render: () => {
    if (actionBusyState.busyAction === 'apply' && actionBusyState.busyLabel) {
      actionBusySeen = true;
    }
  },
  handlers: {
    apply: async () => {
      actionBusyDuringHandler = actionBusyState.busyAction === 'apply';
      await Promise.resolve();
    },
    restart: async () => {
      throw new Error('exit status 1');
    },
  },
});
await actionClickHandler({ target: actionButton });
await actionErrorClickHandler({ target: actionErrorButton });

let domainModeClickHandler = null;
globalThis.document = {
  ...globalThis.document,
  addEventListener: (event, handler) => {
    if (event === 'click') domainModeClickHandler = handler;
  },
  querySelector: () => null,
  querySelectorAll: () => [],
};
state.domainMonitorMode = 'domains';
state.domainMonitorDeviceFilter = '192.168.1.2';
bindDiagnosticsControls({
  state,
  render,
  domainMonitorFilterStorageKey: 'ruopenray:test',
  activeProxyTag: () => 'proxy',
  probeMonitoredDomain: async () => {},
  focusSniResult: () => {},
  refreshLogs: async () => {},
  configureLogTimer: () => {},
  scrollLogsToBottom: () => {},
});
domainModeClickHandler?.({
  preventDefault: () => {},
  stopPropagation: () => {},
  target: {
    closest: (selector) => selector === '[data-domain-mode]' ? { dataset: { domainMode: 'devices' } } : null,
  },
});
const domainModeSwitchWorks = state.domainMonitorMode === 'devices' && state.domainMonitorDeviceFilter === '';
domainModeClickHandler?.({
  preventDefault: () => {},
  stopPropagation: () => {},
  target: {
    closest: (selector) => selector.includes('data-domain-event-window') ? { dataset: { domainEventWindow: 'large' } } : null,
  },
});
const domainEventWindowSwitchWorks = state.domainMonitorEventWindow === 'large' && state.domainMonitorListWindow === 'large';

const anonymizedConfig = anonymizeConfig({
  outbounds: [{
    tag: 'cloudone-private',
    protocol: 'vless',
    settings: { vnext: [{ address: 'cloudone.example', users: [{ id: '11111111-2222-4333-8444-555555555555', encryption: 'none' }] }] },
    streamSettings: { security: 'reality', realitySettings: { serverName: 'cloudone.example', privateKey: 'secret', shortId: 'abcd' } }
  }],
  routing: { rules: [{ outboundTag: 'cloudone-private', domain: ['domain:2ip.ru'] }] }
});

const subscriptionViewState = {
  serverCheckMode: 'http',
  serverChecking: false,
  serverCheckingTags: [],
  serverCheckHistory: [],
  serverMeta: [],
  serverEditDialog: false,
  subscriptionCandidateSearch: {},
  subscriptionCandidateChecks: {},
  subscriptionCandidateChecking: 'test_subs:0',
  subscriptionFallbackTag: '',
  subscriptionFallbackStartedAt: 0,
  subscriptionFallbackTotal: 0,
  subscriptionFallbackChecked: 0,
  subscriptionFallbackCurrent: '',
  subscriptionPools: [],
  pendingServerTag: '',
  status: {},
};
const serversView = createServersView({
  state: subscriptionViewState,
  escapeHtml,
  stat,
  activeProxyTag: () => '',
  checkForTag: () => null,
  configOutbounds: () => [],
  isSystemOutbound: () => false,
  operationProgressView: () => '',
  outboundAddress: (outbound) => [outbound?.address, outbound?.port].filter(Boolean).join(':'),
  outboundTransport: () => '',
  outboundUsage: () => 0,
  proxyOutbounds: () => [],
  proxyRuleStrategyStats: () => ({ primary: 0, pinned: 0 }),
  routingBalancersPanel: () => '',
  serverCheckButton: () => '',
  serverLocationChip: () => '',
  serverMetaChips: () => '',
  serverStats: () => ({ proxy: 0, system: 0, used: 0 }),
  serverTrafficView: () => '',
});
const subscriptionCardHtml = serversView.subscriptionPoolCard({
  tag: 'test_subs',
  url: 'https://example.test/sub',
  count: 2,
  candidates: [
    { tag: 'Germany', address: '1.2.3.4', port: 443, network: 'tcp', security: 'reality' },
    { tag: 'France', address: '5.6.7.8', port: 443, network: 'tcp', security: 'reality' },
  ],
});
const subscriptionDetailsKeyPersists = subscriptionCardHtml.includes('data-details-key="subscription-candidates-test_subs"');
const subscriptionCandidateBusyIsLocal = subscriptionCardHtml.includes('data-busy="0"')
  && subscriptionCardHtml.includes('data-subscription-candidate-index="0" disabled>Проверяю</button>')
  && subscriptionCardHtml.includes('data-subscription-candidate-index="1" >Проверить</button>');
const mixedRule = { type: 'field', outboundTag: 'proxy', domain: ['domain:chatgpt.com'], ip: ['172.64.150.0/24'], port: '443' };
const mixedRuleSplits = splitMixedRouteRule(mixedRule);
const routingHelpersSplitMixed = mixedRuleSplits.length === 3
  && mixedRuleSplits.some((rule) => rule.domain?.[0] === 'domain:chatgpt.com' && !rule.ip && !rule.port)
  && mixedRuleSplits.some((rule) => rule.ip?.[0] === '172.64.150.0/24' && !rule.domain && !rule.port)
  && mixedRuleSplits.some((rule) => rule.port === '443' && !rule.domain && !rule.ip);
const routingHelpersPreserveMixed = expandRoutePresetRules([mixedRule], true).length === 1
  && expandRoutePresetRules([mixedRule]).length === 3;
const routingHelpersSetMatches = routePresetRuleSetMatches(
  [{ domain: ['domain:b.test', 'domain:a.test'] }, { ip: ['1.1.1.1'] }],
  [{ ip: ['1.1.1.1'] }, { domain: ['domain:a.test', 'domain:b.test'] }]
);
const routingHelpersKeyIgnoresValueOrder = routeRuleConditionKey({ domain: ['b', 'a'] }) === routeRuleConditionKey({ domain: ['a', 'b'] });

const checks = [
  ['aux devices panel', aux.devicesPanel().includes('LAN')],
  ['aux logs panel', aux.logsPanel(true).includes('log-console')],
  ['dashboard keeps config snapshot during transient empty state', dashboardKeepsLastSnapshot],
  ['diagnostics model events', model.logEvents().length === 1],
  ['diagnostics model domains', model.monitoredDomains()[0]?.host === 'chatgpt.com'],
  ['diagnostics domain pause freezes snapshot', pausedMonitorFrozen],
  ['subscription candidate details persistence', subscriptionDetailsKeyPersists],
  ['subscription candidate busy is local', subscriptionCandidateBusyIsLocal],
  ['routing helpers split mixed rules', routingHelpersSplitMixed],
  ['routing helpers preserve mixed flag', routingHelpersPreserveMixed],
  ['routing helpers set matching', routingHelpersSetMatches && routingHelpersKeyIgnoresValueOrder],
  ['routing target bulk replace', routeTargetReplaceWorks],
  ['devices model lease picker', devicesModel.deviceStats().proxy === 1 && devicesModel.routeLeasePicker().includes('192.168.1.2')],
  ['devices actions draft', deviceActionState.config.routing.rules[0]?.source?.[0] === '192.168.1.77' && deviceActionState.config.routing.rules[0]?.inboundTag?.[0] === 'transparent_ipv4'],
  ['diagnostics actions bytes', actions.totalXrayStatsBytes({ outbounds: [{ uplink: 1, downlink: 2 }] }) === 3],
  ['runtime controller samples', runtime.logsUrl().includes('q=chatgpt') && runtime.displayLogText('2\n1') === '1\n2' && (runtime.recordTrafficSample({ system: { traffic: { rxRate: 10, txRate: 5 } } }), runtimeState.trafficHistory.length === 1)],
  ['setup model draft', setupModel.setupReadiness().ready && (setupModel.prepareSetupDraft({ message: false }), setupState.config.inbounds.some((item) => item.tag === 'transparent_ipv4'))],
  ['setup actions run', setupState.setupResult?.ok && setupState.refreshed],
  ['settings actions service', settingsActionState.service?.goGC === 80 && settingsActionState.refreshed],
  ['settings actions logout', logoutClearedSession],
  ['settings actions login is nonblocking', loginReturnedBeforeRefresh && loginRefreshResolved],
  ['settings actions login stores session token without password', loginStoresSessionOnly],
  ['settings actions remember login stores local token without password', loginRememberStoresLocalOnly],
  ['settings actions expired session preserves remember login', expiredRememberLoginPreserved],
  ['action bindings busy state', actionBusySeen && actionBusyDuringHandler && actionBusyState.busyAction === '' && actionBusyState.message.includes('exit status 1')],
  ['diagnostics domain mode switch', domainModeSwitchWorks],
  ['diagnostics domain event window switch', domainEventWindowSwitchWorks],
  ['profile actions', profileActionState.refreshed && profileAnonymizedDownloadWorks],
  ['import actions active', importActiveOk],
  ['import actions subscription basic auth', subscriptionAuthUrlOk],
  ['import actions preserve pinned route targets', splitRouteSwitchState.config.routing.rules[0]?.outboundTag === 'vpn-a' && splitRouteSwitchState.config.routing.rules[1]?.outboundTag === 'vpn-b' && splitRouteSwitchState.config.routing.rules[2]?.outboundTag === 'vpn-b' && splitRouteSwitchState.config.routing.rules[3]?.outboundTag === 'vpn-b'],
  ['server actions check and switch', serverActionState.serverChecks['proxy-new']?.ok && serverActionState.config.routing.rules[0]?.outboundTag === 'proxy-new' && serverActionState.applied && serverActionState.refreshed && serverActionState.selectedSubscription],
  ['observatory actions', observatoryConfigDraft?.observatory?.probeInterval === '15s' && observatoryCheckedTags[0] === 'proxy-one'],
  ['config actions apply', configActionState.configAnalysis?.errors?.length === 0 && configActionState.lastApplyBackup === '/tmp/backup.json'],
  ['config anonymized export', anonymizedConfig.outbounds[0]?.tag === 'proxy-1' && anonymizedConfig.routing.rules[0]?.outboundTag === 'proxy-1' && anonymizedConfig.outbounds[0]?.settings?.vnext?.[0]?.address?.startsWith('[masked') && anonymizedConfig.outbounds[0]?.settings?.vnext?.[0]?.users?.[0]?.id?.startsWith('[masked')],
  ['updates actions geo payload', updatesActions.cleanGeoSourcePayload({ name: ' Custom ', geoipUrl: ' https://x/geoip.dat ', geositeUrl: ' https://x/geosite.dat ' }).geoipUrl === 'https://x/geoip.dat'],
  ['updates actions geo save', updatesState.geoCustomSources[0]?.name === 'Custom Geo' && updatesState.geoCustomSources[0]?.enabled],
  ['sni actions scan', sniActionState.sniScan?.results?.length === 1 && sniActionState.sniTarget === 'cloudone.example'],
  ['sni panel', sni.sniPanel().includes('SNI')],
  ['formatters bytes', formatByteSize(1536) === '2 KB'],
  ['formatters duration', formatDurationCompact(3660) === '1 ч 1 мин'],
  ['initial state tab', initialState.tab === 'dashboard' && initialState.serverCheckMode === 'http'],
  ['routing model rules', routingModel.routeStats().proxy === 1 && routingModel.describeRouteRule(routingModel.routeRules()[0]).kind === 'Сайт или домен'],
  ['routing model managed stats', managedRoutingModel.routeStats().other === 4 && managedRoutingModel.routeStats().direct === 3 && managedRoutingModel.routeSectionDefinitions()[3]?.count === 4],
  ['routing model subscription targets', subscriptionRoutingModel.routeTargetOptions().some((item) => item.value === 'outbound:sub-main') && subscriptionRoutingModel.routeStats().proxy === 1],
  ['routing dsl parser', parsedDsl.rules.length === 3 && parsedDsl.proxyAlias === 'cloudone' && routingDsl.dslPreviewStats(parsedDsl).proxy === 2 && parsedDsl.rules[2]?.network === 'tcp,udp' && routingDsl.isDslDefaultRule(parsedDsl.rules[2], parsedDsl)],
  ['routing preset group target stays grouped', routePresetGroupStableAcrossTarget],
  ['routing preset group inner order controls', routePresetGroupInnerMoveWorks && routePresetGroupInnerDragWorks],
  ['routing values drawer opens on demand', routeValuesDrawerWorks],
  ['routing visible order skips managed rules', routeVisibleNumberingSkipsManaged],
  ['routing custom group from list', routeCustomGroupWorks],
  ['routing selected rule bulk actions', routeSelectedDisableWorks && routeSelectedDeleteWorks],
  ['routing mixed presets split into grouped rules', routeMixedPresetSplitsConditions],
  ['routing preset editor exports fallback icons', routePresetEditorKeepsFallbackIcon],
  ['routing dialog presets render', routeDialogPresetsHtml.includes('ChatGPT') && routeDialogPresetsHtml.includes('Patreon') && routeDialogPresetsHtml.includes('Speedtest') && routeDialogPresetsHtml.includes('data-route-preset-check')],
  ['routing rule target test action', routeRuleTargetTestWorks],
  ['routing rule target list test action', routeRuleTargetListTestWorks],
  ['routing rule target test button', routeDialogSingleHtml.includes('data-action="testRouteRuleTarget"') && routeDialogSingleHtml.includes('route-rule-test-result')],
  ['routing dialog multi value textarea', routeDialogMultiValueHtml.includes('route-value-editor') && routeDialogMultiValueHtml.includes('3 знач.') && routeDialogMultiValueHtml.includes('data-route-value-multiline="0"')],
  ['route balancer actions', routeBalancerState.config.routing.balancers[0]?.tag === 'auto' && routeBalancerState.config.observatory?.enabled && routeBalancerState.routeTargetType === 'balancer'],
  ['dns model normalization', dnsModel.dnsStats().servers === 2 && dnsModel.normalizeDnsAddressInput('192.168.1.1').check === '192.168.1.1:53'],
  ['dns actions draft', dnsActionState.config.dns.servers.some((server) => server?.address === '192.168.1.1') && dnsActionState.config.dns.hosts['router.lan'] === '192.168.1.1' && dnsAuthServerMasked],
  ['dns actions order', String(dnsActionState.config.dns.servers[0]).startsWith('https://') && dnsActionState.config.dns.servers.findIndex((server) => server?.address === '192.168.1.1') > 0],
  ['firewall status hydrate', firewallHydrateOk && firewallHydratePreservesDraft && firewallActiveStatusHydrates],
  ['firewall model payload', firewallModel.firewallInfo().ready && firewallModel.firewallPayload().routerMode === 'tproxy' && firewallModel.firewallPayload().killSwitchIps[0] === '172.64.150.0/24' && firewallModel.firewallPayload().proxyDomains.includes('telegram.org') && firewallModel.firewallPayload().proxyGeosite.includes('youtube')],
  ['firewall model ignores dns inbound as transparent', !dnsOnlyFirewallModel.firewallInfo().ready && dnsOnlyFirewallModel.firewallInfo().transparent.length === 0 && dnsOnlyFirewallModel.firewallPolicyPreview().warnings.some((item) => item.includes('Нет transparent inbound'))],
  ['firewall actions draft', firewallState.firewallBypassMode === 'redirect' && firewallState.firewallPortMode === 'all' && firewallState.firewallKillSwitchTargets.includes('chatgpt.com')],
  ['xray draft actions', xrayDraftState.config.dns.fakeDNS?.length === 1 && xrayDraftState.config.outbounds[0]?.streamSettings?.sockopt?.tcpFastOpen === true && xrayDraftState.config.routing.rules[0]?.outboundTag === 'direct'],
  ['server model active proxy', serverModel.activeProxyTag() === 'cloudone' && serverModel.proxyOutbounds().length === 1 && serverModel.outboundUsage('cloudone') === 1],
  ['xray config model', xrayConfigModel.currentSnifferSettings().mode === 'http-tls' && xrayConfigModel.outboundAddress(xrayConfigModel.configOutbounds()[0]) === 'example.com:443'],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`Frontend smoke failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}

console.log(`Frontend smoke passed (${checks.length} checks, ${renders} renders)`);
