const busyLabels = {
  start: 'Запускаю Xray',
  stop: 'Останавливаю Xray',
  restart: 'Перезапускаю Xray',
  refresh: 'Обновляю состояние',
  test: 'Проверяю конфигурацию',
  apply: 'Применяю изменения',
  applyFirewall: 'Применяю правила перехвата',
  disableFirewall: 'Отключаю правила перехвата',
  refreshFirewallStatus: 'Проверяю firewall',
  downloadFirewallRules: 'Готовлю правила firewall',
  enableXrayStats: 'Включаю статистику Xray',
  disableXrayStats: 'Выключаю статистику Xray',
  resetXrayStats: 'Сбрасываю счетчики Xray',
  changePanelPassword: 'Меняю пароль панели',
  saveLoggingSettings: 'Сохраняю логирование',
  clearLoggingFiles: 'Очищаю логи',
  saveServiceSettings: 'Сохраняю параметры сервиса',
  checkAppUpdate: 'Проверяю обновления панели',
  updateApp: 'Обновляю RuOpenRay UI',
  updateCore: 'Устанавливаю выбранную версию Xray',
  installCorePackage: 'Устанавливаю Xray',
  updateGeo: 'Обновляю geo-файлы',
  uploadGeoFile: 'Загружаю dat-файл',
  checkGeoAudit: 'Проверяю geo-списки',
  saveGeoSchedule: 'Сохраняю расписание geo',
  cleanupGeoBackups: 'Очищаю резервные копии geo',
  cleanupExtraGeoDat: 'Удаляю лишние geo-файлы',
  refreshStorageReport: 'Обновляю отчёт по памяти',
  cleanupStorageBackups: 'Очищаю резервные копии',
  cleanupPackageCache: 'Очищаю кэш пакетов',
  cleanupUnusedDat: 'Удаляю неиспользуемые DAT',
  refreshLogs: 'Обновляю логи',
  runConnectivityDiagnostics: 'Проверяю цепочку подключения',
  runDpiDiagnostics: 'Проверяю сайт на DPI',
  refreshDomainMonitor: 'Обновляю монитор доменов',
  startDomainMonitor: 'Запускаю монитор доменов',
  stopDomainMonitor: 'Останавливаю монитор доменов',
  clearDomainMonitor: 'Очищаю монитор доменов',
  enableDnsmasqLogqueries: 'Включаю dnsmasq parser',
  disableDnsmasqLogqueries: 'Выключаю dnsmasq parser',
  previewImport: 'Распознаю ссылку сервера',
  importToCurrent: 'Добавляю сервер',
  importActive: 'Добавляю и выбираю сервер',
  previewSubscription: 'Проверяю подписку',
  importSubscriptionToCurrent: 'Добавляю подписку',
  importSubscriptionActive: 'Добавляю и выбираю подписку',
  importSubscription: 'Импортирую подписку',
  applyRoutePresets: 'Добавляю подборки правил',
  previewRouteDsl: 'Проверяю список правил',
  appendRouteDsl: 'Добавляю список правил',
  appendRouteDslFromDialog: 'Добавляю список правил',
  replaceRouteDsl: 'Заменяю правила',
  addRoute: 'Добавляю правило',
  testRouteRuleTarget: 'Проверяю правило',
  saveRouteEdit: 'Сохраняю правило',
  applyRouteTargetReplacement: 'Заменяю серверы в правилах',
  saveRouteBalancer: 'Сохраняю балансировщик',
  previewRoutePresetEdit: 'Проверяю подборку',
  saveRoutePresetEdit: 'Сохраняю подборку',
  applyRoutePresetEdit: 'Добавляю подборку в правила',
  runSetupWizard: 'Включаю активный режим',
  rollbackSetupWizard: 'Откатываю изменения мастера',
  refreshInstallPlan: 'Проверяю установку',
  setupPrepareDraft: 'Готовлю черновик',
  enableTcpFastOpenSystem: 'Включаю TCP Fast Open',
  disableTcpFastOpenSystem: 'Выключаю TCP Fast Open',
  prepareTransparent: 'Готовлю входящий поток перехвата',
  prepareDnsInbound: 'Готовлю DNS-вход Xray',
  saveLocalProxyDraft: 'Обновляю локальные прокси',
  startClientTrafficTest: 'Начинаю замер трафика',
  finishClientTrafficTest: 'Проверяю трафик клиента',
  previewLanDnsUpstream: 'Проверяю LAN DNS',
  applyLanDnsUpstream: 'Применяю LAN DNS',
  checkDns: 'Проверяю DNS',
  checkDnsDiagnostics: 'Проверяю DNS роутера',
  applyDnsBootstrapHosts: 'Добавляю DNS-записи для серверов',
  checkServers: 'Проверяю прокси-серверы',
  saveServerCheckHistorySettings: 'Сохраняю историю проверок',
  saveServerEdit: 'Сохраняю прокси',
  checkObservatoryTargets: 'Проверяю автопроверку серверов',
  enableObservatoryForProxy: 'Включаю наблюдение за серверами',
  fallbackSubscription: 'Ищу доступный сервер подписки',
  checkSubscriptionCandidate: 'Проверяю сервер подписки',
  refreshSubscription: 'Обновляю подписку',
  deleteSubscription: 'Удаляю подписку',
  scanSni: 'Ищу SNI',
  saveProfile: 'Сохраняю профиль',
  saveProfileEditor: 'Сохраняю профиль',
  backup: 'Создаю резервную копию',
  restoreLatestBackup: 'Возвращаю последнюю резервную копию'
};

const passiveActionPattern = /^(open|close|toggle|copy|download|clearSetupSnapshot|selectAll|clearRoutePresets|filterRoutes|appVersionClick|logout|setupStepBack|setupStepNext)$/i;
const activeActionPattern = /^(add|apply|append|backup|change|check|cleanup|disable|enable|finish|import|install|preview|refresh|replace|reset|restore|rollback|run|save|scan|setup|start|stop|test|update)/i;

function buttonText(button) {
  return (button.textContent || '').replace(/\s+/g, ' ').trim();
}

function busyLabelFor(button, action) {
  return button.dataset.busyLabel || busyLabels[action] || buttonText(button);
}

function shouldShowBusy(button, action) {
  if (!action || button.dataset.busy === '0' || button.classList.contains('modal-backdrop')) return false;
  if (busyLabels[action]) return true;
  if (passiveActionPattern.test(action)) return false;
  return activeActionPattern.test(action);
}

function beginBusy(state, render, button, action) {
  if (!shouldShowBusy(button, action)) return false;
  if (state.busyAction) return null;
  state.busyAction = action;
  state.busyLabel = busyLabelFor(button, action) || 'Выполняю действие';
  render();
  return true;
}

function endBusy(state, render, action, started) {
  if (!started || state.busyAction !== action) return;
  state.busyAction = '';
  state.busyLabel = '';
  render();
}

function userFacingError(error, label) {
  const message = String(error?.message || error || 'Неизвестная ошибка');
  if (/^exit status \d+$/i.test(message)) {
    return `${label || 'Операция'} не выполнена: системная команда вернула ${message}. Подробности обычно есть в логах Xray, procd или firewall.`;
  }
  return message;
}

export function bindActionControls({ state, render, handlers }) {
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      const action = button.dataset.action;
      let busyStarted = false;
      try {
        if (button.classList.contains('modal-backdrop')) {
          const startedInModal = button.dataset.pointerStartedInModal === '1';
          button.dataset.pointerStartedInModal = '0';
          if (startedInModal || event.target !== button) return;
        }
        const handler = handlers[action];
        if (!handler) return;
        busyStarted = beginBusy(state, render, button, action);
        if (busyStarted === null) return;
        await handler(button, event);
      } catch (error) {
        state.configTesting = false;
        state.configApplying = false;
        state.serverChecking = false;
        state.serverCheckingTags = [];
        state.message = userFacingError(error, state.busyLabel);
        render();
      } finally {
        endBusy(state, render, action, busyStarted);
      }
    });
  });
}
