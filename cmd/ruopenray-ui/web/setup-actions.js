export function createSetupActions({
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
}) {
  async function openInstallWizard() {
    state.installWizardOpen = true;
    state.installStep = 'plan';
    state.message = '';
    render();
    try {
      state.installPlan = await request('/api/install/plan');
    } catch (error) {
      state.installPlan = { ok: false, error: error.message, steps: [] };
    }
    render();
  }

  async function openSetupWizard() {
    if (['tproxy', 'redirect'].includes(state.firewallStatus?.routerMode)) {
      state.firewallRouterMode = state.firewallStatus.routerMode;
    }
    state.setupWizardOpen = false;
    state.tab = 'setup';
    state.setupStep = state.setupStep || 'environment';
    state.setupResult = null;
    state.setupRollbackResult = null;
    loadSetupSnapshot();
    state.message = '';
    if (!state.installPlan) {
      request('/api/install/plan').then((plan) => {
        state.installPlan = plan;
        if (state.setupWizardOpen) render();
      }).catch(() => {});
    }
    render();
  }

  function setupPrepareDraft() {
    prepareSetupDraft();
    state.setupStepNotice = {
      step: state.setupStep || 'routing',
      level: 'ok',
      title: 'Черновик подготовлен',
      detail: 'Служебные входящие потоки, DNS и базовые правила добавлены в черновик. Перед применением мастер еще раз проверит конфигурацию.'
    };
    render();
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForLanDnsReadiness() {
    let latest = state.lanDnsStatus;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      latest = await request('/api/dns/lan-upstream').catch(() => latest);
      if (latest) syncLanDnsStatus(latest);
      if (state.setupLanDnsMode !== 'xray' || latest?.readiness?.ready) return latest;
      await delay(1000);
    }
    return latest;
  }

  async function runSetupWizard() {
    const readiness = setupReadiness();
    if (!readiness.canApply) {
      state.setupResult = { ok: false, steps: [{ ok: false, title: 'Не хватает основы', detail: 'Сначала установите Xray и добавьте хотя бы один proxy-сервер.' }] };
      render();
      return;
    }
    state.setupApplying = true;
    state.setupStepNotice = null;
    state.setupResult = { ok: true, steps: [] };
    render();
    const steps = [];
    const pushStep = (ok, title, detail = '') => {
      steps.push({ ok, title, detail });
      state.setupResult = { ok: steps.every((step) => step.ok), steps };
      render();
    };
    try {
      const snapshot = await captureSetupSnapshot();
      pushStep(Boolean(snapshot.config), 'Снимок для отката', snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString('ru-RU') : '');

      prepareSetupDraft({ message: false });
      const config = JSON.parse(state.jsonDraft);
      const test = await request('/api/config/test', { method: 'POST', body: JSON.stringify({ config }) });
      pushStep(Boolean(test.ok), 'Проверка конфигурации Xray', test.stdout || test.stderr || '');
      if (!test.ok) throw new Error(test.stderr || 'Конфигурация Xray не прошла проверку');

      const apply = await request('/api/config/apply', { method: 'POST', body: JSON.stringify({ config }) });
      pushStep(Boolean(apply.ok), 'Применение конфигурации Xray', apply.restart?.stdout || apply.test?.stdout || '');
      if (!apply.ok) throw new Error(apply.restart?.stderr || apply.test?.stderr || 'Не удалось применить конфигурацию Xray');

      if (state.setupLanDnsMode !== 'keep') {
        const readiness = await waitForLanDnsReadiness();
        if (state.setupLanDnsMode === 'xray' && !readiness?.readiness?.ready) {
          pushStep(false, 'LAN DNS / dnsmasq', 'DNS inbound Xray еще не слушает 127.0.0.1:10535. Повторите после перезапуска Xray.');
          throw new Error('DNS inbound Xray еще не готов');
        }
        const lanDns = await request('/api/dns/lan-upstream', {
          method: 'POST',
          body: JSON.stringify({
            mode: state.setupLanDnsMode,
            upstream: state.setupLanDnsUpstream,
            restart: state.setupRestartDnsmasq
          })
        });
        syncLanDnsStatus(lanDns);
        let lanDnsOk = Boolean(lanDns.ok);
        if (!lanDnsOk) {
          await delay(1000);
          const afterLanDns = await request('/api/dns/lan-upstream').catch(() => null);
          if (afterLanDns) syncLanDnsStatus(afterLanDns);
          lanDnsOk = Boolean(afterLanDns?.mode === state.setupLanDnsMode && (state.setupLanDnsMode !== 'xray' || afterLanDns?.readiness?.ready));
        }
        pushStep(lanDnsOk, 'LAN DNS / dnsmasq', lanDns.mode ? lanDnsModeLabel(lanDns.mode) : (lanDns.error || ''));
        if (!lanDnsOk) throw new Error(lanDns.error || 'Не удалось настроить LAN DNS');
      } else {
        pushStep(true, 'LAN DNS / dnsmasq', 'Оставлен текущий режим OpenWrt.');
      }

      const firewall = await applyFirewallWithRetry(3);
      state.firewallStatus = firewall.status || state.firewallStatus || firewall;
      const firewallOk = Boolean(firewall.ok && firewallReadyStatus(state.firewallStatus));
      pushStep(firewallOk, 'nftables и policy routing', state.firewallStatus?.routerMode || firewall.status?.routerMode || state.firewallRouterMode);
      if (!firewallOk) throw new Error(firewall.error || 'Не удалось включить перехват');

      state.message = 'Активный режим RuOpenRay включен';
      await refresh({ renderAfter: false });
      state.setupResult = { ok: true, steps };
    } catch (error) {
      state.setupResult = { ok: false, steps, error: error.message };
      state.message = error.message;
    } finally {
      state.setupApplying = false;
      render();
    }
  }

  async function rollbackSetupWizard() {
    const snapshot = loadSetupSnapshot();
    if (!snapshot?.config) {
      state.setupRollbackResult = { ok: false, steps: [{ ok: false, title: 'Нет снимка', detail: 'Мастер еще не сохранял состояние до применения.' }] };
      render();
      return;
    }
    state.setupRollbacking = true;
    state.setupRollbackResult = { ok: true, steps: [] };
    render();
    const steps = [];
    const pushStep = (ok, title, detail = '') => {
      steps.push({ ok, title, detail });
      state.setupRollbackResult = { ok: steps.every((step) => step.ok), steps };
      render();
    };
    try {
      const configTest = await request('/api/config/test', { method: 'POST', body: JSON.stringify({ config: snapshot.config }) });
      pushStep(Boolean(configTest.ok), 'Проверка прежней конфигурации Xray', configTest.stdout || configTest.stderr || '');
      if (!configTest.ok) throw new Error(configTest.stderr || 'Прежняя конфигурация Xray не прошла проверку');

      const configApply = await request('/api/config/apply', { method: 'POST', body: JSON.stringify({ config: snapshot.config }) });
      pushStep(Boolean(configApply.ok), 'Возврат конфигурации Xray', configApply.restart?.stdout || configApply.test?.stdout || '');
      if (!configApply.ok) throw new Error(configApply.restart?.stderr || configApply.test?.stderr || 'Не удалось вернуть конфигурацию Xray');

      if (snapshot.lanDns) {
        const lan = await request('/api/dns/lan-upstream', { method: 'POST', body: JSON.stringify(lanDnsRestorePayload(snapshot.lanDns)) });
        syncLanDnsStatus(lan);
        pushStep(Boolean(lan.ok), 'Возврат LAN DNS', lan.mode ? lanDnsModeLabel(lan.mode) : (lan.error || ''));
        if (!lan.ok) throw new Error(lan.error || 'Не удалось вернуть LAN DNS');
      } else {
        pushStep(true, 'Возврат LAN DNS', 'Снимок DNS отсутствовал, шаг пропущен.');
      }

      const firewall = await request('/api/firewall/restore', { method: 'POST', body: JSON.stringify({ snapshot: snapshot.firewall || {} }) });
      state.firewallStatus = firewall.status || firewall;
      pushStep(Boolean(firewall.ok), 'Возврат nftables', state.firewallStatus?.routerMode || '');
      if (!firewall.ok) throw new Error(firewall.error || 'Не удалось вернуть nftables');

      clearSetupSnapshot();
      state.message = 'Откат мастера выполнен';
      await refresh({ renderAfter: false });
      state.setupRollbackResult = { ok: true, steps };
    } catch (error) {
      state.setupRollbackResult = { ok: false, steps, error: error.message };
      state.message = error.message;
    } finally {
      state.setupRollbacking = false;
      render();
    }
  }


  return {
    openInstallWizard,
    openSetupWizard,
    setupPrepareDraft,
    waitForLanDnsReadiness,
    runSetupWizard,
    rollbackSetupWizard
  };
}
