import { noticeView } from './notice-view.js';

export function createSettingsView({ state, byteSize, escapeHtml }) {
function settingsPanel() {
  const logLevels = [
    ['none', 'Нет'],
    ['error', 'Ошибки'],
    ['warning', 'Предупреждения'],
    ['info', 'Инфо'],
    ['debug', 'Отладка']
  ];
  const accessSize = byteSize(state.loggingSettings?.accessSize || 0);
  const errorSize = byteSize(state.loggingSettings?.errorSize || 0);
  const maintenanceEvery = state.loggingSettings?.maintenanceEvery || (state.loggingLevel === 'debug' ? '1 мин' : state.loggingLevel === 'info' ? '5 мин' : '15 мин');
  const storageReport = state.storageReport || {};
  const storageItems = storageReport.items || {};
  const storageDisk = storageReport.disk || state.status?.system?.disk || {};
  const storageItem = (key) => storageItems[key] || {};
  const storageSize = (key) => Number(storageItem(key).size || 0);
  const storageCount = (key) => Number(storageItem(key).count || 0);
  const storagePercent = (value) => Number.parseFloat(String(value || '').replace('%', '')) || 0;
  const storageFree = Number(storageDisk.free || 0);
  const storageUsedPercent = storagePercent(storageDisk.usedPercent);
  const storagePressure = storageUsedPercent >= 90 || (storageFree > 0 && storageFree < 8 * 1024 * 1024);
  const unusedDat = Array.isArray(storageReport.unusedDat) ? storageReport.unusedDat : [];
  const storageRows = [
    ['backups', 'Резервные копии RuOpenRay', storageItem('backups').path || '', 'Копии конфигураций, бинарников и geo-файлов.'],
    ['geoBase', 'Стандартные DAT', storageItem('geoBase').path || '', 'geoip.dat и geosite.dat, которые обычно нужны Xray.'],
    ['geoExtra', 'Дополнительные DAT', storageItem('geoExtra').path || '', 'Отдельные файлы для ext:"file.dat:list". Неиспользуемые можно удалить.'],
    ['logs', 'Логи', storageItem('logs').path || '', 'Access/error/DNS-логи и ротационные копии.'],
    ['packageCache', 'Кэш пакетов', storageItem('packageCache').path || '', 'apk/opkg индексы и кэш после установки пакетов.'],
    ['appBinary', 'Бинарник панели', storageItem('appBinary').path || '', 'Исполняемый файл RuOpenRay UI.']
  ];
  const cleanup = state.storageLastCleanup || null;
  const cleanupRemovedBytes = Number(cleanup?.removedBytes ?? cleanup?.freed ?? 0);
  const cleanupFreeDelta = Number(cleanup?.freeDelta ?? cleanup?.freed ?? 0);
  const cleanupFreeKnown = cleanup?.freeKnown === true;
  const cleanupFreeBefore = Number(cleanup?.freeBefore || 0);
  const cleanupFreeAfter = Number(cleanup?.freeAfter || 0);
  const cleanupDeltaText = cleanupFreeDelta < 0
    ? `-${byteSize(Math.abs(cleanupFreeDelta))}`
    : `+${byteSize(cleanupFreeDelta)}`;
  const settingsTabs = [
    ['logging', 'Логирование'],
    ['security', 'Панель'],
    ['interface', 'Интерфейс'],
    ['service', 'Сервис'],
    ['local-proxy', 'Локальные прокси'],
    ['storage', 'Память'],
    ['updates', 'Обновление']
  ];
  const settingsView = settingsTabs.some(([value]) => value === state.settingsView) ? state.settingsView : 'logging';
  const loggingApplyHint = state.loggingRestart
    ? 'Сохранение проверит конфигурацию Xray и перезапустит сервис, новые параметры начнут работать сразу.'
    : 'Сохранение изменит конфигурацию Xray и настройки ротации. Работающий Xray применит новые пути, уровень и DNS-лог после следующего перезапуска.';
  const loggingSections = `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Логирование Xray</h2><span>Access, error и DNS-логи пишутся самим Xray. Для постоянной работы лучше держать уровень warning или error.</span></div>
      </div>
      <div class="settings-log-layout">
        <div class="settings-field wide">
          <label>Уровень логирования</label>
          <div class="segmented settings-log-levels" aria-label="Уровень логирования">
            ${logLevels.map(([value, label]) => `<button type="button" class="${state.loggingLevel === value ? 'active' : ''}" data-logging-level="${value}">${label}</button>`).join('')}
          </div>
          <small>Debug быстро раздувает файлы и может влиять на слабые роутеры.</small>
        </div>

        <label class="settings-check ${state.loggingAccessLog ? 'active' : ''}">
          <input id="loggingAccessLog" type="checkbox" ${state.loggingAccessLog ? 'checked' : ''} />
          <span><strong>Логи доступа</strong><em>Соединения, источник, назначение, входящий поток и исходящее направление.</em></span>
          <b>${accessSize}</b>
        </label>
        <label class="settings-check ${state.loggingErrorLog ? 'active' : ''}">
          <input id="loggingErrorLog" type="checkbox" ${state.loggingErrorLog ? 'checked' : ''} />
          <span><strong>Логи ошибок</strong><em>Ошибки и предупреждения Xray для диагностики запуска и правил.</em></span>
          <b>${errorSize}</b>
        </label>
        <label class="settings-check ${state.loggingDnsLog ? 'active' : ''}">
          <input id="loggingDnsLog" type="checkbox" ${state.loggingDnsLog ? 'checked' : ''} />
          <span><strong>DNS-логи Xray</strong><em>Подробные ответы встроенного DNS. При уровне info часть DNS-событий всё равно может попадать в error-log; для тихого режима выберите warning или error.</em></span>
          <b>dnsLog</b>
        </label>

        <div class="settings-field">
          <label>Файл access</label>
          <input id="loggingAccessPath" value="${escapeHtml(state.loggingAccessPath)}" ${state.loggingAccessLog ? '' : 'disabled'} />
        </div>
        <div class="settings-field">
          <label>Файл error</label>
          <input id="loggingErrorPath" value="${escapeHtml(state.loggingErrorPath)}" ${state.loggingErrorLog ? '' : 'disabled'} />
        </div>
      </div>
    </section>

    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Обслуживание логов</h2><span>Сейчас проверка размера каждые ${escapeHtml(maintenanceEvery)}: debug — 1 мин, info — 5 мин, остальные уровни — 15 мин.</span></div>
      </div>
      <div class="settings-maintenance">
        <div class="settings-field">
          <label>Максимальный размер файла, MB</label>
          <input id="loggingMaxSizeMb" type="number" min="1" max="200" value="${escapeHtml(state.loggingMaxSizeMb)}" />
        </div>
        <div class="settings-field">
          <label>Хранить копий после ротации</label>
          <input id="loggingRotateCopies" type="number" min="0" max="5" value="${escapeHtml(state.loggingRotateCopies)}" />
        </div>
        <label class="settings-check compact ${state.loggingClearOnRestart ? 'active' : ''}">
          <input id="loggingClearOnRestart" type="checkbox" ${state.loggingClearOnRestart ? 'checked' : ''} />
          <span><strong>Очищать при перезапуске Xray</strong><em>Удобно для временной диагностики.</em></span>
        </label>
        <label class="settings-check compact ${state.loggingRestart ? 'active' : ''}">
          <input id="loggingRestart" type="checkbox" ${state.loggingRestart ? 'checked' : ''} />
          <span><strong>Применить сразу через перезапуск Xray</strong><em>Без перезапуска изменения сохраняются в конфигурации и ждут следующего старта Xray.</em></span>
        </label>
      </div>
      <p class="settings-hint">${escapeHtml(loggingApplyHint)}</p>
      <div class="settings-warning">
        <strong>Flash-память</strong>
        <span>Access-логи при активном трафике создают много записей. Для постоянного мониторинга лучше использовать временный каталог или внешний накопитель.</span>
      </div>
      <div class="toolbar">
        <button class="btn warning ${state.loggingSaving ? 'is-busy' : ''}" data-action="saveLoggingSettings" ${state.loggingSaving ? 'disabled' : ''}>${state.loggingSaving ? 'Сохраняю...' : 'Сохранить логирование'}</button>
        <button class="btn secondary ${state.loggingSaving ? 'is-busy' : ''}" data-action="clearLoggingFiles" ${state.loggingSaving ? 'disabled' : ''}>${state.loggingSaving ? 'Очищаю...' : 'Очистить логи'}</button>
      </div>
    </section>
  `;
  const localProxyDefaults = {
    socks: { tag: 'socks-in', label: 'SOCKS5', port: 10808, protocol: 'socks' },
    http: { tag: 'http-in', label: 'HTTP', port: 10809, protocol: 'http' }
  };
  const localProxyInfo = (kind) => {
    const defaults = localProxyDefaults[kind];
    const inbounds = Array.isArray(state.config?.inbounds) ? state.config.inbounds : [];
    const inbound = inbounds.find((item) => item?.tag === defaults.tag)
      || inbounds.find((item) => item?.protocol === defaults.protocol && String(item?.listen || '') === '127.0.0.1');
    const accounts = Array.isArray(inbound?.settings?.accounts) ? inbound.settings.accounts : [];
    const account = accounts[0] || {};
    const auth = inbound?.settings?.auth === 'password' || Boolean(account.user || account.pass);
    return {
      ...defaults,
      enabled: Boolean(inbound),
      listen: inbound?.listen || '127.0.0.1',
      port: Number(inbound?.port || defaults.port),
      auth,
      user: account.user || '',
      pass: account.pass || '',
      udp: inbound?.settings?.udp !== false
    };
  };
  const proxyCard = (kind) => {
    const info = localProxyInfo(kind);
    const name = kind === 'socks' ? 'Socks' : 'Http';
    const lanExposed = info.enabled && info.listen !== '127.0.0.1' && info.listen !== '::1';
    const authMissing = lanExposed && !info.auth;
    return `
      <article class="local-proxy-card ${info.enabled ? 'active' : ''} ${authMissing ? 'warn' : ''}">
        <div class="local-proxy-card-head">
          <label class="settings-check compact ${info.enabled ? 'active' : ''}">
            <input id="localProxy${name}Enabled" type="checkbox" ${info.enabled ? 'checked' : ''} />
            <span><strong>${escapeHtml(info.label)}</strong><em>${info.enabled ? `${escapeHtml(info.listen)}:${escapeHtml(String(info.port))}` : 'не включен'}</em></span>
          </label>
          <span class="local-proxy-status ${info.enabled ? 'ok' : ''}">${info.enabled ? 'в черновике' : 'выключен'}</span>
        </div>
        <div class="local-proxy-form">
          <div class="settings-field">
            <label>Слушать адрес</label>
            <input id="localProxy${name}Listen" list="localProxyListenPresets" value="${escapeHtml(info.listen)}" placeholder="127.0.0.1" />
            <small>127.0.0.1 — только роутер, 0.0.0.0 или LAN-IP — доступно из сети.</small>
          </div>
          <div class="settings-field">
            <label>Порт</label>
            <input id="localProxy${name}Port" type="number" min="1" max="65535" value="${escapeHtml(String(info.port))}" />
          </div>
          <label class="settings-check compact ${info.auth ? 'active' : ''}">
            <input id="localProxy${name}Auth" type="checkbox" ${info.auth ? 'checked' : ''} />
            <span><strong>Логин и пароль</strong><em>Обязательно включайте, если прокси слушает LAN.</em></span>
          </label>
          <div class="settings-field">
            <label>Пользователь</label>
            <input id="localProxy${name}User" value="${escapeHtml(info.user)}" autocomplete="off" />
          </div>
          <div class="settings-field">
            <label>Пароль</label>
            <input id="localProxy${name}Pass" type="password" value="${escapeHtml(info.pass)}" autocomplete="new-password" />
          </div>
        </div>
        ${authMissing ? `<div class="settings-warning compact danger"><strong>Открыто в LAN без пароля</strong><span>Такой прокси сможет использовать любое устройство в сети. Лучше включить логин и пароль или оставить 127.0.0.1.</span></div>` : ''}
      </article>
    `;
  };
  const localProxySection = `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Локальные прокси Xray</h2><span>SOCKS5 и HTTP-входы для ручной настройки приложений. Они используют те же правила маршрутизации Xray, что и остальная конфигурация.</span></div>
      </div>
      <datalist id="localProxyListenPresets">
        <option value="127.0.0.1">только на роутере</option>
        <option value="0.0.0.0">все интерфейсы</option>
        <option value="192.168.1.1">LAN-адрес роутера</option>
      </datalist>
      <div class="local-proxy-grid">
        ${proxyCard('socks')}
        ${proxyCard('http')}
      </div>
      <div class="settings-warning">
        <strong>Как у v2rayA</strong>
        <span>Xray сам не поднимает SOCKS5 автоматически: нужен входящий поток в конфигурации. В стандартном профиле RuOpenRay уже есть SOCKS5 на 127.0.0.1:10808; здесь можно включить HTTP, поменять адрес или открыть прокси для LAN.</span>
      </div>
      <div class="toolbar">
        <button class="btn warning ${state.busyAction === 'saveLocalProxyDraft' ? 'is-busy' : ''}" data-action="saveLocalProxyDraft" ${state.busyAction === 'saveLocalProxyDraft' ? 'disabled' : ''}>${state.busyAction === 'saveLocalProxyDraft' ? 'Обновляю...' : 'Обновить черновик Xray'}</button>
        <button class="btn secondary ${state.configTesting ? 'is-busy' : ''}" data-action="test" ${state.configTesting || state.configApplying ? 'disabled' : ''}>${state.configTesting ? 'Проверяю...' : 'Проверить черновик'}</button>
      </div>
    </section>
  `;
  const securitySection = `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Пароль панели</h2><span>После смены активные сессии будут сброшены, нужно будет войти заново.</span></div>
      </div>
      <div class="settings-form">
        <div class="form-row">
          <label>Текущий пароль</label>
          <input id="settingsCurrentPassword" type="password" value="${escapeHtml(state.settingsCurrentPassword)}" autocomplete="current-password" />
        </div>
        <div class="form-row">
          <label>Новый пароль</label>
          <input id="settingsNewPassword" type="password" value="${escapeHtml(state.settingsNewPassword)}" autocomplete="new-password" placeholder="минимум 8 символов" />
        </div>
        <div class="form-row">
          <label>Повторите пароль</label>
          <input id="settingsConfirmPassword" type="password" value="${escapeHtml(state.settingsConfirmPassword)}" autocomplete="new-password" />
        </div>
      </div>
      <div class="toolbar">
        <button class="btn warning" data-action="changePanelPassword" ${state.settingsPasswordSaving ? 'disabled' : ''}>${state.settingsPasswordSaving ? 'Сохраняю...' : 'Сменить пароль'}</button>
      </div>
    </section>
  `;
  const interfaceSection = `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Тема интерфейса</h2><span>Выбор сохраняется в браузере и применяется сразу ко всей панели.</span></div>
      </div>
      <div class="settings-theme-grid" role="radiogroup" aria-label="Тема интерфейса">
        <button type="button" class="settings-theme-card ${state.uiTheme !== 'light' ? 'active' : ''}" data-ui-theme="dark" aria-pressed="${state.uiTheme !== 'light' ? 'true' : 'false'}">
          <span class="theme-preview dark" aria-hidden="true"><i></i><b></b><em></em></span>
          <strong>Темная</strong>
          <small>Текущий ночной вид RuOpenRay.</small>
        </button>
        <button type="button" class="settings-theme-card ${state.uiTheme === 'light' ? 'active' : ''}" data-ui-theme="light" aria-pressed="${state.uiTheme === 'light' ? 'true' : 'false'}">
          <span class="theme-preview light" aria-hidden="true"><i></i><b></b><em></em></span>
          <strong>Светлая</strong>
          <small>Более читаемая днем и на ярких экранах.</small>
        </button>
      </div>
    </section>
  `;
  const appInfo = state.status?.app || {};
  const appRelease = state.appRelease || {};
  const appHasUpdate = Boolean(appRelease.update && appRelease.assetUrl);
  const appVersion = appInfo.version || 'dev';
  const appTarget = appRelease.tag || 'не загружен';
  const appAsset = appRelease.asset || appInfo.asset || '';
  const appUpdateSection = `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Обновление RuOpenRay UI</h2><span>Панель может обновить собственный бинарник из релизов GitHub с учетом архитектуры роутера.</span></div>
      </div>
      <div class="settings-info-grid">
        <article><span>Установлено</span><strong>${escapeHtml(appVersion)}</strong></article>
        <article><span>Последний релиз</span><strong>${escapeHtml(appTarget)}</strong></article>
        <article><span>Архитектура</span><strong>${escapeHtml(appAsset || 'не определена')}</strong></article>
        <article><span>Размер</span><strong>${escapeHtml(appRelease.assetSize ? byteSize(appRelease.assetSize) : 'неизвестно')}</strong></article>
      </div>
      <div class="settings-maintenance">
        <label class="settings-check compact ${state.appBackup ? 'active' : ''}">
          <input id="appBackup" type="checkbox" ${state.appBackup ? 'checked' : ''} />
          <span><strong>Сохранить резервную копию бинарника</strong><em>Выключайте на роутерах с малым NAND, если свободного места мало.</em></span>
        </label>
      </div>
      <div class="toolbar">
        <button class="btn secondary ${state.appReleaseChecking ? 'is-busy' : ''}" data-action="checkAppUpdate" ${state.appReleaseChecking || state.appUpdating ? 'disabled' : ''}>${state.appReleaseChecking ? 'Проверяю...' : 'Проверить обновления'}</button>
        <button class="btn warning" data-action="updateApp" data-busy-inline="0" ${state.appUpdating || !appHasUpdate ? 'disabled' : ''}>${appHasUpdate ? 'Обновить панель' : 'Актуальная версия'}</button>
      </div>
      ${state.appUpdate ? `<div class="core-result">
        <strong>${state.appUpdate.ok ? 'Готово' : 'Ошибка'}</strong>
        <span>${escapeHtml(state.appUpdate.stdout || state.appUpdate.stderr || '')}</span>
      </div>` : ''}
    </section>
  `;
  const serviceSection = `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Сервис и пути</h2><span>Ключевые параметры окружения. Их меняет установщик или UCI, здесь показываем то, с чем сейчас работает панель.</span></div>
      </div>
      <div class="settings-info-grid">
        <article><span>Сервис Xray</span><strong>${escapeHtml(state.status?.service?.running ? 'работает' : 'остановлен')}</strong></article>
        <article><span>Активная конфигурация</span><strong>${escapeHtml(state.status?.config?.path || 'не определена')}</strong></article>
        <article><span>Версия ядра</span><strong>${escapeHtml(state.status?.core?.version || 'не найдена')}</strong></article>
        <article><span>Правил маршрутизации</span><strong>${escapeHtml(state.status?.config?.routingRules ?? 0)}</strong></article>
      </div>
      <div class="settings-maintenance">
        <div class="settings-field">
          <label>Задержка старта панели, сек</label>
          <input id="serviceStartupDelaySec" type="number" min="0" max="180" value="${escapeHtml(state.serviceStartupDelaySec)}" />
          <small>Полезно после загрузки роутера, когда сеть и storage просыпаются не сразу.</small>
        </div>
        <div class="settings-field">
          <label>Пауза перед перезапуском Xray, сек</label>
          <input id="serviceApplyDelaySec" type="number" min="0" max="60" value="${escapeHtml(state.serviceApplyDelaySec)}" />
          <small>Дает firewall/WAN/DNS успеть прийти в порядок перед start/restart.</small>
        </div>
        <div class="settings-field">
          <label>Лимит памяти панели</label>
          <input id="serviceGoMemLimit" value="${escapeHtml(state.serviceGoMemLimit)}" placeholder="48MiB" />
          <small>Передается в Go как GOMEMLIMIT после перезапуска RuOpenRay UI. Для 256 MB RAM обычно достаточно 32-48MiB.</small>
        </div>
        <div class="settings-field">
          <label>Агрессивность GC</label>
          <input id="serviceGoGC" type="number" min="20" max="200" value="${escapeHtml(state.serviceGoGC)}" />
          <small>GOGC: ниже значение — меньше RAM, но чуть больше CPU. Дефолт RuOpenRay: 60.</small>
        </div>
        <div class="settings-field">
          <label>Загрузка ядра и geo-файлов</label>
          <select id="serviceDownloadMirror">
            <option value="direct" ${state.serviceDownloadMirror !== 'custom' ? 'selected' : ''}>Напрямую</option>
            <option value="custom" ${state.serviceDownloadMirror === 'custom' ? 'selected' : ''}>Через зеркало</option>
          </select>
          <small>Для роутеров, у которых GitHub скачивается нестабильно.</small>
        </div>
        <div class="settings-field">
          <label>Префикс зеркала</label>
          <input id="serviceMirrorPrefix" value="${escapeHtml(state.serviceMirrorPrefix)}" ${state.serviceDownloadMirror === 'custom' ? '' : 'disabled'} placeholder="https://gh-proxy.example/?url={url}" />
          <small>Можно использовать {url}; без него RuOpenRay просто добавит исходную ссылку после префикса.</small>
        </div>
      </div>
      <div class="toolbar">
        <button class="btn warning ${state.serviceSettingsSaving ? 'is-busy' : ''}" data-action="saveServiceSettings" ${state.serviceSettingsSaving ? 'disabled' : ''}>${state.serviceSettingsSaving ? 'Сохраняю...' : 'Сохранить сервис'}</button>
      </div>
    </section>
  `;
  const storageSection = `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Память роутера</h2><span>Сводка по overlay и быстрые безопасные действия для маленького NAND.</span></div>
        <button class="btn secondary ${state.storageCleaning === 'refresh' ? 'is-busy' : ''}" data-action="refreshStorageReport" ${state.storageCleaning ? 'disabled' : ''}>${state.storageCleaning === 'refresh' ? 'Обновляю...' : 'Обновить'}</button>
      </div>
      <div class="settings-info-grid">
        <article><span>Свободно</span><strong>${escapeHtml(storageFree ? byteSize(storageFree) : 'неизвестно')}</strong><small>${escapeHtml(storageDisk.path || storageDisk.label || 'overlay')}</small></article>
        <article><span>Занято</span><strong>${escapeHtml(storageUsedPercent ? `${storageUsedPercent}%` : 'неизвестно')}</strong><small>${escapeHtml(storageDisk.total ? `из ${byteSize(storageDisk.total)}` : '')}</small></article>
        <article><span>Резервные копии</span><strong>${escapeHtml(byteSize(storageSize('backups')))}</strong><small>${escapeHtml(`${storageCount('backups')} файлов`)}</small></article>
        <article><span>DAT-файлы</span><strong>${escapeHtml(byteSize(storageSize('geoBase') + storageSize('geoExtra')))}</strong><small>${escapeHtml(`${storageCount('geoBase') + storageCount('geoExtra')} файлов`)}</small></article>
      </div>
      ${storagePressure ? `<div class="settings-warning danger">
        <strong>Мало свободного места</strong>
        <span>Сначала очистите резервные копии и кэш пакетов. Стандартные geoip.dat/geosite.dat удаляйте только если понимаете, какие правила их используют.</span>
      </div>` : ''}
      <div class="settings-maintenance storage-maintenance-list">
        ${storageRows.map(([key, label, path, hint]) => `
          <article class="settings-storage-row">
            <div>
              <strong>${escapeHtml(label)}</strong>
              <span>${escapeHtml(hint)}</span>
              ${path ? `<small>${escapeHtml(path)}</small>` : ''}
            </div>
            <b>${escapeHtml(byteSize(storageSize(key)))}</b>
          </article>
        `).join('')}
      </div>
      <div class="settings-warning">
        <strong>Неиспользуемые DAT</strong>
        <span>${unusedDat.length
          ? escapeHtml(`${unusedDat.length} дополнительных файлов не найдены в активных ext-правилах: ${unusedDat.slice(0, 4).map((item) => item.name).join(', ')}${unusedDat.length > 4 ? '...' : ''}`)
          : 'Дополнительных DAT без ссылок в текущей конфигурации не найдено.'}</span>
      </div>
      <div class="toolbar">
        <button class="btn warning ${state.storageCleaning === 'backups' ? 'is-busy' : ''}" data-action="cleanupStorageBackups" ${state.storageCleaning ? 'disabled' : ''}>${state.storageCleaning === 'backups' ? 'Очищаю...' : 'Очистить резервные копии'}</button>
        <button class="btn secondary ${state.storageCleaning === 'package-cache' ? 'is-busy' : ''}" data-action="cleanupPackageCache" ${state.storageCleaning ? 'disabled' : ''}>${state.storageCleaning === 'package-cache' ? 'Очищаю...' : 'Очистить кэш пакетов'}</button>
        <button class="btn secondary ${state.storageCleaning === 'unused-dat' ? 'is-busy' : ''}" data-action="cleanupUnusedDat" ${state.storageCleaning || !unusedDat.length ? 'disabled' : ''}>${state.storageCleaning === 'unused-dat' ? 'Удаляю...' : 'Удалить неиспользуемые DAT'}</button>
      </div>
      ${state.storageLastCleanup ? `<div class="core-result">
        <strong>${state.storageLastCleanup.ok ? 'Готово' : 'Есть ошибки'}</strong>
        <span>Удалено файлов: ${escapeHtml(state.storageLastCleanup.deleted ?? 0)} · размер удаленного: ${escapeHtml(byteSize(cleanupRemovedBytes))}</span>
        <span>${cleanupFreeKnown
          ? `Свободное место: было ${escapeHtml(byteSize(cleanupFreeBefore))} → стало ${escapeHtml(byteSize(cleanupFreeAfter))} (${escapeHtml(cleanupDeltaText)})`
          : 'Реальную дельту свободного места не удалось получить через df.'}</span>
        <small>На overlay размер удаленных файлов может отличаться от фактического прироста свободного места.</small>
      </div>` : ''}
    </section>
  `;
  const visibleSection = settingsView === 'security'
    ? securitySection
    : settingsView === 'interface'
      ? interfaceSection
    : settingsView === 'updates'
      ? appUpdateSection
    : settingsView === 'storage'
      ? storageSection
    : settingsView === 'service'
      ? serviceSection
    : settingsView === 'local-proxy'
      ? localProxySection
      : loggingSections;
  return `
    <section class="settings-hero">
      <div>
        <h2>Параметры RuOpenRay</h2>
        <p>Параметры панели и Xray, которые влияют на работу сервиса на роутере.</p>
      </div>
      <div class="settings-hero-status">
        <strong>${escapeHtml(state.status?.core?.available ? 'Xray доступен' : 'Xray не найден')}</strong>
        <span>${escapeHtml(state.status?.core?.version || '')}</span>
      </div>
    </section>

    <div class="settings-subnav" role="tablist" aria-label="Подменю настроек">
      ${settingsTabs.map(([value, label]) => `<button type="button" class="${settingsView === value ? 'active' : ''}" data-settings-view="${value}">${label}</button>`).join('')}
    </div>

    ${visibleSection}

    <section class="settings-message">
      ${noticeView(state, escapeHtml, { style: 'margin-top: 14px' })}
    </section>
  `;
}


  return { settingsPanel };
}
