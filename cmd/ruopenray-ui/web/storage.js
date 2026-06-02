export const routeNamesStorageKey = 'ruopenray_route_names';
export const disabledRouteRulesStorageKey = 'ruopenray_disabled_route_rules';
export const customRoutePresetsStorageKey = 'ruopenray_custom_route_presets';
export const savedPasswordStorageKey = 'ruopenray_saved_password';
export const authTokenStorageKey = 'openray_token';
export const authRememberStorageKey = 'ruopenray_remember_login';
export const firewallBypassModeStorageKey = 'ruopenray_firewall_bypass_mode';
export const firewallRouterModeStorageKey = 'ruopenray_firewall_router_mode';
export const firewallDeviceModeStorageKey = 'ruopenray_firewall_device_mode';
export const firewallSelectedDevicesStorageKey = 'ruopenray_firewall_selected_devices';
export const firewallKillSwitchDeviceModeStorageKey = 'ruopenray_firewall_kill_switch_device_mode';
export const firewallKillSwitchSelectedDevicesStorageKey = 'ruopenray_firewall_kill_switch_selected_devices';
export const firewallPortModeStorageKey = 'ruopenray_firewall_port_mode';
export const firewallPortsStorageKey = 'ruopenray_firewall_ports';
export const firewallBlockQuicStorageKey = 'ruopenray_firewall_block_quic';
export const firewallDnsInterceptStorageKey = 'ruopenray_firewall_dns_intercept';
export const firewallKillSwitchEnabledStorageKey = 'ruopenray_firewall_kill_switch_enabled';
export const firewallKillSwitchTargetsStorageKey = 'ruopenray_firewall_kill_switch_targets';
export const firewallKillSwitchDomainModeStorageKey = 'ruopenray_firewall_kill_switch_domain_mode';
export const firewallStorageKeys = [
  firewallBypassModeStorageKey,
  firewallRouterModeStorageKey,
  firewallDeviceModeStorageKey,
  firewallSelectedDevicesStorageKey,
  firewallKillSwitchDeviceModeStorageKey,
  firewallKillSwitchSelectedDevicesStorageKey,
  firewallPortModeStorageKey,
  firewallPortsStorageKey,
  firewallBlockQuicStorageKey,
  firewallDnsInterceptStorageKey,
  firewallKillSwitchEnabledStorageKey,
  firewallKillSwitchTargetsStorageKey,
  firewallKillSwitchDomainModeStorageKey
];
export const xrayStatsResetAtStorageKey = 'ruopenray_xray_stats_reset_at';
export const setupSnapshotStorageKey = 'ruopenray_setup_snapshot';
export const domainMonitorFilterStorageKey = 'ruopenray_domain_monitor_filter';
export const installPasswordStorageKey = 'ruopenray_install_password';
export const uiThemeStorageKey = 'ruopenray_ui_theme';

export const sensitiveBrowserStorageKeys = [
  'ruopenray_active_server',
  savedPasswordStorageKey,
  installPasswordStorageKey,
  routeNamesStorageKey,
  disabledRouteRulesStorageKey,
  customRoutePresetsStorageKey,
  setupSnapshotStorageKey,
  ...firewallStorageKeys
];

export function cleanupSensitiveBrowserStorage() {
  for (const key of sensitiveBrowserStorageKeys) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {}
  }
}

export function loadAuthToken() {
  const remembered = globalThis.localStorage?.getItem(authTokenStorageKey) || '';
  if (remembered) return { token: remembered, remembered: true };
  return {
    token: globalThis.sessionStorage?.getItem(authTokenStorageKey) || '',
    remembered: loadAuthRememberPreference()
  };
}

export function loadAuthRememberPreference() {
  return globalThis.localStorage?.getItem(authRememberStorageKey) === '1';
}

export function saveAuthRememberPreference(remember = false) {
  if (remember) {
    globalThis.localStorage?.setItem(authRememberStorageKey, '1');
  } else {
    globalThis.localStorage?.removeItem(authRememberStorageKey);
  }
}

export function saveAuthToken(token, remember = false) {
  if (!token) {
    clearAuthToken();
    return;
  }
  saveAuthRememberPreference(remember);
  if (remember) {
    globalThis.localStorage?.setItem(authTokenStorageKey, token);
    globalThis.sessionStorage?.removeItem(authTokenStorageKey);
    return;
  }
  globalThis.sessionStorage?.setItem(authTokenStorageKey, token);
  globalThis.localStorage?.removeItem(authTokenStorageKey);
}

export function clearAuthToken({ preserveRemember = false } = {}) {
  globalThis.sessionStorage?.removeItem(authTokenStorageKey);
  globalThis.localStorage?.removeItem(authTokenStorageKey);
  if (!preserveRemember) saveAuthRememberPreference(false);
}

export function normalizeUiTheme(value) {
  return value === 'light' ? 'light' : 'dark';
}

export function loadUiTheme() {
  return normalizeUiTheme(globalThis.localStorage?.getItem(uiThemeStorageKey) || 'dark');
}

export function saveUiTheme(theme) {
  const normalized = normalizeUiTheme(theme);
  globalThis.localStorage?.setItem(uiThemeStorageKey, normalized);
  return normalized;
}

export function randomPanelPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export function initialInstallPassword() {
  const saved = globalThis.sessionStorage?.getItem(installPasswordStorageKey);
  if (saved) return saved;
  const generated = randomPanelPassword();
  globalThis.sessionStorage?.setItem(installPasswordStorageKey, generated);
  return generated;
}

export function shellQuote(value) {
  return `'${String(value || '').replace(/'/g, `'\\''`)}'`;
}

export function loadRouteNames() {
  try {
    globalThis.localStorage?.removeItem(routeNamesStorageKey);
  } catch {}
  return {};
}

export function loadCustomRoutePresets() {
  try {
    globalThis.localStorage?.removeItem(customRoutePresetsStorageKey);
  } catch {}
  return {};
}
