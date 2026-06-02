export function createDevicesModel({
  state,
  routeRules,
  routeRuleName,
  describeRouteRule,
  splitRouteValues,
  escapeHtml,
  formatDuration
}) {
  function leaseByIp(ip) {
    return state.leases.find((lease) => lease.ip === ip);
  }

  function leaseSearchText(lease = {}) {
    return [lease.name, lease.hostname, lease.ip, lease.mac]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function routeLeasePicker() {
    if (state.routeKind !== 'source') return '';
    const selected = new Set(splitRouteValues(state.routeValue));
    const source = state.leasesSource || '/tmp/dhcp.leases';
    return `
      <div class="route-lease-picker">
        <div class="route-lease-head">
          <span>${state.leases.length ? `${state.leases.length} DHCP leases · ${escapeHtml(source)}` : 'DHCP leases пока не найдены'}</span>
          <button class="btn secondary" type="button" data-action="refreshDhcpLeases">Обновить DHCP</button>
        </div>
        <input class="lease-search" data-lease-search value="${escapeHtml(state.leaseSearch)}" placeholder="Найти устройство: имя, IP или MAC" />
        <div class="route-lease-grid">
          ${state.leases.length ? state.leases.map((lease) => {
            const active = selected.has(lease.ip);
            const name = lease.name || 'Без имени';
            const detail = [lease.ip, lease.mac, lease.remaining ? `осталось ${formatDuration(lease.remaining)}` : ''].filter(Boolean).join(' · ');
            return `<button type="button" class="route-lease-card ${active ? 'active' : ''}" data-lease-search-item data-lease-search-text="${escapeHtml(leaseSearchText(lease))}" data-route-lease-ip="${escapeHtml(lease.ip)}" data-route-lease-name="${escapeHtml(name)}">
              <strong>${escapeHtml(name)}</strong>
              <span>${escapeHtml(detail)}</span>
            </button>`;
          }).join('') : '<p class="muted">На OpenWrt обычно читается <code>/tmp/dhcp.leases</code>. Можно ввести IP вручную.</p>'}
          <p class="muted lease-search-empty" data-lease-search-empty hidden>По этому запросу устройств нет.</p>
        </div>
      </div>
    `;
  }

  function deviceRules() {
    return routeRules()
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => Array.isArray(rule.source) && rule.source.length);
  }

  function deviceStats() {
    const stats = { proxy: 0, direct: 0, block: 0, other: 0 };
    for (const { rule } of deviceRules()) {
      if (rule.outboundTag === 'proxy') stats.proxy += 1;
      else if (rule.outboundTag === 'direct') stats.direct += 1;
      else if (rule.outboundTag === 'block') stats.block += 1;
      else stats.other += 1;
    }
    return stats;
  }

  function normalizeDeviceIp(value) {
    return String(value || '').trim();
  }

  return {
    leaseByIp,
    leaseSearchText,
    routeLeasePicker,
    deviceRules,
    deviceStats,
    normalizeDeviceIp
  };
}
