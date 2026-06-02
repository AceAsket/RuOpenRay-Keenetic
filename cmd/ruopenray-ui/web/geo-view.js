export function createGeoView({ state, escapeHtml, stat }) {
function fileSize(size) {
  const n = Number(size || 0);
  if (!n) return 'нет файла';
  return n > 1024 * 1024 ? `${Math.round((n / 1024 / 1024) * 10) / 10} MB` : `${Math.round(n / 1024)} KB`;
}

function metricSize(size, fallback = 'не рассчитано') {
  const n = Number(size || 0);
  if (!n) return fallback;
  return n > 1024 * 1024 ? `${Math.round((n / 1024 / 1024) * 10) / 10} MB` : `${Math.round(n / 1024)} KB`;
}

function geoSelectedPresetIds() {
  const ids = [state.geoBasePreset, ...state.geoExtraPresets].filter(Boolean);
  return [...new Set(ids)];
}

function geoSelectedPresets() {
  const presets = state.geoStatus?.presets || [];
  const builtin = geoSelectedPresetIds().map((id) => presets.find((preset) => preset.id === id)).filter(Boolean);
  const custom = state.geoCustomSources
    .filter((source) => state.geoCustomSourceIds.includes(source.id))
    .map((source) => ({
      ...source,
      installable: source.enabled !== false,
      mode: source.kind === 'extra' ? 'extra-geosite' : source.kind === 'separate' ? 'separate' : 'replace',
      estimatedBytes: source.kind === 'extra' ? 512 * 1024 : 24 * 1024 * 1024
    }));
  return [...builtin, ...custom];
}

function geoRequiredSpace(selectedPresets, geo, withBackup = true) {
  const installable = selectedPresets.filter((preset) => preset?.installable);
  if (!installable.length) return 0;
  let required = 1024 * 1024;
  installable.forEach((preset) => {
    required += Number(preset.estimatedBytes || 0);
    if (!withBackup) return;
    if (preset.mode === 'extra-geosite') {
      required += Number((geo.extras || []).find((item) => item.id === preset.id)?.file?.size || 0);
    } else if (preset.mode === 'separate') {
      const clean = String(preset.target || '').replace(/\.dat$/i, '');
      const files = geo.files || [];
      required += Number(files.find((item) => item.name === `${clean}-geoip.dat`)?.size || 0);
      required += Number(files.find((item) => item.name === `${clean}-geosite.dat`)?.size || 0);
    } else if (preset.mode === 'geoip-only') {
      required += Number(geo.geoip?.size || 0);
    } else {
      required += Number(geo.geoip?.size || 0) + Number(geo.geosite?.size || 0);
    }
  });
  return required;
}

function geoDiskWarning(selectedPresets, geo) {
  const disk = geo.disk || {};
  if (!disk.ok || !selectedPresets.some((preset) => preset?.installable)) return '';
  const required = geoRequiredSpace(selectedPresets, geo, state.geoBackup);
  const free = Number(disk.free || 0);
  const low = free < required;
  const tight = free < required + 8 * 1024 * 1024;
  if (!low && !tight) return '';
  const backupText = state.geoBackup ? 'с учетом бэкапа' : 'без бэкапа';
  const actionText = low
    ? 'Перед обновлением освободите место, отключите бэкап или удалите лишние dat-файлы.'
    : 'Обновление помещается, но лучше оставить небольшой запас для временных файлов.';
  return `
    <div class="geo-disk-warning ${low ? 'danger' : ''}">
      <strong>${low ? 'Недостаточно свободного места' : 'Свободное место ограничено'}</strong>
      <span>Доступно ${fileSize(free)}, для выбранного обновления нужно около ${fileSize(required)} ${backupText}. ${actionText} Каталог: ${escapeHtml(geo.dir || '')}</span>
    </div>
  `;
}

function selectedGeoPreset() {
  return (state.geoStatus?.presets || []).find((preset) => preset.id === state.geoBasePreset);
}

function geoActionLabel(preset) {
  if (state.geoUpdating) return 'Обновляю...';
  if (!preset || state.geoBasePreset === 'custom') return 'Обновить geo';
  if (!preset.installable) return 'Справочный источник';
  if (preset.mode === 'extra-geosite') return 'Поставить dat-файл';
  if (preset.mode === 'geoip-only') return 'Обновить geoip.dat';
  return 'Обновить geo';
}

function geoNandCard(geo, selectedPresets) {
  const storage = geo.storage || {};
  const disk = geo.disk || {};
  const requiredNoBackup = geoRequiredSpace(selectedPresets, geo, false);
  const requiredBackup = geoRequiredSpace(selectedPresets, geo, true);
  const extraCount = (geo.files || []).filter((file) => file.role === 'extra').length;
  const installedFiles = geo.files || [];
  return `
    <section class="panel nand-card">
      <div class="panel-title">
        <div>
          <h2>Экономный режим для роутера</h2>
          <span>Для устройств с небольшим flash/NAND: без бэкапов по умолчанию, компактные geo и удаление лишних dat-файлов.</span>
        </div>
        <button class="btn secondary" data-action="cleanupExtraGeoDat" ${extraCount ? '' : 'disabled'}>Удалить дополнительные dat</button>
      </div>
      <div class="nand-plan-grid">
        <article><span>Свободно</span><strong>${escapeHtml(metricSize(disk.free, 'неизвестно'))}</strong><small>${escapeHtml(geo.dir || '')}</small></article>
        <article><span>Geo сейчас</span><strong>${escapeHtml(metricSize(storage.currentDatBytes, 'не установлено'))}</strong><small>geoip.dat + geosite.dat</small></article>
        <article><span>Бэкапы</span><strong>${escapeHtml(metricSize(storage.backupBytes, 'нет'))}</strong><small>можно очистить отдельно</small></article>
        <article><span>Компактный набор</span><strong>${escapeHtml(metricSize(storage.compactEstimate))}</strong><small>Nidelon / РФ блокировки</small></article>
        <article><span>С бэкапом</span><strong>${escapeHtml(metricSize(requiredBackup))}</strong><small>оценка выбранного обновления</small></article>
        <article><span>Без бэкапа</span><strong>${escapeHtml(metricSize(requiredNoBackup))}</strong><small>рекомендуется для малого NAND</small></article>
      </div>
      <details class="geo-nand-files" open>
        <summary>
          <span>Установленные dat-файлы</span>
          <small>${installedFiles.length ? `${installedFiles.length} в каталоге geo` : 'файлов пока нет'}</small>
        </summary>
        <div class="geo-file-list">
          ${installedFiles.map((file) => geoInstalledFileCard(file)).join('') || '<p class="muted">dat-файлов пока нет. Установите базовый источник или дополнительный ext DAT.</p>'}
        </div>
      </details>
      ${geoUploadPanel()}
    </section>
  `;
}

function geoUploadPanel() {
  const target = state.geoUploadTarget || 'geosite';
  const file = state.geoUploadFile || null;
  const custom = target === 'custom';
  const targetName = target === 'geoip' ? 'geoip.dat' : target === 'geosite' ? 'geosite.dat' : (state.geoUploadName || file?.name || 'my-list.dat');
  return `
    <div class="geo-upload-panel">
      <div>
        <strong>Загрузить DAT из браузера</strong>
        <span>Файл будет сохранен в geo-каталог как ${escapeHtml(targetName)}. Для своих ext-правил выберите отдельное имя.</span>
      </div>
      <div class="geo-upload-grid">
        <div class="form-row">
          <label>Файл .dat</label>
          <input id="geoUploadFile" type="file" accept=".dat,application/octet-stream" />
          ${file ? `<small>${escapeHtml(file.name)} · ${fileSize(file.size || 0)}</small>` : ''}
        </div>
        <div class="form-row">
          <label>Куда сохранить</label>
          <select id="geoUploadTarget">
            <option value="geosite" ${target === 'geosite' ? 'selected' : ''}>заменить geosite.dat</option>
            <option value="geoip" ${target === 'geoip' ? 'selected' : ''}>заменить geoip.dat</option>
            <option value="custom" ${target === 'custom' ? 'selected' : ''}>отдельный DAT рядом</option>
          </select>
        </div>
        ${custom ? `<div class="form-row">
          <label>Имя файла</label>
          <input id="geoUploadName" value="${escapeHtml(state.geoUploadName)}" placeholder="my-source.dat" />
        </div>` : ''}
        <label class="toggle-row">
          <input id="geoUploadBackup" type="checkbox" ${state.geoUploadBackup ? 'checked' : ''} />
          <span>сделать бэкап</span>
        </label>
        <label class="toggle-row">
          <input id="geoUploadRestart" type="checkbox" ${state.geoUploadRestart ? 'checked' : ''} />
          <span>перезапустить Xray</span>
        </label>
        <button class="btn warning ${state.geoUpdating ? 'is-busy' : ''}" data-action="uploadGeoFile" ${state.geoUpdating ? 'disabled' : ''}>${state.geoUpdating ? 'Загружаю...' : 'Загрузить DAT'}</button>
      </div>
    </div>
  `;
}

function geoPurposeLabel(preset) {
  const purpose = String(preset?.purpose || preset?.compat || '').trim();
  const labels = {
    'база': 'универсальный набор',
    'база через CDN': 'универсальный набор через CDN',
    'РФ bypass': 'российские блокировки',
    'РФ блоки': 'российские блокировки',
    'CN rules': 'Китай и CDN',
    'Iran rules': 'Иран',
    'расширенный GeoIP': 'расширенный GeoIP',
    'официальный fallback': 'официальный набор',
    'официальный резерв': 'официальный набор'
  };
  return labels[purpose] || purpose;
}

function geoCoverageLabel(code) {
  const labels = {
    private: 'локальные IP',
    cn: 'Китай',
    ru: 'Россия',
    'ru-blocked': 'РФ блокировки',
    'ru-ip': 'РФ IP',
    antifilter: 'antifilter',
    'antifilter-community': 'antifilter-community',
    compact: 'компактный',
    geoip: 'GeoIP',
    ext: 'ext DAT',
    gfw: 'GFW',
    telegram: 'Telegram',
    youtube: 'YouTube',
    google: 'Google',
    discord: 'Discord',
    cdn: 'CDN',
    media: 'медиа',
    ai: 'AI',
    ir: 'Иран',
    ads: 'ads',
    malware: 'malware',
    phishing: 'phishing',
    custom: 'свой',
    geosite: 'GeoSite'
  };
  return labels[code] || code;
}

function geoCoverageClass(code) {
  if (['ru', 'ru-blocked', 'ru-ip', 'antifilter', 'antifilter-community'].includes(code)) return 'ru';
  if (['private', 'geoip', 'geosite', 'ext', 'compact'].includes(code)) return 'system';
  if (['discord', 'telegram', 'youtube', 'google', 'ai', 'cdn', 'media'].includes(code)) return 'service';
  return 'other';
}

function geoCoverageBadges(source, fallback = []) {
  const covers = Array.isArray(source?.covers) ? source.covers : fallback;
  const items = [...new Set(covers.filter(Boolean))].slice(0, 8);
  if (!items.length) return '';
  return `<span class="geo-coverage-badges">${items.map((code) => `<em class="geo-coverage-badge ${geoCoverageClass(code)}">${escapeHtml(geoCoverageLabel(code))}</em>`).join('')}</span>`;
}

function geoAuditPanel(geo) {
  const audit = geo.audit || {};
  const items = Array.isArray(audit.items) ? audit.items : [];
  const summary = audit.summary || {};
  const missing = Number(summary.missing || 0);
  const total = Number(summary.total || items.length || 0);
  const ready = Math.max(0, total - missing);
  const filesReady = (geo.geoip?.exists ? 1 : 0) + (geo.geosite?.exists ? 1 : 0);
  const title = missing
    ? `Нужно проверить ${missing} geo-ссылок`
    : total
      ? 'Geo-ссылки выглядят готовыми'
      : 'Geo-ссылки не используются';
  const description = total
    ? 'RuOpenRay проверяет текущий черновик и показывает, какие dat-файлы нужны правилам.'
    : 'В активных правилах пока нет geoip, geosite или ext-ссылок.';
  const checkedAt = audit.checkedAt ? new Date(audit.checkedAt).toLocaleString() : '';
  return `
    <section class="panel geo-audit-panel">
      <div class="panel-title">
        <div>
            <h2>Geo-ссылки в текущих правилах</h2>
            <span>${description} Проверка черновика Xray запускает этот doctor автоматически.</span>
        </div>
        <div class="split-actions">
          <span class="geo-audit-summary ${missing ? 'danger' : 'ok'}">${escapeHtml(title)}</span>
          <button class="btn secondary ${state.busyAction === 'checkGeoAudit' ? 'is-busy' : ''}" data-action="checkGeoAudit" ${state.busyAction === 'checkGeoAudit' ? 'disabled' : ''}>${state.busyAction === 'checkGeoAudit' ? 'Проверяю...' : 'Проверить черновик'}</button>
        </div>
      </div>
      ${audit.error ? `<p class="settings-warning compact"><strong>Не удалось прочитать конфигурацию</strong><span>${escapeHtml(audit.error)}</span></p>` : ''}
      <div class="geo-doctor-grid">
        <article>
          <span>Ссылок в правилах</span>
          <strong>${total}</strong>
          <small>${ready} готовы · ${missing} требуют внимания</small>
        </article>
        <article>
          <span>Основные файлы</span>
          <strong>${filesReady}/2</strong>
          <small>geoip.dat и geosite.dat</small>
        </article>
        <article class="${missing ? 'danger' : 'ok'}">
            <span>Категории</span>
            <strong>${missing ? 'проверить категории' : total ? 'готово' : 'не используется'}</strong>
            <small>${missing ? 'поставьте источник с нужной категорией или измените правило' : total ? 'файлы и категории согласованы с текущими правилами' : 'добавьте geo-правила, если они нужны маршрутизации'}</small>
        </article>
      </div>
      ${checkedAt ? `<p class="muted geo-audit-checked">Последняя глубокая проверка: ${escapeHtml(checkedAt)}</p>` : ''}
      ${items.length ? `<div class="geo-audit-list">
          ${items.map((item) => {
            const sources = Array.isArray(item.sources) ? item.sources.join(', ') : '';
            const statusInfo = geoAuditStatusInfo(item);
            const danger = statusInfo.level === 'danger';
            const kind = item.kind === 'geoip' ? 'GeoIP' : item.kind === 'geosite' ? 'GeoSite' : 'Ext DAT';
            const test = item.test || {};
            const technical = [test.stdout, test.stderr, test.message].filter(Boolean).join('\n').trim();
            const advice = geoAuditAdvice(item);
            return `<article class="${escapeHtml(statusInfo.level)}">
              <span class="geo-audit-kind">${escapeHtml(kind)}</span>
              <div>
                <strong>${escapeHtml(item.code || '')}</strong>
                <small>${escapeHtml(statusInfo.detail || item.message || '')}</small>
                ${advice ? `<small class="geo-audit-advice">${escapeHtml(advice)}</small>` : ''}
                <code>${escapeHtml(item.file || '')}${sources ? ` · ${escapeHtml(sources)}` : ''}</code>
                ${technical ? `<details class="geo-audit-tech"><summary>Технический вывод Xray</summary><pre>${escapeHtml(technical).slice(0, 1600)}</pre></details>` : ''}
              </div>
              <em>${escapeHtml(statusInfo.label)}</em>
            </article>`;
          }).join('')}
      </div>` : '<p class="muted">Нет правил, которые требуют geo-файлы.</p>'}
    </section>
  `;
}

  function geoAuditAdvice(item) {
  const kind = String(item?.kind || '').toLowerCase();
  const code = String(item?.code || '').toLowerCase();
  const file = String(item?.file || '').toLowerCase();
  if (!item || item.severity !== 'danger') return '';
  if (kind === 'geoip' && code === 'private') {
    return 'Поставьте geoip.dat с категорией PRIVATE или замените правило на явные локальные подсети: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16.';
  }
  if (kind === 'geoip' && (code.includes('antifilter') || code.includes('ru'))) {
    return 'Нужен GeoIP-источник с российскими блокировками, например b4geoip или совместимый antifilter-community набор.';
  }
  if (kind === 'geosite' && ['ru', 'category-ru', 'runet'].includes(code)) {
    return 'Для российских direct-правил поставьте geosite.dat с RU-категориями: RUNET Freedom, Nidelon или совместимый набор.';
  }
  if (kind === 'geosite' && (code.includes('antifilter') || code.includes('blocked'))) {
    return 'Для правил блокировок лучше поставить RUNET Freedom или Nidelon, затем снова запустить проверку geo.';
  }
  if (kind === 'ext' || file.includes('loyalsoldiersite') || code.includes('antifilter-community')) {
    return 'Это внешний DAT-файл для ext-правила. Добавьте его в разделе Geo как дополнительный DAT и обновите.';
  }
    return 'Поставьте geodata-источник, который содержит эту категорию, или уберите правило из маршрутизации.';
  }

  function geoAuditStatusInfo(item) {
    const status = String(item?.status || '').toLowerCase();
    const kind = String(item?.kind || '').toLowerCase();
    const file = String(item?.file || '').trim();
    if (item?.severity === 'danger' && status === 'missing-code') {
      return {
        level: 'danger',
        label: 'категории нет',
        detail: `${file || 'DAT-файл'} найден, но внутри нет категории ${item.code || ''}. Выберите другой источник или измените правило.`
      };
    }
    if (item?.severity === 'danger') {
      return {
        level: 'danger',
        label: 'нужен DAT',
        detail: item.message || `Для этой ссылки нужен ${file || 'DAT-файл'}, которого нет на роутере.`
      };
    }
    if (status === 'ok') {
      return {
        level: 'ok',
        label: 'найдено',
        detail: kind === 'ext'
          ? `Файл ${file} найден, категория проверена Xray.`
          : `Файл ${file} найден, категория ${item.code || ''} доступна.`
      };
    }
    if (status === 'dev-skip') {
      return {
        level: 'warn',
        label: 'файл есть',
        detail: `Файл ${file} найден. На этой системе категория будет точно проверена Xray при проверке черновика.`
      };
    }
    return {
      level: 'warn',
      label: 'проверить',
      detail: item?.message || 'Файл найден, но категорию стоит проверить через Geo Doctor.'
    };
  }

function geoListTargetLabel(target) {
  if (target === 'direct') return 'напрямую';
  if (target === 'block') return 'блокировка';
  return 'через proxy';
}

function geoListKindLabel(kind) {
  return kind === 'ip' ? 'IP и подсети' : 'Домены';
}

function geoListRulePreview(list) {
  const values = Array.isArray(list.items) ? list.items : [];
  if (!values.length) return '';
  const prefix = list.kind === 'ip' ? 'ip' : 'domain';
  return values.slice(0, 3).map((value) => `${prefix}(${value}) -> ${list.target || 'proxy'}`).join('\n');
}

function geoInstalledFileKind(file) {
  const name = String(file?.name || '').toLowerCase();
  if (name === 'geoip.dat') return 'geoip';
  if (name === 'geosite.dat') return 'geosite';
  if (name.includes('geoip')) return 'geoip';
  return '';
}

function geoInstalledFileCatalogKind(file) {
  return geoInstalledFileKind(file) || 'geosite';
}

function geoInstalledFileCard(file) {
  const kind = geoInstalledFileCatalogKind(file);
  const catalog = state.geoCatalog || {};
  const isOpenCatalog = catalog.file === file.name;
  const fileName = String(file.name || '');
  const canDownload = file.exists !== false && fileName;
  const contentIcon = isOpenCatalog ? '-' : '+';
  const contentLabel = isOpenCatalog ? 'Скрыть содержимое' : 'Содержимое';
  return `<article class="geo-file-card ${isOpenCatalog ? 'with-catalog' : ''}">
    <div class="geo-file-main">
      <div>
        <strong>${escapeHtml(file.name || file.path)}</strong>
        <span>${file.exists === false ? 'не найден' : `${fileSize(file.size)} · ${file.modifiedAt ? new Date(file.modifiedAt).toLocaleString() : ''}`}</span>
        <code>${escapeHtml(file.path || '')}</code>
      </div>
      <div class="split-actions">
        ${canDownload ? `<button class="btn secondary geo-content-toggle ${isOpenCatalog ? 'active' : ''} ${state.geoCatalogLoading && catalog.file === fileName ? 'is-busy' : ''}" data-geo-catalog="${escapeHtml(kind)}" data-geo-catalog-file="${escapeHtml(fileName)}" ${state.geoCatalogLoading ? 'disabled' : ''}><span>${contentIcon}</span>${contentLabel}</button>` : ''}
        ${canDownload ? `<a class="btn secondary" href="/api/geo/download?file=${encodeURIComponent(fileName)}" download="${escapeHtml(fileName)}">Скачать</a>` : '<button class="btn secondary" disabled>Скачать</button>'}
        <button class="btn secondary" data-geo-delete="${escapeHtml(file.name || '')}" ${file.exists === false ? 'disabled' : ''}>Удалить</button>
      </div>
    </div>
    ${isOpenCatalog ? `<div class="geo-file-catalog">${geoCatalogPanel({ editable: false, showActions: false })}</div>` : ''}
  </article>`;
}

function geoCatalogPanel({ editable = true, showActions = true } = {}) {
  const geo = state.geoStatus || {};
  const catalog = state.geoCatalog || {};
  const files = (geo.files || []).filter((file) => file.exists !== false && String(file.name || '').toLowerCase().endsWith('.dat'));
  const categories = Array.isArray(catalog.categories) ? catalog.categories : [];
  const search = String(state.geoCatalogSearch || '').trim().toLowerCase();
  const filtered = search
    ? categories.filter((item) => String(item.code || '').toLowerCase().includes(search))
    : categories;
  const visible = filtered;
  const selectedKind = catalog.kind === 'geoip' ? 'geoip' : 'geosite';
  return `
    <div class="geo-catalog-panel">
      ${showActions ? `<div class="geo-catalog-actions">
        ${files.map((file) => {
          const fileName = String(file.name || '');
          const fileKind = geoInstalledFileCatalogKind(file);
          const active = catalog.file === fileName;
          return `<button type="button" class="btn secondary ${active ? 'active' : ''} ${state.geoCatalogLoading && active ? 'is-busy' : ''}" data-geo-catalog="${escapeHtml(fileKind)}" data-geo-catalog-file="${escapeHtml(fileName)}" ${state.geoCatalogLoading ? 'disabled' : ''}>
            ${escapeHtml(fileName)}
            <small>${escapeHtml(fileKind === 'geoip' ? 'GeoIP' : 'GeoSite')} · ${fileSize(file.size)}</small>
          </button>`;
        }).join('') || '<p class="muted">DAT-файлов пока нет.</p>'}
      </div>` : ''}
      ${catalog.stderr || catalog.error ? `<p class="settings-warning compact"><strong>Не удалось открыть dat-файл</strong><span>${escapeHtml(catalog.stderr || catalog.error)}</span></p>` : ''}
      ${categories.length ? `
        <div class="geo-catalog-browser">
          <div class="form-row">
            <label>Категории в ${escapeHtml(catalog.file || (selectedKind === 'geoip' ? 'geoip.dat' : 'geosite.dat'))}</label>
            <input id="geoCatalogSearch" value="${escapeHtml(state.geoCatalogSearch || '')}" placeholder="Найти: ru, private, telegram, youtube..." />
          </div>
          <div class="geo-catalog-grid">
            ${visible.map((item) => editable ? `<article class="geo-catalog-category-card">
              <button type="button" class="geo-catalog-category" data-geo-catalog-kind="${escapeHtml(selectedKind)}" data-geo-catalog-file="${escapeHtml(catalog.file || '')}" data-geo-catalog-code="${escapeHtml(item.code)}">
                <strong>${escapeHtml(item.code)}</strong>
                <span>${Number(item.count || 0)} записей</span>
              </button>
              <button type="button" class="geo-catalog-full" data-geo-catalog-kind="${escapeHtml(selectedKind)}" data-geo-catalog-file="${escapeHtml(catalog.file || '')}" data-geo-catalog-code="${escapeHtml(item.code)}" data-geo-catalog-full="1">весь</button>
            </article>` : `<article class="geo-catalog-category readonly">
              <strong>${escapeHtml(item.code)}</strong>
              <span>${Number(item.count || 0)} записей</span>
            </article>`).join('')}
          </div>
        </div>
      ` : catalog.ok ? '<p class="muted">В dat-файле не найдено категорий.</p>' : ''}
    </div>
  `;
}

function geoUserListEditorPanel() {
  const lists = Array.isArray(state.geoUserLists) ? state.geoUserLists : [];
  const editing = lists.find((list) => list.id === state.geoListEditingId);
  const datEditing = Boolean(state.geoCatalogEditKind && state.geoCatalogEditCode);
  const datFile = state.geoCatalogEditFile || (state.geoCatalogEditKind === 'geoip' ? 'geoip.dat' : 'geosite.dat');
  const datSaveDisabled = Boolean(state.geoUpdating || state.geoCatalogEditTruncated);
  return `
    <section class="panel geo-list-editor">
      <div class="panel-title">
        <div>
          <h2>Редактор geo-списков</h2>
          <span>Можно создать новый список вручную или открыть категорию из установленного DAT-файла для правки.</span>
        </div>
      </div>
      ${geoCatalogPanel()}
      ${datEditing ? `<div class="geo-dat-edit-note ${state.geoCatalogEditTruncated ? 'warning' : ''}">
        <strong>${escapeHtml(state.geoCatalogEditCode)}</strong>
        <span>${state.geoCatalogEditTruncated
          ? `Категория из ${escapeHtml(datFile)} открыта частично. Ее можно сохранить как новый список RuOpenRay, но перезапись DAT заблокирована, чтобы не обрезать файл.`
          : `Открыта категория из ${escapeHtml(datFile)}. Можно сохранить ее как отдельный список RuOpenRay или изменить эту категорию прямо в установленном DAT.`}</span>
      </div>` : ''}
      <div class="geo-list-form">
        <div class="form-row">
          <label>Название</label>
          <input id="geoListName" value="${escapeHtml(state.geoListName)}" placeholder="Например: Рабочие сервисы, Telegram IP, Игры" />
        </div>
        <div class="form-row">
          <label>Тип</label>
          <select id="geoListKind">
            <option value="domain" ${state.geoListKind !== 'ip' ? 'selected' : ''}>Домены</option>
            <option value="ip" ${state.geoListKind === 'ip' ? 'selected' : ''}>IP и подсети</option>
          </select>
        </div>
        <div class="form-row">
          <label>Куда направлять</label>
          <select id="geoListTarget">
            <option value="proxy" ${state.geoListTarget === 'proxy' ? 'selected' : ''}>через proxy</option>
            <option value="direct" ${state.geoListTarget === 'direct' ? 'selected' : ''}>напрямую</option>
            <option value="block" ${state.geoListTarget === 'block' ? 'selected' : ''}>блокировать</option>
          </select>
        </div>
        <div class="form-row geo-list-items-row">
          <label>${state.geoListKind === 'ip' ? 'IP или подсети, по одному в строке' : 'Домены, по одному в строке'}</label>
          <textarea id="geoListItems" rows="7" placeholder="${state.geoListKind === 'ip' ? '91.108.4.0/22\\n149.154.160.0/20\\n192.168.1.10' : 'telegram.org\\nt.me\\nregexp:.*\\\\.telegram\\\\.org'}">${escapeHtml(state.geoListItems)}</textarea>
          <small>Это не правка бинарных .dat. RuOpenRay сохранит список и сможет добавить его в маршрутизацию как обычные правила Xray.</small>
        </div>
        <div class="geo-list-form-actions">
          ${datEditing ? `<button class="btn warning ${state.geoUpdating ? 'is-busy' : ''}" data-action="saveGeoCatalogCategory" ${datSaveDisabled ? 'disabled' : ''}>${state.geoUpdating ? 'Сохраняю DAT...' : `Изменить ${escapeHtml(datFile)}`}</button>` : ''}
          <button class="btn ${editing ? 'warning' : 'secondary'}" data-action="addGeoList">${editing ? 'Сохранить список' : 'Добавить список'}</button>
          ${editing ? '<button class="btn secondary" data-geo-list-cancel="1">Отмена</button>' : ''}
        </div>
      </div>
      <div class="geo-list-saved">
        ${lists.map((list) => {
          const preview = geoListRulePreview(list);
          const warnings = Array.isArray(list.warnings) ? list.warnings : [];
          return `<article class="${list.enabled === false ? 'disabled' : ''} ${state.geoListEditingId === list.id ? 'editing' : ''}">
            <div>
              <strong>${escapeHtml(list.name || 'Geo-список')}</strong>
              <span>${escapeHtml(geoListKindLabel(list.kind))} · ${escapeHtml(geoListTargetLabel(list.target))} · ${(list.items || []).length} ${(list.items || []).length === 1 ? 'запись' : 'записей'}</span>
              ${preview ? `<code>${escapeHtml(preview)}</code>` : ''}
              ${warnings.length ? `<small class="geo-list-warning">${escapeHtml(warnings.slice(0, 2).join(' · '))}</small>` : ''}
            </div>
            <div class="split-actions">
              <button class="btn secondary" data-geo-list-route="${escapeHtml(list.id)}" ${list.enabled === false || !(list.items || []).length ? 'disabled' : ''}>В маршрутизацию</button>
              <button class="btn secondary" data-geo-list-edit="${escapeHtml(list.id)}">Править</button>
              <button class="btn secondary" data-geo-list-toggle="${escapeHtml(list.id)}">${list.enabled === false ? 'Включить' : 'Выключить'}</button>
              <button class="btn secondary" data-geo-list-delete="${escapeHtml(list.id)}">Удалить</button>
            </div>
          </article>`;
        }).join('') || '<p class="muted">Пользовательских geo-списков пока нет.</p>'}
      </div>
    </section>
  `;
}

function geoEditorPanel() {
  return `
    <section class="route-hero">
      <div>
        <h2>Редактор geo</h2>
        <p>Создайте свой список или откройте категорию из установленного <code>geosite.dat</code>/<code>geoip.dat</code>, чтобы сохранить ее отдельно или изменить текущий DAT.</p>
      </div>
      <div class="route-score">
        <strong>${state.geoCatalogEditCode ? escapeHtml(state.geoCatalogEditCode) : 'DAT'}</strong>
        <span>${state.geoCatalogEditFile ? escapeHtml(state.geoCatalogEditFile) : 'выберите файл'}</span>
      </div>
    </section>
    ${geoUserListEditorPanel()}
  `;
}

function geoSeparateTargetPreview(target) {
  const clean = String(target || '').trim().replace(/\\/g, '/').split('/').pop().replace(/\.dat$/i, '');
  const base = clean || 'my-source';
  return `${base}-geoip.dat + ${base}-geosite.dat`;
}

function geoSourceKindLabel(source) {
  if (source?.kind === 'extra') return `ext dat · ${source.target || 'file.dat'}`;
  if (source?.kind === 'separate') return `отдельно · ${geoSeparateTargetPreview(source.target)}`;
  return 'заменяет geoip.dat + geosite.dat';
}

function geoSourceCoverage(source) {
  if (source?.kind === 'extra') return ['custom', 'ext'];
  if (source?.kind === 'separate') return ['custom', 'geoip', 'geosite', 'ext'];
  return ['custom', 'geoip', 'geosite'];
}

function geoSourceUrls(source) {
  if (source?.kind === 'extra') return source.url || '';
  return [source?.geoipUrl, source?.geositeUrl].filter(Boolean).join(' · ');
}

function geoSourceKindOptions() {
  return `
    <option value="base" ${state.geoSourceKind === 'base' ? 'selected' : ''}>Заменить стандартные geoip.dat/geosite.dat</option>
    <option value="separate" ${state.geoSourceKind === 'separate' ? 'selected' : ''}>Поставить рядом отдельными DAT</option>
    <option value="extra" ${state.geoSourceKind === 'extra' ? 'selected' : ''}>Один дополнительный ext DAT</option>
  `;
}

function geoSourceFormFields() {
  if (state.geoSourceKind === 'extra') {
    return `
      <div class="form-row geo-source-target-row">
        <label>Имя файла</label>
        <input id="geoSourceTarget" value="${escapeHtml(state.geoSourceTarget)}" placeholder="my-site.dat" />
      </div>
      <div class="form-row geo-source-url-row">
        <label>URL dat-файла</label>
        <input id="geoSourceUrl" value="${escapeHtml(state.geoSourceUrl)}" placeholder="https://example.com/my-site.dat" />
      </div>
    `;
  }
  return `
    ${state.geoSourceKind === 'separate' ? `
      <div class="form-row geo-source-target-row">
        <label>Имя источника</label>
        <input id="geoSourceTarget" value="${escapeHtml(state.geoSourceTarget)}" placeholder="runet" />
        <small>Будет сохранено как ${escapeHtml(geoSeparateTargetPreview(state.geoSourceTarget))}. Стандартные geoip.dat/geosite.dat не изменятся.</small>
      </div>
    ` : ''}
    <div class="form-row geo-source-url-row">
      <label>geoip.dat URL</label>
      <input id="geoSourceGeoipUrl" value="${escapeHtml(state.geoSourceGeoipUrl)}" placeholder="https://example.com/geoip.dat" />
    </div>
    <div class="form-row geo-source-url-row">
      <label>geosite.dat URL</label>
      <input id="geoSourceGeositeUrl" value="${escapeHtml(state.geoSourceGeositeUrl)}" placeholder="https://example.com/geosite.dat" />
    </div>
  `;
}

function geoPanel() {
  const geo = state.geoStatus || {};
  const presets = geo.presets || [];
  const installedFiles = geo.files || [];
  const selected = selectedGeoPreset();
  const basePresets = presets.filter((preset) => preset.mode !== 'extra-geosite');
  const extraPresets = presets.filter((preset) => preset.mode === 'extra-geosite');
  const selectedPresets = geoSelectedPresets();
  const custom = state.geoBasePreset === 'custom';
  const customSelected = state.geoCustomSourceIds.length > 0;
  const editingSource = state.geoCustomSources.find((source) => source.id === state.geoSourceEditingId);
  const editingPreset = presets.find((preset) => preset.id === state.geoPresetEditingId);
  const canUpdate = custom || selected?.installable || customSelected;
  return `
    <section class="route-hero">
      <div>
        <h2>Geodata manager</h2>
        <p>Источники geoip.dat/geosite.dat, свои URL, дополнительные dat-файлы, обновление и расписание для правил <code>geoip:...</code>, <code>geosite:...</code> и <code>ext:</code>.</p>
      </div>
      <div class="route-score">
        <strong>${(geo.geoip?.exists ? 1 : 0) + (geo.geosite?.exists ? 1 : 0)}/2</strong>
        <span>файлов установлено</span>
      </div>
    </section>

    ${geoNandCard(geo, selectedPresets)}

    ${geoAuditPanel(geo)}

    <section class="panel geo-file-legacy-panel" hidden>
      <div class="panel-title">
        <div><h2>Установленные dat-файлы</h2><span>Обычные источники заменяют пару <code>geoip.dat</code>/<code>geosite.dat</code>. Источники geoip-only обновляют только <code>geoip.dat</code>. Дополнительные файлы могут лежать рядом и использоваться правилами <code>ext:"file.dat:list"</code>.</span></div>
      </div>
      <div class="geo-file-list">
        ${installedFiles.map((file) => `<article>
          <div>
            <strong>${escapeHtml(file.name || file.path)}</strong>
            <span>${file.exists === false ? 'не найден' : `${fileSize(file.size)} · ${file.modifiedAt ? new Date(file.modifiedAt).toLocaleString() : ''}`}</span>
            <code>${escapeHtml(file.path || '')}</code>
          </div>
          <button class="btn secondary" data-geo-delete="${escapeHtml(file.name || '')}" ${file.exists === false ? 'disabled' : ''}>Удалить</button>
        </article>`).join('') || '<p class="muted">dat-файлов пока нет. Установите базовый источник или дополнительный ext DAT.</p>'}
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <div><h2>Источники geodata</h2><span>Выберите один основной источник: пару geoip/geosite или отдельный geoip.dat. Дополнительные dat-файлы для ext-правил можно ставить вместе с ним.</span></div>
        <div class="split-actions">
          ${selected && !custom ? `<button class="btn secondary" data-geo-preset-edit="${escapeHtml(selected.id)}">Переопределить</button>` : ''}
          ${selected?.customized ? `<button class="btn secondary" data-geo-preset-reset="${escapeHtml(selected.id)}">Вернуть стандартный</button>` : ''}
          <button class="btn secondary ${state.busyAction === 'cleanupGeoBackups' ? 'is-busy' : ''}" data-action="cleanupGeoBackups" ${state.busyAction === 'cleanupGeoBackups' ? 'disabled' : ''}>${state.busyAction === 'cleanupGeoBackups' ? 'Очищаю...' : 'Очистить geo-бэкапы'}</button>
          <button class="btn warning ${state.geoUpdating ? 'is-busy' : ''}" data-action="updateGeo" ${state.geoUpdating || !canUpdate ? 'disabled' : ''}>${state.geoUpdating ? 'Обновляю...' : geoActionLabel(selected)}</button>
        </div>
      </div>
      <div class="geo-presets">
        ${basePresets.map((preset) => `<button class="${state.geoBasePreset === preset.id ? 'active' : ''} ${preset.installable ? '' : 'reference'}" data-geo-base="${escapeHtml(preset.id)}">
          <span class="geo-purpose">${escapeHtml(geoPurposeLabel(preset))}</span>
          <strong>${escapeHtml(preset.name)}</strong>
          <small>${escapeHtml(preset.compat || '')}</small>
          ${preset.customized ? '<small>изменен локально</small>' : ''}
          ${geoCoverageBadges(preset)}
          <span>${escapeHtml(preset.detail)}</span>
          ${preset.ruleHint ? `<code>${escapeHtml(preset.ruleHint)}</code>` : ''}
          ${preset.estimatedBytes ? `<small>примерно ${fileSize(preset.estimatedBytes)}</small>` : ''}
        </button>`).join('')}
        <button class="${custom ? 'active' : ''}" data-geo-base="custom">
          <span class="geo-purpose">свои ссылки</span>
          <strong>Свой источник</strong>
          <small>Xray DAT</small>
          ${geoCoverageBadges(null, ['custom', 'geoip', 'geosite'])}
          <span>Вставьте прямые URL на geoip.dat и geosite.dat.</span>
        </button>
      </div>
      ${extraPresets.length ? `<div class="geo-group-title">Дополнительные DAT для ext-правил</div>
      <div class="geo-extra-select">
        ${extraPresets.map((preset) => `<label class="${state.geoExtraPresets.includes(preset.id) ? 'active' : ''}">
          <input type="checkbox" data-geo-extra="${escapeHtml(preset.id)}" ${state.geoExtraPresets.includes(preset.id) ? 'checked' : ''} />
          <span>
            <strong>${escapeHtml(preset.name)}</strong>
            <small>${escapeHtml(geoPurposeLabel(preset))}</small>
            ${geoCoverageBadges(preset)}
            <em>${escapeHtml(preset.detail)}</em>
            ${preset.ruleHint ? `<code>${escapeHtml(preset.ruleHint)}</code>` : ''}
          </span>
        </label>`).join('')}
      </div>` : ''}
      <div class="geo-options">
        <label class="toggle-row">
          <input id="geoBackup" type="checkbox" ${state.geoBackup ? 'checked' : ''} />
          <span>Сохранять бэкап перед заменой</span>
        </label>
        <small class="muted">Если места мало, бэкап можно выключить: текущий dat-файл будет заменен без копии.</small>
      </div>
      ${geoDiskWarning(selectedPresets, geo)}
      ${custom ? `<div class="geo-custom">
        <div class="geo-group-title">Свои URL</div>
        <div class="form-row">
          <label>geoip.dat URL</label>
          <input id="geoipUrl" value="${escapeHtml(state.geoipUrl)}" placeholder="https://example.com/geoip.dat" />
        </div>
        <div class="form-row">
          <label>geosite.dat URL</label>
          <input id="geositeUrl" value="${escapeHtml(state.geositeUrl)}" placeholder="https://example.com/geosite.dat" />
        </div>
      </div>` : ''}
      <div class="geo-manager">
        <div class="geo-group-title">${editingPreset ? `Редактор встроенного источника · ${escapeHtml(editingPreset.name || '')}` : editingSource ? `Редактор источника · ${escapeHtml(editingSource.name || '')}` : 'Свои источники'}</div>
        <div class="geo-source-form">
          <div class="form-row geo-source-name-row">
            <label>Название</label>
            <input id="geoSourceName" value="${escapeHtml(state.geoSourceName)}" placeholder="Мой geosite / офисный список" />
          </div>
          <div class="form-row geo-source-kind-row">
            <label>Тип</label>
            <select id="geoSourceKind">
              ${geoSourceKindOptions()}
            </select>
          </div>
          ${geoSourceFormFields()}
          <button class="btn ${editingSource || editingPreset ? 'warning' : 'secondary'}" data-action="addGeoSource">${editingPreset ? 'Сохранить переопределение' : editingSource ? 'Сохранить источник' : 'Добавить источник'}</button>
          ${editingSource || editingPreset ? '<button class="btn secondary" data-geo-source-cancel="1">Отмена</button>' : ''}
        </div>
        <div class="geo-source-list">
          ${state.geoCustomSources.map((source) => `<article class="${state.geoCustomSourceIds.includes(source.id) ? 'active' : ''} ${state.geoSourceEditingId === source.id ? 'editing' : ''}">
            <label class="toggle-row">
              <input type="checkbox" data-geo-custom="${escapeHtml(source.id)}" ${state.geoCustomSourceIds.includes(source.id) ? 'checked' : ''} ${source.enabled === false ? 'disabled' : ''} />
              <span>Выбрать для обновления</span>
            </label>
            <div>
              <strong>${escapeHtml(source.name)}</strong>
              <span>${escapeHtml(geoSourceKindLabel(source))}</span>
              ${geoCoverageBadges(null, geoSourceCoverage(source))}
              <code>${escapeHtml(geoSourceUrls(source))}</code>
            </div>
            <div class="split-actions">
              <button class="btn secondary" data-geo-source-edit="${escapeHtml(source.id)}">Править</button>
              <button class="btn secondary" data-geo-source-toggle="${escapeHtml(source.id)}">${source.enabled === false ? 'Включить' : 'Выключить'}</button>
              <button class="btn secondary" data-geo-source-delete="${escapeHtml(source.id)}">Удалить</button>
            </div>
          </article>`).join('') || '<p class="muted">Своих источников пока нет. Добавьте URL один раз, потом выбирайте его для ручного или scheduled обновления.</p>'}
        </div>
      </div>
      <div class="geo-schedule">
        <div class="geo-group-title">Расписание обновления</div>
        <label class="toggle-row">
          <input id="geoScheduleEnabled" type="checkbox" ${state.geoScheduleEnabled ? 'checked' : ''} />
          <span>Обновлять выбранные geo-файлы автоматически</span>
        </label>
        <div class="geo-schedule-grid">
          <div class="form-row">
            <label>Период</label>
            <select id="geoScheduleInterval">
              <option value="daily" ${state.geoScheduleInterval === 'daily' ? 'selected' : ''}>Ежедневно</option>
              <option value="weekly" ${state.geoScheduleInterval === 'weekly' ? 'selected' : ''}>Еженедельно</option>
            </select>
          </div>
          <div class="form-row">
            <label>День</label>
            <select id="geoScheduleWeekday" ${state.geoScheduleInterval === 'daily' ? 'disabled' : ''}>
              ${['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'].map((day, index) => `<option value="${index}" ${state.geoScheduleWeekday === String(index) ? 'selected' : ''}>${day}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <label>Время</label>
            <input id="geoScheduleTime" type="time" value="${escapeHtml(state.geoScheduleTime)}" />
          </div>
          <button class="btn secondary ${state.busyAction === 'saveGeoSchedule' ? 'is-busy' : ''}" data-action="saveGeoSchedule" ${state.busyAction === 'saveGeoSchedule' ? 'disabled' : ''}>${state.busyAction === 'saveGeoSchedule' ? 'Сохраняю...' : 'Сохранить расписание'}</button>
        </div>
      </div>
      ${state.geoUpdate ? `<div class="core-result">
        <strong>${state.geoUpdate.ok ? 'Готово' : 'Ошибка'}</strong>
        ${state.geoUpdate.stdout || state.geoUpdate.stderr ? `<pre>${escapeHtml(state.geoUpdate.ok ? (state.geoUpdate.stdout || state.geoUpdate.stderr) : (state.geoUpdate.stderr || state.geoUpdate.stdout)).slice(0, 1600)}</pre>` : ''}
      </div>` : '<p class="muted">Перед заменой существующие файлы сохраняются в backup-каталог. После успешного обновления Xray перезапускается.</p>'}
    </section>
  `;
}


  return {
    fileSize,
    geoSelectedPresetIds,
    geoSelectedPresets,
    geoRequiredSpace,
    geoDiskWarning,
    selectedGeoPreset,
    geoActionLabel,
    geoNandCard,
    geoPurposeLabel,
    geoCoverageLabel,
    geoCoverageBadges,
    geoAuditPanel,
    geoEditorPanel,
    geoPanel,
  };
}
