export function createDiagnosticsActions({
  state,
  request,
  render,
  byteSize,
  xrayActiveStats,
  activeProxyTag,
}) {
  function nftBytes(status) {
    const matches = [...String(status?.nft?.stdout || '').matchAll(/\bbytes\s+(\d+)/g)].map((match) => Number(match[1]) || 0);
    return matches.reduce((sum, value) => sum + value, 0);
  }
  
  function totalXrayStatsBytes(stats) {
    const outbounds = Array.isArray(stats?.outbounds) ? stats.outbounds : [];
    return outbounds.reduce((sum, item) => sum + Number(item.uplink || 0) + Number(item.downlink || 0), 0);
  }
  
  async function triggerBrowserTraffic(url) {
    const target = `${url}${url.includes('?') ? '&' : '?'}ruopenray_check=${Date.now()}`;
    try {
      const response = await request('/api/diagnostics/http-probe', { method: 'POST', body: JSON.stringify({ url: target, timeout: 8 }) });
      return {
        ok: Boolean(response.ok),
        detail: response.ok
          ? `запрос с роутера выполнен${response.status ? `, HTTP ${response.status}` : ''}`
          : (response.error || response.stderr || response.message || 'запрос с роутера не выполнен'),
      };
    } catch (error) {
      return { ok: false, detail: error.message };
    }
  }
  
  async function runConnectivityDiagnostics() {
    state.diagnosticsChainRunning = true;
    state.diagnosticsChainResult = { steps: [] };
    render();
    const steps = [];
    const pushStep = (ok, title, detail = '', tone = '') => {
      steps.push({ ok, title, detail, tone });
      state.diagnosticsChainResult = { ok: steps.every((step) => step.ok || step.tone === 'warn'), steps, updatedAt: new Date().toISOString() };
      render();
    };
    try {
      const config = await request('/api/config');
      const test = await request('/api/config/test', { method: 'POST', body: JSON.stringify({ config }) });
      pushStep(Boolean(test.ok), 'Конфигурация Xray', test.ok ? 'Configuration OK' : (test.stderr || 'Ошибка проверки'));
  
      const lanDns = await request('/api/dns/lan-upstream');
      const dnsReady = Boolean(lanDns.ok && (lanDns.mode !== 'xray' || lanDns.readiness?.ready));
      pushStep(dnsReady, 'LAN DNS / dnsmasq', `${lanDns.mode || 'unknown'} · ${(lanDns.servers || []).join(', ') || 'серверы не заданы'}`);
  
      const xrayDnsServer = String(lanDns.xrayTarget || lanDns.suggestedXrayTarget || '127.0.0.1#10535').replace('#', ':');
      const dnsServer = lanDns.mode === 'xray' ? xrayDnsServer : ((lanDns.servers || [])[0] || '127.0.0.1:53');
      const dnsCheck = await request('/api/dns/check', { method: 'POST', body: JSON.stringify({ server: dnsServer, host: 'example.com' }) });
      const addresses = [...(dnsCheck.addresses || []), ...(dnsCheck.a || [])];
      pushStep(Boolean(dnsCheck.ok && addresses.length), 'Проверка DNS-ответа', addresses.length ? addresses.join(', ') : (dnsCheck.error || 'нет A-записей'));
  
      const firewallBefore = await request('/api/firewall/status');
      const firewallReady = Boolean(firewallBefore.active && firewallBefore.persistent && (firewallBefore.routerMode !== 'tproxy' || (firewallBefore.ipRule && firewallBefore.ipRoute)));
      pushStep(firewallReady, 'nftables и policy routing', `${firewallBefore.routerMode || 'unknown'} · active=${Boolean(firewallBefore.active)} · persistent=${Boolean(firewallBefore.persistent)}`);
  
      const statsBefore = await request('/api/xray/stats').catch(() => null);
      const beforeBytes = nftBytes(firewallBefore);
      const beforeStats = totalXrayStatsBytes(statsBefore);
      const browserTraffic = await triggerBrowserTraffic(state.diagnosticsTestUrl || 'https://www.gstatic.com/generate_204');
      const firewallAfter = await request('/api/firewall/status');
      const statsAfter = await request('/api/xray/stats').catch(() => null);
      const nftDelta = nftBytes(firewallAfter) - beforeBytes;
      const statsDelta = totalXrayStatsBytes(statsAfter) - beforeStats;
      const trafficDetail = `nft +${byteSize(Math.max(0, nftDelta))} · Xray stats +${byteSize(Math.max(0, statsDelta))} · ${browserTraffic.detail}${nftDelta <= 0 && statsDelta <= 0 ? ' · трафик самого роутера может идти мимо LAN-перехвата' : ''}`;
      pushStep(Boolean(browserTraffic.ok || nftDelta > 0 || statsDelta > 0), 'Проверка выхода с роутера', trafficDetail, browserTraffic.ok ? 'warn' : '');
  
      const active = xrayActiveStats(statsAfter || state.status?.xrayStats || {});
      pushStep(Boolean(statsAfter?.enabled), 'Статистика Xray', statsAfter?.enabled ? `активный: ${active?.tag || 'не выбран'} · proxy принято ${byteSize(statsAfter.groups?.proxy?.downlink || 0)} · отправлено ${byteSize(statsAfter.groups?.proxy?.uplink || 0)}` : 'учет трафика выключен', statsAfter?.enabled ? '' : 'warn');
    } catch (error) {
      pushStep(false, 'Диагностика остановлена', error.message);
    } finally {
      state.diagnosticsChainRunning = false;
      render();
    }
  }
  
  async function startClientTrafficTest() {
    const [firewall, stats] = await Promise.all([
      request('/api/firewall/status'),
      request('/api/xray/stats').catch(() => null)
    ]);
    state.clientTrafficBaseline = {
      at: new Date().toISOString(),
      nftBytes: nftBytes(firewall),
      statsBytes: totalXrayStatsBytes(stats),
      statsEnabled: Boolean(stats?.enabled),
      activeTag: activeProxyTag(),
    };
    state.clientTrafficResult = null;
    state.message = 'Точка отсчета сохранена. Откройте проверочный URL с устройства в LAN и нажмите “Проверить после клиента”.';
    render();
  }
  
  async function finishClientTrafficTest() {
    if (!state.clientTrafficBaseline) {
      await startClientTrafficTest();
      return;
    }
    const [firewall, stats] = await Promise.all([
      request('/api/firewall/status'),
      request('/api/xray/stats').catch(() => null)
    ]);
    const nftDelta = nftBytes(firewall) - Number(state.clientTrafficBaseline.nftBytes || 0);
    const statsDelta = totalXrayStatsBytes(stats) - Number(state.clientTrafficBaseline.statsBytes || 0);
    state.clientTrafficResult = {
      ok: nftDelta > 0 || statsDelta > 0,
      at: new Date().toISOString(),
      nftDelta: Math.max(0, nftDelta),
      statsDelta: Math.max(0, statsDelta),
      statsEnabled: Boolean(stats?.enabled),
      activeTag: activeProxyTag(),
    };
    state.message = state.clientTrafficResult.ok
      ? 'Клиентский трафик замечен: счетчики выросли.'
      : 'Счетчики не выросли. Проверьте, что устройство использует этот роутер как шлюз и DNS.';
    render();
  }

  async function runDpiDiagnostics() {
    state.dpiRunning = true;
    state.dpiResult = null;
    render();
    try {
      const target = String(state.dpiTarget || '').trim() || 'https://www.gstatic.com/generate_204';
      const tag = String(state.dpiProxyTag || '').trim();
      if (!tag) throw new Error('Выберите proxy для сравнения');
      state.dpiResult = await request('/api/diagnostics/dpi-probe', {
        method: 'POST',
        body: JSON.stringify({ target, tag, timeoutMs: 6000, attempts: 2 })
      });
      state.message = state.dpiResult?.ok
        ? `DPI-проверка: ${state.dpiResult.verdict?.label || 'готово'}`
        : (state.dpiResult?.stderr || state.dpiResult?.error || 'DPI-проверка не выполнена');
    } catch (error) {
      state.dpiResult = { ok: false, error: error.message };
      state.message = error.message;
    } finally {
      state.dpiRunning = false;
      render();
    }
  }

  return {
    nftBytes,
    totalXrayStatsBytes,
    triggerBrowserTraffic,
    runConnectivityDiagnostics,
    runDpiDiagnostics,
    startClientTrafficTest,
    finishClientTrafficTest,
  };
}
