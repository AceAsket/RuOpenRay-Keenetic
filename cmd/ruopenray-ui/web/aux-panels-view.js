import { noticeView } from './notice-view.js';

export function createAuxPanelsView({
  state,
  labels,
  escapeHtml,
  stat,
  deviceRules,
  deviceStats,
  outboundOptions,
  leaseSearchText,
  formatDuration,
  leaseByIp,
}) {
function devicesPanel() {
  const devices = deviceRules();
  const stats = deviceStats();
  const options = outboundOptions();
  return `
    <section class="route-hero devices-hero">
      <div>
        <h2>Устройства LAN</h2>
        <p>Назначайте режимы по IP: телевизор напрямую, приставку через прокси, отдельный клиент в блокировку. RuOpenRay делает это обычными Xray source-правилами.</p>
      </div>
      <div class="route-score">
        <strong>${devices.length}</strong>
        <span>устройств с правилами</span>
      </div>
    </section>

    <section class="stats route-stats">
      ${stat('Через прокси', stats.proxy, 'Устройства идут через сервер')}
      ${stat('Напрямую', stats.direct, 'Обход прокси')}
      ${stat('Блокировка', stats.block, 'Доступ остановлен')}
      ${stat('Другое', stats.other, 'Особые направления')}
    </section>

    <div class="route-layout devices-layout">
      <section class="panel">
        <div class="panel-title">
          <div><h2>Добавить устройство</h2><span>${state.leases.length ? `${state.leases.length} DHCP leases · ${state.leasesSource || '/tmp/dhcp.leases'}` : 'Выберите клиента из DHCP leases или введите IP вручную.'}</span></div>
          <button class="btn secondary" data-action="refreshDhcpLeases">Обновить DHCP</button>
        </div>
        <input class="lease-search" data-lease-search value="${escapeHtml(state.leaseSearch)}" placeholder="Найти устройство: имя, IP или MAC" />
        <div class="lease-grid">
          ${state.leases.map((lease) => `<button class="lease-card" data-lease-search-item data-lease-search-text="${escapeHtml(leaseSearchText(lease))}" data-lease-ip="${escapeHtml(lease.ip)}" data-lease-name="${escapeHtml(lease.name || lease.mac)}">
            <strong>${escapeHtml(lease.name || 'Без имени')}</strong>
            <span>${escapeHtml([lease.ip, lease.mac, lease.remaining ? `осталось ${formatDuration(lease.remaining)}` : ''].filter(Boolean).join(' · '))}</span>
          </button>`).join('') || '<p class="muted">DHCP leases пока не найдены. На OpenWrt обычно читается /tmp/dhcp.leases.</p>'}
          <p class="muted lease-search-empty" data-lease-search-empty hidden>По этому запросу устройств нет.</p>
        </div>
        <div class="device-form">
          <div class="form-row">
            <label>Название</label>
            <input id="deviceName" value="${escapeHtml(state.deviceName)}" placeholder="Телевизор, консоль, ноутбук" />
          </div>
          <div class="form-row">
            <label>IP устройства</label>
            <input id="deviceIp" value="${escapeHtml(state.deviceIp)}" placeholder="192.168.50.42" />
          </div>
          <div class="form-row">
            <label>Режим</label>
            <select id="deviceMode">
              ${options.map((tag) => `<option value="${escapeHtml(tag)}" ${state.deviceMode === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('')}
            </select>
          </div>
          <button class="btn" data-action="addDevice">Добавить правило</button>
        </div>
        <div class="device-modes">
          <button class="mode-card" data-device-mode="proxy"><strong>Через прокси</strong><span>YouTube, Discord, ChatGPT и заблокированные сайты.</span></button>
          <button class="mode-card" data-device-mode="direct"><strong>Напрямую</strong><span>Банки, локальные сервисы, умный дом и IPTV.</span></button>
          <button class="mode-card" data-device-mode="block"><strong>Блокировка</strong><span>Отключить доступ для отдельного клиента.</span></button>
        </div>
        ${noticeView(state, escapeHtml, { style: 'margin-top: 14px' })}
      </section>

      <section class="panel">
        <div class="panel-title">
          <div><h2>Найденные правила устройств</h2><span>Это source-правила из текущей маршрутизации.</span></div>
          <div class="split-actions">
            <button class="btn secondary ${state.configTesting ? 'is-busy' : ''}" data-action="test" ${state.configTesting || state.configApplying ? 'disabled' : ''}>${state.configTesting ? 'Проверяю...' : 'Проверить черновик'}</button>
          </div>
        </div>
        <div class="device-list">
          ${devices
            .map(({ rule, index }) => {
              const sources = rule.source.join(', ');
              const lease = leaseByIp(rule.source[0]);
              return `<article class="device-row">
                <div class="device-ip">${escapeHtml(sources)}</div>
                <div class="device-main">
                  <strong>${escapeHtml(lease?.name || rule.outboundTag || 'не задано')}</strong>
                  <span>${escapeHtml(lease ? `${rule.outboundTag} · ${lease.mac}` : ((rule.inboundTag || []).join(', ') || 'все входящие'))}</span>
                </div>
                <select data-device-outbound="${index}">
                  ${options.map((tag) => `<option value="${escapeHtml(tag)}" ${rule.outboundTag === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('')}
                </select>
                <button class="btn secondary" data-device-delete="${index}">Удалить</button>
              </article>`;
            })
            .join('') || '<p class="muted">Пока нет правил для отдельных LAN-устройств.</p>'}
        </div>
      </section>
    </div>
  `;
}

function profilesPanel(compact = false) {
  const rows = compact ? state.profiles.slice(0, 5) : state.profiles;
  return `
    <section class="panel profile-panel">
      <div class="panel-title">
        <div><h2>Профили</h2><span>Каждый профиль хранится отдельным JSON-файлом.</span></div>
        <div class="split-actions">
          <button class="btn secondary" data-action="backup">Сохранить резервную копию</button>
          <button class="btn danger" data-action="restoreLatestBackup">Вернуть последнюю копию</button>
        </div>
      </div>
      <div class="table-scroll profile-table-scroll">
        <table class="table profile-table">
          <thead><tr><th>Имя</th><th>Обновлен</th><th>Размер</th><th>Статус</th><th>Действия</th></tr></thead>
          <tbody>
            ${rows.map((p) => `<tr>
              <td>${escapeHtml(p.name)}</td>
              <td>${new Date(p.updatedAt).toLocaleString()}</td>
              <td>${Math.round(p.size / 10) / 100} KB</td>
              <td>${p.active ? `<span class="tag">${labels.active}</span>` : `<span class="muted">${labels.stored}</span>`}</td>
              <td>
                <div class="profile-row-actions">
                  <button class="btn secondary" data-profile="${escapeHtml(p.name)}" ${p.active ? 'disabled' : ''}>Активировать</button>
                  <button class="btn secondary" data-profile-edit="${escapeHtml(p.name)}">Править</button>
                  <button class="btn secondary" data-profile-download="${escapeHtml(p.name)}">Скачать</button>
                  <button class="btn secondary" data-profile-download-anonymized="${escapeHtml(p.name)}">Обезличенный</button>
                  <button class="btn danger" data-profile-delete="${escapeHtml(p.name)}">Удалить</button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>
    ${compact ? '' : profileEditorDialog()}
  `;
}

function profileEditorDialog() {
  if (!state.profileEditorOpen) return '';
  return `
    <div class="modal-backdrop" data-action="closeProfileEdit">
      <section class="modal profile-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="profileEditTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="profileEditTitle">Редактирование профиля</h2>
            <span>Профиль сохраняется как JSON. Перед сохранением RuOpenRay проверит, что JSON читается.</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeProfileEdit">×</button>
        </div>
        <div class="form-row">
          <label>Имя профиля</label>
          <input id="profileEditName" value="${escapeHtml(state.profileEditName || '')}" placeholder="default" />
        </div>
        <div class="form-row profile-editor-row">
          <label>JSON профиля</label>
          <textarea id="profileEditDraft" class="code-textarea profile-json-editor" spellcheck="false">${escapeHtml(state.profileEditDraft || '')}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn secondary" type="button" data-action="closeProfileEdit">Отмена</button>
          <button class="btn warning" type="button" data-action="saveProfileEditor">Сохранить профиль</button>
        </div>
      </section>
    </div>
  `;
}

function logsPanel(compact = false) {
  if (compact) {
    return `
      <section class="panel log-panel compact dashboard-log-card">
        <div class="panel-title dashboard-log-title">
          <div><h2>Логи</h2><span>Журнал Xray и RuOpenRay</span></div>
          <div class="split-actions">
            <button class="btn secondary" data-action="refreshLogs">Обновить</button>
            <button class="btn secondary ${state.loggingSaving ? 'is-busy' : ''}" data-action="clearLoggingFiles" ${state.loggingSaving ? 'disabled' : ''}>${state.loggingSaving ? 'Очищаю...' : 'Очистить'}</button>
          </div>
        </div>
        <details class="dashboard-log-details" ${state.dashboardLogsOpen ? 'open' : ''}>
          <summary>Последние строки</summary>
          <pre class="console log-console">${escapeHtml(state.logs)}</pre>
        </details>
      </section>
    `;
  }
  return `
    <section class="panel log-panel">
      <div class="panel-title">
        <div><h2>Live-Xray</h2><span>Живой журнал Xray: system, access и error-логи с фильтрами.</span></div>
        <div class="split-actions">
          <label class="toggle-row log-toggle">
            <input id="logLive" type="checkbox" ${state.logLive ? 'checked' : ''} />
            <span>Live</span>
          </label>
          <button class="btn secondary" data-action="refreshLogs">Обновить</button>
          <button class="btn secondary ${state.loggingSaving ? 'is-busy' : ''}" data-action="clearLoggingFiles" ${state.loggingSaving ? 'disabled' : ''}>${state.loggingSaving ? 'Очищаю...' : 'Очистить логи'}</button>
        </div>
      </div>
      ${state.logLive ? `<div class="settings-warning compact"><strong>Live-лог</strong><span>Панель перечитывает логи каждые ${escapeHtml(state.logIntervalSec)} сек. Это не пишет новые файлы, но для постоянной вкладки лучше выключить Live после диагностики.</span></div>` : ''}
      <div class="log-filters">
        <div class="form-row">
          <label>Источник</label>
          <select id="logKind">
            ${[
              ['all', 'Все'],
              ['error', 'Error'],
              ['access', 'Access'],
              ['system', 'System']
            ].map(([value, label]) => `<option value="${value}" ${state.logKind === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label>Уровень</label>
          <select id="logLevel">
            ${['all', 'error', 'warning', 'info', 'debug'].map((value) => `<option value="${value}" ${state.logLevel === value ? 'selected' : ''}>${value}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label>Время</label>
          <select id="logSort">
            ${[
              ['asc', 'Старые → новые'],
              ['desc', 'Новые → старые']
            ].map(([value, label]) => `<option value="${value}" ${state.logSort === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label>Строк</label>
          <input id="logLines" type="number" min="20" max="2000" step="20" value="${escapeHtml(state.logLines)}" />
        </div>
        <div class="form-row">
          <label>Live, сек</label>
          <input id="logIntervalSec" type="number" min="1" max="60" step="1" value="${escapeHtml(state.logIntervalSec)}" />
        </div>
        <div class="form-row">
          <label>Поиск</label>
          <input id="logQuery" value="${escapeHtml(state.logQuery)}" placeholder="domain, error, outbound..." />
        </div>
      </div>
      <label class="toggle-row log-follow">
        <input id="logFollow" type="checkbox" ${state.logFollow ? 'checked' : ''} ${state.logSort === 'desc' ? 'disabled' : ''} />
        <span>Держать окно внизу при новых строках</span>
      </label>
      <pre class="console log-console">${escapeHtml(state.logs)}</pre>
    </section>
  `;
}

function accessLogRows(text = '') {
  return String(text || '')
    .split('\n')
    .map((line) => {
      const lower = line.toLowerCase();
      const protocol = lower.includes(' udp:') || lower.includes('udp:') ? 'UDP' : 'TCP';
      const endpoints = [...line.matchAll(/\b(?:tcp|udp):([^/\s,[\]()]+)(?::(\d+))?/gi)];
      const target = endpoints.length ? `${endpoints[endpoints.length - 1][1]}${endpoints[endpoints.length - 1][2] ? `:${endpoints[endpoints.length - 1][2]}` : ''}` : '';
      const sourceMatch = line.match(/\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?\b/);
      const sourceIp = (sourceMatch?.[0] || '').replace(/:\d+$/, '');
      const lease = sourceIp ? leaseByIp(sourceIp) : null;
      const source = lease ? `${lease.name || lease.mac || 'LAN'} · ${sourceIp}` : sourceIp;
      const outbound = line.match(/\[([A-Za-z0-9_.:-]+)\](?:\s|$)/)?.[1] || '';
      const time = line.match(/\d{2}:\d{2}:\d{2}/)?.[0] || line.slice(0, 19);
      if (!target && !source && !outbound) return null;
      return { time, source, target, outbound, protocol };
    })
    .filter(Boolean);
}

function accessLogTable(rows = []) {
  if (!rows.length) return '';
  return `<div class="access-log-table">
    <div class="access-log-summary">
      <strong>Access view</strong>
      <span>${rows.length} строк разобрано из текущего окна логов</span>
    </div>
    <div class="access-log-head">
      <span>Время</span>
      <span>Устройство</span>
      <span>Домен / IP</span>
      <span>Направление</span>
      <span>Протокол</span>
    </div>
    ${rows.map((row) => `<article>
      <span>${escapeHtml(row.time)}</span>
      <strong>${escapeHtml(row.source || 'источник ?')}</strong>
      <code>${escapeHtml(row.target || 'цель ?')}</code>
      <em>${escapeHtml(row.outbound || 'направление ?')}</em>
      <b>${escapeHtml(row.protocol || 'tcp')}</b>
    </article>`).join('')}
  </div>`;
}


  return {
    devicesPanel,
    profilesPanel,
    logsPanel,
    accessLogRows,
    accessLogTable,
  };
}
