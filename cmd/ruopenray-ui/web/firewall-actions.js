import { hydrateFirewallDraftFromStatus } from './firewall-state.js';

export function createFirewallActions({
  state,
  request,
  render,
  delay,
  firewallPayload,
  firewallCommands,
  firewallSafetyCheck,
  firewallReadyStatus
}) {
  async function applyFirewallWithRetry(attempts = 2) {
    let lastResult = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await delay(1200);
      lastResult = await request('/api/firewall/apply', {
        method: 'POST',
        body: JSON.stringify(firewallPayload())
      });
      state.firewallStatus = lastResult.status || lastResult;
      if (lastResult.ok && firewallReadyStatus(state.firewallStatus)) return lastResult;

      await delay(800);
      const status = await request('/api/firewall/status').catch(() => null);
      if (status) state.firewallStatus = status;
      if (firewallReadyStatus(state.firewallStatus)) {
        return { ok: true, status: state.firewallStatus, retried: attempt > 0 };
      }
    }
    return lastResult || { ok: false, status: state.firewallStatus };
  }

  async function applyFirewall(options = {}) {
    const safety = typeof firewallSafetyCheck === 'function' ? firewallSafetyCheck() : null;
    if (safety?.hasDanger && !state.firewallSafetyAccepted) {
      state.message = 'Firewall не применен: подтвердите опасные правила в блоке безопасности.';
      render();
      return;
    }
    const busyAction = options.busyAction || 'applyFirewall';
    state.firewallSaving = true;
    state.busyAction = busyAction;
    state.busyLabel = options.busyLabel || '';
    render();
    try {
      const result = await applyFirewallWithRetry(options.attempts || 3);
      state.firewallGeoExpansion = result?.geoExpansion || null;
      const ready = firewallReadyStatus(state.firewallStatus);
      state.message = result.ok && ready
        ? (options.successMessage || 'Firewall-правила применены и сохранены для автозагрузки')
        : (result.error || 'Не удалось применить перехват');
      return result;
    } finally {
      state.firewallSaving = false;
      if (state.busyAction === busyAction) state.busyAction = '';
      state.busyLabel = '';
      render();
    }
  }

  async function disableFirewall() {
    state.firewallSaving = true;
    state.busyAction = 'disableFirewall';
    render();
    try {
      const result = await request('/api/firewall/disable', { method: 'POST' });
      state.firewallStatus = result.status || result;
      state.message = result.ok ? 'Firewall-правила отключены' : 'Не удалось полностью отключить firewall-правила';
    } finally {
      state.firewallSaving = false;
      if (state.busyAction === 'disableFirewall') state.busyAction = '';
      render();
    }
  }

  async function refreshFirewallStatus() {
    state.busyAction = 'refreshFirewallStatus';
    render();
    try {
      state.firewallStatus = await request('/api/firewall/status');
      hydrateFirewallDraftFromStatus(state, state.firewallStatus);
    } finally {
      if (state.busyAction === 'refreshFirewallStatus') state.busyAction = '';
      render();
    }
  }

  async function downloadFirewallRules() {
    state.firewallSaving = true;
    state.busyAction = 'downloadFirewallRules';
    render();
    try {
      const payload = firewallPayload();
      const preview = await request('/api/firewall/preview', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      state.firewallGeoExpansion = preview?.geoExpansion || null;
      const status = preview.status || await request('/api/firewall/status').catch(() => null);
      const report = [
        'RuOpenRay UI firewall report',
        `Generated: ${new Date().toISOString()}`,
        '',
        '== UI payload ==',
        JSON.stringify(payload, null, 2),
        '',
        '== Generated nftables ==',
        preview.nft || '',
        '',
        '== Active nftables on router ==',
        status?.nft?.stdout || 'not available',
        '',
        '== Policy routing ==',
        '-- ip rule show --',
        status?.ipRules?.stdout || 'not available',
        '',
        '-- ip route show table 100 --',
        status?.ipRoutes?.stdout || 'not available',
        '',
        '== Firewall status ==',
        JSON.stringify(status || {}, null, 2),
        '',
        '== Manual commands preview ==',
        typeof firewallCommands === 'function' ? firewallCommands() : '',
        ''
      ].join('\n');
      downloadText(`ruopenray-firewall-${dateStamp()}.txt`, report);
      state.message = 'Отчет по правилам firewall скачан';
    } catch (error) {
      state.message = error?.message || 'Не удалось скачать отчет по firewall';
    } finally {
      state.firewallSaving = false;
      if (state.busyAction === 'downloadFirewallRules') state.busyAction = '';
      render();
    }
  }

  function setFirewallBypassMode(mode) {
    resetFirewallSafetyAccept();
    state.firewallBypassMode = ['off', 'bypass', 'redirect'].includes(mode) ? mode : 'off';
    render();
  }

  function setFirewallRouterMode(mode) {
    resetFirewallSafetyAccept();
    state.firewallRouterMode = ['tproxy', 'redirect'].includes(mode) ? mode : 'tproxy';
    render();
  }

  function setFirewallDeviceMode(mode) {
    resetFirewallSafetyAccept();
    state.firewallDeviceMode = ['all', 'selected', 'exclude'].includes(mode) ? mode : 'all';
    render();
  }

  function setFirewallPortMode(mode) {
    resetFirewallSafetyAccept();
    state.firewallPortMode = mode === 'all' ? 'all' : 'custom';
    render();
  }

  function toggleFirewallDevice(ip, enabled) {
    resetFirewallSafetyAccept();
    const selected = new Set(state.firewallSelectedDevices);
    if (enabled) selected.add(ip);
    else selected.delete(ip);
    state.firewallSelectedDevices = [...selected];
    render();
  }

  function setFirewallBlockQuic(enabled) {
    resetFirewallSafetyAccept();
    state.firewallBlockQuic = Boolean(enabled);
    render();
  }

  function setQuicPolicy(policy) {
    setFirewallBlockQuic(policy === 'block');
  }

  function setFirewallKillSwitchEnabled(enabled) {
    resetFirewallSafetyAccept();
    state.firewallKillSwitchEnabled = Boolean(enabled);
    render();
  }

  function setFirewallKillSwitchDeviceMode(mode) {
    resetFirewallSafetyAccept();
    state.firewallKillSwitchDeviceMode = ['all', 'selected', 'exclude'].includes(mode) ? mode : 'all';
    render();
  }

  function toggleFirewallKillSwitchDevice(ip, enabled) {
    resetFirewallSafetyAccept();
    const selected = new Set(state.firewallKillSwitchSelectedDevices || []);
    if (enabled) selected.add(ip);
    else selected.delete(ip);
    state.firewallKillSwitchSelectedDevices = [...selected];
    render();
  }

  function setFirewallKillSwitchDomainMode(mode) {
    resetFirewallSafetyAccept();
    state.firewallKillSwitchDomainMode = mode === 'nftset' ? 'nftset' : 'dns-block';
    render();
  }

  function setFirewallKillSwitchTargets(value) {
    resetFirewallSafetyAccept();
    state.firewallKillSwitchTargets = value;
  }

  function resetFirewallSafetyAccept() {
    state.firewallSafetyAccepted = false;
  }

  return {
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
    setFirewallKillSwitchDeviceMode,
    toggleFirewallKillSwitchDevice,
    setFirewallBlockQuic,
    setQuicPolicy,
    setFirewallKillSwitchEnabled,
    setFirewallKillSwitchDomainMode,
    setFirewallKillSwitchTargets
  };
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function dateStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
