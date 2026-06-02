import { clearAuthToken, saveAuthToken } from './storage.js';

export function createSettingsActions({
  state,
  request,
  render,
  refresh,
  refreshLogs,
  configureLogTimer,
  configureStatusTimer,
  syncLoggingSettings,
  syncServiceSettings
}) {
  function formatStorageBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes)) return '0 B';
    const sign = bytes < 0 ? '-' : '';
    const abs = Math.abs(bytes);
    if (abs >= 1024 * 1024) return `${sign}${Math.round(abs / 1024 / 102.4) / 10} MB`;
    if (abs >= 1024) return `${sign}${Math.round(abs / 102.4) / 10} KB`;
    return `${sign}${abs} B`;
  }

  function promptBrowserPasswordSave(password) {
    const Credential = globalThis.PasswordCredential;
    const credentials = globalThis.navigator?.credentials;
    if (!password || !Credential || !credentials?.store) return;
    try {
      credentials.store(new Credential({
        id: 'ruopenray',
        name: 'RuOpenRay UI',
        password
      })).catch(() => {});
    } catch {
      // Browser password managers can still detect the form fields above.
    }
  }

  async function login(event) {
    event.preventDefault();
    const passwordInput = document.querySelector('#password');
    const rememberInput = document.querySelector('#rememberPassword');
    state.password = passwordInput?.value || state.password;
    state.rememberPassword = Boolean(rememberInput?.checked);
    try {
      const result = await request('/api/login', {
        method: 'POST',
        body: JSON.stringify({ password: state.password, remember: state.rememberPassword })
      });
      state.token = result.token;
      saveAuthToken(result.token, state.rememberPassword);
      promptBrowserPasswordSave(state.password);
      state.message = '';
      configureLogTimer();
      configureStatusTimer();
      render();
      refresh({ background: true }).catch((error) => {
        state.message = error.message;
        render();
      });
    } catch (error) {
      state.message = error.message;
      render();
    }
  }

  function logout() {
    state.token = '';
    state.rememberPassword = false;
    clearAuthToken();
    state.message = '';
    state.tab = 'dashboard';
    render();
  }

  async function changePanelPassword() {
    if (!state.settingsNewPassword || state.settingsNewPassword.length < 8) {
      state.message = 'Новый пароль должен быть не короче 8 символов';
      render();
      return;
    }
    if (state.settingsNewPassword !== state.settingsConfirmPassword) {
      state.message = 'Пароли не совпадают';
      render();
      return;
    }
    state.settingsPasswordSaving = true;
    state.message = 'Сохраняю пароль панели...';
    render();
    try {
      const result = await request('/api/settings/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: state.settingsCurrentPassword,
          newPassword: state.settingsNewPassword,
          confirmPassword: state.settingsConfirmPassword
        })
      });
      if (!result.ok) {
        state.message = result.stderr || 'Не удалось изменить пароль';
      } else {
        state.token = '';
        state.rememberPassword = false;
        clearAuthToken();
        state.password = '';
        state.settingsCurrentPassword = '';
        state.settingsNewPassword = '';
        state.settingsConfirmPassword = '';
        state.message = 'Пароль изменён. Войдите заново.';
      }
    } finally {
      state.settingsPasswordSaving = false;
    }
    render();
  }

  async function saveLoggingSettings() {
    state.loggingSaving = true;
    state.message = state.loggingRestart
      ? 'Проверяю config.json и перезапускаю Xray для применения логирования...'
      : 'Сохраняю логирование в config.json без перезапуска Xray...';
    render();
    try {
      const result = await request('/api/settings/logging', {
        method: 'POST',
        body: JSON.stringify({
          level: state.loggingLevel,
          accessLog: state.loggingAccessLog,
          accessPath: state.loggingAccessPath,
          errorLog: state.loggingErrorLog,
          errorPath: state.loggingErrorPath,
          dnsLog: state.loggingDnsLog,
          maxSizeMb: Number(state.loggingMaxSizeMb) || 2,
          rotateCopies: Number(state.loggingRotateCopies) || 0,
          clearOnRestart: state.loggingClearOnRestart,
          restart: state.loggingRestart
        })
      });
      syncLoggingSettings(result.settings);
      state.message = result.stdout || result.restart?.stdout || (
        state.loggingRestart
          ? 'Логирование сохранено и применено через перезапуск Xray'
          : 'Логирование сохранено в config.json и применится после перезапуска Xray'
      );
      await refreshLogs(true, true).catch(() => {});
    } finally {
      state.loggingSaving = false;
    }
    render();
  }

  async function clearLoggingFiles() {
    state.loggingSaving = true;
    state.message = 'Очищаю файлы логов...';
    render();
    try {
      const result = await request('/api/settings/logging/clear', { method: 'POST', body: '{}' });
      syncLoggingSettings(result.settings);
      state.logs = '';
      state.message = result.stdout || 'Логи очищены';
    } finally {
      state.loggingSaving = false;
    }
    render();
  }

  async function refreshDhcpLeases() {
    const result = await request('/api/dhcp/leases');
    state.leases = result.leases || [];
    state.leasesSource = result.source || '';
    state.message = state.leases.length
      ? `DHCP leases обновлены: ${state.leases.length}`
      : 'DHCP leases пока не найдены';
    render();
  }

  async function saveServiceSettings() {
    state.serviceSettingsSaving = true;
    state.message = 'Сохраняю настройки сервиса...';
    render();
    try {
      const result = await request('/api/settings/service', {
        method: 'POST',
        body: JSON.stringify({
          startupDelaySec: Number(state.serviceStartupDelaySec) || 0,
          applyDelaySec: Number(state.serviceApplyDelaySec) || 0,
          goMemLimit: state.serviceGoMemLimit,
          goGC: Number(state.serviceGoGC) || 60,
          downloadMirror: state.serviceDownloadMirror,
          mirrorPrefix: state.serviceMirrorPrefix
        })
      });
      syncServiceSettings(result.settings);
      state.message = result.stdout || 'Настройки сервиса сохранены';
    } finally {
      state.serviceSettingsSaving = false;
    }
    render();
  }

  async function refreshStorageReport() {
    state.storageCleaning = 'refresh';
    try {
      state.storageReport = await request('/api/storage/report');
      state.message = 'Отчёт по памяти обновлён';
    } finally {
      state.storageCleaning = '';
    }
    render();
  }

  async function cleanupStorage(target, successMessage) {
    state.storageCleaning = target;
    state.message = 'Очищаю память роутера...';
    render();
    try {
      const result = await request('/api/storage/cleanup', {
        method: 'POST',
        body: JSON.stringify({ target })
      });
      state.storageReport = result.report || state.storageReport;
      state.storageLastCleanup = result;
      const removedBytes = Number(result.removedBytes ?? result.freed ?? 0);
      const freeDelta = Number(result.freeDelta ?? result.freed ?? 0);
      state.message = result.ok
        ? `${successMessage}: удалено файлов на ${formatStorageBytes(removedBytes)}, overlay ${freeDelta >= 0 ? '+' : ''}${formatStorageBytes(freeDelta)}`
        : (Array.isArray(result.errors) && result.errors.length ? result.errors.join('\n') : 'Очистка завершилась с ошибкой');
    } finally {
      state.storageCleaning = '';
    }
    render();
  }

  function cleanupStorageBackups() {
    return cleanupStorage('backups', 'Бэкапы очищены');
  }

  function cleanupPackageCache() {
    return cleanupStorage('package-cache', 'Кэш пакетов очищен');
  }

  function cleanupUnusedDat() {
    return cleanupStorage('unused-dat', 'Неиспользуемые DAT удалены');
  }

  async function setSystemTcpFastOpen(enabled) {
    state.tcpFastOpenSaving = true;
    state.message = enabled ? 'Включаю TCP Fast Open в системе...' : 'Выключаю TCP Fast Open в системе...';
    render();
    try {
      const result = await request('/api/network/tcp-fast-open', {
        method: 'POST',
        body: JSON.stringify({ enabled })
      });
      state.tcpFastOpen = result.status || result;
      state.message = result.stdout || (enabled ? 'TCP Fast Open включен в системе' : 'TCP Fast Open выключен в системе');
    } finally {
      state.tcpFastOpenSaving = false;
    }
    render();
  }

  async function service(action) {
    const result = await request('/api/service', { method: 'POST', body: JSON.stringify({ action }) });
    const actionLabels = { start: 'запущен', stop: 'остановлен', restart: 'перезапущен' };
    state.message = result.stdout || result.stderr || `Сервис ${actionLabels[action] || action}`;
    await refresh();
  }

  return {
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
  };
}
