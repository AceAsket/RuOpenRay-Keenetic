export function createSniActions({
  state,
  request,
  render,
  outboundAddress,
  activeProxyOutbound
}) {
  async function scanSni() {
    const activeTarget = String(outboundAddress(activeProxyOutbound?.() || {}) || '').split(':')[0].trim();
    const target = state.sniTarget.trim() || activeTarget;
    if (!target) {
      state.message = 'Укажите IP или домен для SNI-поиска';
      render();
      return;
    }
    state.sniTarget = target;
    state.sniScanning = true;
    state.message = `Ищу TLS/SNI точки рядом с ${target}...`;
    render();
    try {
      state.sniScan = await request('/api/sni/scan', {
        method: 'POST',
        body: JSON.stringify({
          target,
          cidr: Number(state.sniCidr) || 24,
          timeoutMs: Number(state.sniTimeout) || 1500,
          threads: Number(state.sniThreads) || 64,
          limit: Number(state.sniLimit) || 256
        })
      });
      state.message = `SNI-поиск завершен: найдено ${state.sniScan.results?.length || 0} из ${state.sniScan.scanned || 0} адресов`;
    } finally {
      state.sniScanning = false;
      render();
    }
  }

  function focusSniResult(index) {
    const normalized = Number(index);
    if (!Number.isFinite(normalized)) return;
    state.sniFocusedIndex = normalized;
    document.querySelectorAll('.sni-row.focused').forEach((row) => row.classList.remove('focused'));
    const row = document.querySelector(`[data-sni-result="${normalized}"]`);
    if (!row) return;
    row.classList.add('focused');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }


  return {
    scanSni,
    focusSniResult
  };
}
