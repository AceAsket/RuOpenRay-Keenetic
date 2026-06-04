export function createDiagnosticsKeeneticView(deps) {
  const {
    byteSize,
    deviceRules,
    escapeHtml,
    state
  } = deps;

  function boolText(value) {
    return value ? 'да' : 'нет';
  }

  function checkIcon(tone) {
    if (tone === 'ok') return '✓';
    if (tone === 'warn') return '!';
    return '×';
  }

  function checkRow({ tone, title, detail }) {
    return `<article class="${escapeHtml(tone)}">
      <span>${checkIcon(tone)}</span>
      <div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail || '')}</small></div>
    </article>`;
  }

  function counterPackets(counter) {
    return Number(counter?.packets || 0);
  }

  function preflightText(summary) {
    if (summary === 'blocked') return 'есть ошибки';
    if (summary === 'warnings') return 'есть предупреждения';
    if (summary === 'ready') return 'готов';
    return summary || 'unknown';
  }

  function diagnosticsKeeneticView() {
    const status = state.status || {};
    const firewall = state.firewallStatus || {};
    const preflight = firewall.preflight || {};
    const watchdog = firewall.watchdog || {};
    const fd = watchdog.fd || {};
    const deleted = watchdog.deleted || {};
    const nativePolicy = firewall.nativePolicy || {};
    const lanDns = state.lanDnsStatus || {};
    const counters = firewall.counters || {};
    const activeCounters = firewall.routerMode === 'tproxy'
      ? { jump: counters.tproxyJump || {}, chain: counters.tproxyChain || {} }
      : { jump: counters.redirectJump || {}, chain: counters.redirectChain || {} };
    const firewallPackets = counterPackets(activeCounters.jump) + counterPackets(activeCounters.chain);
    const leases = Array.isArray(state.leases) ? state.leases : [];
    const rules = typeof deviceRules === 'function' ? deviceRules() : [];
    const coreVersion = status.core?.version || 'Xray не найден';
    const disk = status.system?.disk || {};
    const checks = [];

    checks.push({
      tone: preflight.summary === 'blocked' ? 'bad' : preflight.summary === 'warnings' ? 'warn' : 'ok',
      title: 'Keenetic hook',
      detail: `${firewall.routerMode || 'unknown'} · active=${boolText(firewall.active)} · persistent=${boolText(firewall.persistent)}`
    });
    checks.push({
      tone: watchdog.enabled === false ? 'warn' : watchdog.ok ? 'ok' : 'warn',
      title: 'FD watchdog',
      detail: watchdog.detail || `open ${fd.open || 0}/${fd.limit || 0} · deleted ${deleted.count || 0}`
    });
    checks.push({
      tone: nativePolicy.enabled ? (Number(nativePolicy.count || 0) > 0 ? 'warn' : nativePolicy.ok === false ? 'warn' : 'ok') : 'ok',
      title: 'Native policy KeeneticOS',
      detail: nativePolicy.enabled ? (nativePolicy.detail || `${nativePolicy.count || 0} строк`) : 'Ручной scope RuOpenRay; аудит native policies выключен'
    });
    checks.push({
      tone: lanDns.platform === 'keenetic' ? 'ok' : 'warn',
      title: 'LAN DNS',
      detail: `${lanDns.mode || 'unknown'} · ${(lanDns.servers || []).join(', ') || 'серверы не заданы'}${firewall.dnsIntercept ? ' · DNS intercept включен' : ''}`
    });
    checks.push({
      tone: leases.length > 0 ? 'ok' : 'warn',
      title: 'DHCP visibility',
      detail: `${leases.length} leases · ${rules.length} source-правил · ${state.leasesSource || 'KeeneticOS'}`
    });
    checks.push({
      tone: firewallPackets > 0 ? 'ok' : 'warn',
      title: 'Firewall counters',
      detail: `${firewallPackets} packets · jump ${counterPackets(activeCounters.jump)} · chain ${counterPackets(activeCounters.chain)}`
    });
    checks.push({
      tone: firewall.blockQuic ? 'ok' : 'warn',
      title: 'QUIC guard',
      detail: firewall.blockQuic ? 'UDP/443 блокируется hook-цепочкой' : 'UDP/443 не блокируется; часть HTTPS может уйти в QUIC'
    });
    checks.push({
      tone: firewall.ipv6Mode === 'disable' ? (firewall.ipv6Active ? 'ok' : 'warn') : 'ok',
      title: 'IPv6',
      detail: firewall.ipv6Mode === 'disable' ? `режим disable · active=${boolText(firewall.ipv6Active)}` : `режим ${firewall.ipv6Mode || 'observe'}`
    });

    return `
      <section class="traffic-overview-panel">
        <article class="traffic-overview-main">
          <span>Keenetic runtime</span>
          <strong>${escapeHtml(status.app?.version || 'dev')}</strong>
          <small>${escapeHtml(`${status.app?.asset || 'ruopenray-ui'} · ${status.service?.running ? 'service running' : 'service stopped'}`)}</small>
        </article>
        <article>
          <span>Xray core</span>
          <strong>${escapeHtml(status.core?.available ? 'доступен' : 'не найден')}</strong>
          <small>${escapeHtml(coreVersion)}</small>
        </article>
        <article>
          <span>Firewall</span>
          <strong>${escapeHtml(preflightText(preflight.summary))}</strong>
          <small>${escapeHtml(`${firewall.routerMode || 'unknown'} · ${firewallPackets} packets`)}</small>
        </article>
        <article>
          <span>Память</span>
          <strong>${escapeHtml(disk.free ? byteSize(disk.free) : 'неизвестно')}</strong>
          <small>${escapeHtml(disk.usedPercent ? `${disk.usedPercent} занято` : 'storage report пустой')}</small>
        </article>
      </section>

      <section class="panel chain-diagnostics">
        <div class="panel-title">
          <div>
            <h2>Keenetic audit</h2>
            <span>Сводка совместимости: runtime, hook, DNS, LAN-видимость, counters и родные политики KeeneticOS.</span>
          </div>
          <div class="split-actions">
            <button class="btn secondary" type="button" data-action="refresh">Обновить</button>
            <button class="btn secondary" type="button" data-action="repairFirewall">Починить runtime</button>
            <button class="btn secondary" type="button" data-tab-jump="routing" data-routing-view-jump="intercept">Firewall</button>
            <button class="btn secondary" type="button" data-tab-jump="settings" data-settings-view="keenetic">Настройки</button>
          </div>
        </div>
        <div class="setup-result-list chain-result-list">
          ${checks.map(checkRow).join('')}
        </div>
      </section>
    `;
  }

  return { diagnosticsKeeneticView };
}
