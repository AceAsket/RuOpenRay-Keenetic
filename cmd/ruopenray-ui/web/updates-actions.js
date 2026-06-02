export function createUpdatesActions({
  state,
  request,
  upload = null,
  render,
  refresh,
  geoSelectedPresetIds
}) {
  async function updateCore() {
    const version = state.selectedCoreVersion || '';
    if (!version) {
      state.message = 'Сначала выберите версию Xray-core';
      render();
      return;
    }
    state.coreUpdating = true;
    state.message = `Устанавливаю Xray-core ${version}...`;
    render();
    try {
      const result = await request('/api/core/update', { method: 'POST', body: JSON.stringify({ version, backup: state.coreBackup }) });
      state.coreUpdate = result;
      state.coreDialogOpen = false;
      state.message = result.ok
        ? `Ядро Xray установлено: ${result.after || version}`
        : result.stderr || result.message || 'Не удалось обновить ядро Xray';
      await refresh();
    } finally {
      state.coreUpdating = false;
      render();
    }
  }

  async function updateApp() {
    const target = state.appRelease?.tag || '';
    if (!target) {
      state.message = 'Не удалось получить последний релиз RuOpenRay UI';
      render();
      return;
    }
    state.appUpdating = true;
    state.message = `Обновляю RuOpenRay UI до ${target}...`;
    render();
    try {
      const result = await request('/api/app/update', {
        method: 'POST',
        body: JSON.stringify({ version: target, backup: state.appBackup })
      });
      state.appUpdate = result;
      state.message = result.ok
        ? `RuOpenRay UI обновлен до ${result.version || target}. Сервис перезапускается.`
        : result.stderr || 'Не удалось обновить RuOpenRay UI';
      if (result.ok) {
        setTimeout(() => refresh().catch(() => {}), 2500);
      } else {
        await refresh();
      }
    } finally {
      state.appUpdating = false;
      render();
    }
  }

  async function checkAppUpdate() {
    state.appReleaseChecking = true;
    state.message = 'Проверяю обновления RuOpenRay UI...';
    render();
    try {
      const result = await request('/api/app/releases');
      state.appRelease = result?.release || null;
      if (result?.version && state.status?.app) {
        state.status = {
          ...(state.status || {}),
          app: { ...(state.status.app || {}), version: result.version, asset: result.asset || state.status.app.asset }
        };
      }
      const release = state.appRelease || {};
      state.message = release.update && release.assetUrl
        ? `Доступно обновление RuOpenRay UI: ${release.current || result.version || 'текущая'} → ${release.tag}`
        : `RuOpenRay UI актуален: ${result?.version || state.status?.app?.version || 'dev'}`;
    } catch (error) {
      state.message = error.message || 'Не удалось проверить обновления RuOpenRay UI';
    } finally {
      state.appReleaseChecking = false;
      render();
    }
  }

  async function appVersionClick() {
    const release = state.appRelease || {};
    if (release.update && release.assetUrl) {
      state.tab = 'settings';
      state.settingsView = 'updates';
      state.message = `Доступно обновление RuOpenRay UI: ${release.current || state.status?.app?.version || 'текущая'} → ${release.tag}`;
      render();
      return;
    }
    await checkAppUpdate();
    if (state.appRelease?.update && state.appRelease?.assetUrl) {
      state.tab = 'settings';
      state.settingsView = 'updates';
      render();
    }
  }

  async function updateGeo() {
    state.geoUpdating = true;
    state.message = 'Обновляю geoip.dat и geosite.dat...';
    render();
    try {
      const presets = geoSelectedPresetIds();
      const result = await request('/api/geo/update', {
        method: 'POST',
        body: JSON.stringify({
          preset: state.geoBasePreset,
          presets,
          customSourceIds: state.geoCustomSourceIds,
          geoipUrl: state.geoipUrl,
          geositeUrl: state.geositeUrl,
          backup: state.geoBackup
        })
      });
      state.geoUpdate = result;
      state.geoStatus = result.status || state.geoStatus;
      state.message = result.ok ? 'Geo-файлы обновлены, Xray перезапущен' : result.stderr || 'Не удалось обновить geo-файлы';
      await refresh();
    } finally {
      state.geoUpdating = false;
      render();
    }
  }

  async function checkGeoAudit() {
    state.geoUpdating = true;
    state.message = 'Проверяю geo-списки через Xray...';
    render();
    try {
      let config = state.config || {};
      try {
        config = JSON.parse(state.jsonDraft || JSON.stringify(config));
      } catch {
        // Geo Doctor can still check the last valid draft while the JSON editor is being fixed.
      }
      const result = await request('/api/geo/audit', {
        method: 'POST',
        body: JSON.stringify({ config })
      });
      state.geoUpdate = result;
      state.geoStatus = result.status || state.geoStatus;
      state.message = result.stdout || (result.ok ? 'Geo-списки проверены' : 'В geo-списках есть проблемы');
    } finally {
      state.geoUpdating = false;
      render();
    }
  }

  async function saveGeoSchedule() {
    const result = await request('/api/geo/schedule', {
      method: 'POST',
      body: JSON.stringify({
        enabled: state.geoScheduleEnabled,
        interval: state.geoScheduleInterval,
        weekday: state.geoScheduleWeekday,
        time: state.geoScheduleTime,
        preset: state.geoBasePreset,
        presets: geoSelectedPresetIds(),
        customSourceIds: state.geoCustomSourceIds,
        geoipUrl: state.geoipUrl,
        geositeUrl: state.geositeUrl,
        backup: state.geoBackup
      })
    });
    state.geoUpdate = result;
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.stdout || 'Расписание geo сохранено';
    render();
  }

  async function installCorePackage() {
    state.coreUpdating = true;
    state.installStep = 'installing';
    state.message = 'Устанавливаю Xray из пакетов OpenWrt...';
    render();
    try {
      const result = await request('/api/core/update', { method: 'POST', body: JSON.stringify({ version: '' }) });
      state.coreUpdate = result;
      state.coreDialogOpen = false;
      state.installStep = result.ok ? 'done' : 'error';
      state.message = result.ok ? `Xray установлен: ${result.after || 'проверьте статус'}` : result.stderr || result.stdout || 'Не удалось установить Xray';
      await refresh();
      state.installPlan = await request('/api/install/plan').catch(() => state.installPlan);
    } finally {
      state.coreUpdating = false;
    }
    render();
  }

  async function cleanupGeoBackups() {
    const result = await request('/api/geo/cleanup', { method: 'POST', body: '{}' });
    state.geoUpdate = result;
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.stdout || 'Резервные копии geo очищены';
    render();
  }

  async function uploadGeoFile() {
    const file = state.geoUploadFile || document.querySelector('#geoUploadFile')?.files?.[0] || null;
    if (!file) {
      state.message = 'Выберите dat-файл для загрузки';
      render();
      return;
    }
    if (!String(file.name || '').toLowerCase().endsWith('.dat')) {
      state.message = 'Можно загрузить только файл с расширением .dat';
      render();
      return;
    }
    if (!upload) {
      state.message = 'Загрузка файлов недоступна в этом режиме панели';
      render();
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('target', state.geoUploadTarget || 'geosite');
    form.append('name', state.geoUploadName || '');
    form.append('backup', state.geoUploadBackup ? '1' : '0');
    form.append('restart', state.geoUploadRestart ? '1' : '0');
    state.geoUpdating = true;
    state.message = `Загружаю ${file.name}...`;
    render();
    try {
      const result = await upload('/api/geo/upload', form);
      state.geoUpdate = result;
      state.geoStatus = result.status || state.geoStatus;
      state.message = result.ok ? result.stdout || 'dat-файл загружен' : result.stderr || 'Не удалось загрузить dat-файл';
      if (result.ok) {
        state.geoUploadFile = null;
        const input = document.querySelector('#geoUploadFile');
        if (input) input.value = '';
      }
      await refresh();
    } finally {
      state.geoUpdating = false;
      render();
    }
  }

  async function deleteGeoFile(file) {
    const name = String(file || '').trim();
    if (!name) return;
    if (!confirm(`Удалить ${name}? Если активные правила ссылаются на этот файл, следующая проверка конфигурации покажет ошибку.`)) return;
    const result = await request('/api/geo/delete', {
      method: 'POST',
      body: JSON.stringify({ files: [name] })
    });
    state.geoUpdate = result;
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.ok ? result.stdout || `${name} удален` : result.stderr || `Не удалось удалить ${name}`;
    render();
  }

  async function cleanupExtraGeoDat() {
    const files = (state.geoStatus?.files || [])
      .filter((file) => file.role === 'extra' && file.exists !== false)
      .map((file) => file.name)
      .filter(Boolean);
    if (!files.length) {
      state.message = 'Дополнительных dat-файлов для удаления нет';
      return render();
    }
    if (!confirm(`Удалить дополнительные dat-файлы: ${files.join(', ')}?`)) return;
    const result = await request('/api/geo/delete', {
      method: 'POST',
      body: JSON.stringify({ files })
    });
    state.geoUpdate = result;
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.ok ? result.stdout || 'Дополнительные dat-файлы удалены' : result.stderr || 'Не удалось удалить дополнительные dat-файлы';
    render();
  }

  function cleanGeoSourcePayload(source = {}) {
    const name = String(source.name || '').trim();
    const kind = source.kind === 'extra' || source.kind === 'separate' ? source.kind : 'base';
    return {
      id: source.id || '',
      name,
      kind,
      geoipUrl: String(source.geoipUrl || '').trim(),
      geositeUrl: String(source.geositeUrl || '').trim(),
      url: String(source.url || '').trim(),
      target: String(source.target || '').trim(),
      enabled: source.enabled !== false
    };
  }

  async function saveGeoSources(sources) {
    const result = await request('/api/geo/sources', {
      method: 'POST',
      body: JSON.stringify({ sources })
    });
    state.geoCustomSources = result.sources || [];
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.stdout || 'Свои источники geodata сохранены';
    render();
  }

  async function saveGeoPresetOverrides(overrides) {
    const result = await request('/api/geo/preset-overrides', {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    state.geoPresetOverrides = result.overrides || {};
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.stdout || 'Переопределения geo-источников сохранены';
    render();
  }

  async function addGeoSource() {
    const editingId = String(state.geoSourceEditingId || '').trim();
    const presetEditingId = String(state.geoPresetEditingId || '').trim();
    const presetEditing = presetEditingId
      ? (state.geoStatus?.presets || []).find((item) => item.id === presetEditingId)
      : null;
    const presetMode = String(presetEditing?.mode || '');
    const source = cleanGeoSourcePayload({
      id: editingId || presetEditingId,
      name: state.geoSourceName,
      kind: state.geoSourceKind,
      geoipUrl: state.geoSourceGeoipUrl,
      geositeUrl: state.geoSourceGeositeUrl,
      url: state.geoSourceUrl,
      target: state.geoSourceTarget,
      enabled: true
    });
    if (!source.name) {
      state.message = 'Укажите название источника geodata';
      render();
      return;
    }
    if ((source.kind === 'base' || source.kind === 'separate') && (!source.geoipUrl || (!source.geositeUrl && presetMode !== 'geoip-only'))) {
      state.message = 'Для базового источника нужны ссылки на geoip.dat и geosite.dat';
      render();
      return;
    }
    if (source.kind === 'separate' && !source.target) {
      state.message = 'Для отдельного источника задайте короткое имя, например runet. RuOpenRay сохранит runet-geoip.dat и runet-geosite.dat';
      render();
      return;
    }
    if (source.kind === 'extra' && (!source.url || !source.target)) {
      state.message = 'Для дополнительного dat-файла нужны URL и имя файла';
      render();
      return;
    }
    if (presetEditingId) {
      const override = {
        name: source.name,
        mode: source.kind === 'extra' ? 'extra-geosite' : source.kind === 'separate' ? 'separate' : presetMode || 'replace',
        geoipUrl: source.geoipUrl,
        geositeUrl: source.geositeUrl,
        url: source.url,
        target: source.target,
        enabled: true
      };
      resetGeoSourceForm();
      await saveGeoPresetOverrides({ ...(state.geoPresetOverrides || {}), [presetEditingId]: override });
      return;
    }
    const next = editingId
      ? state.geoCustomSources.map((item) => (item.id === editingId ? { ...source, enabled: item.enabled !== false } : item))
      : [...state.geoCustomSources, source];
    resetGeoSourceForm();
    await saveGeoSources(next);
  }

  function resetGeoSourceForm() {
    state.geoPresetEditingId = '';
    state.geoSourceEditingId = '';
    state.geoSourceName = '';
    state.geoSourceKind = 'base';
    state.geoSourceGeoipUrl = '';
    state.geoSourceGeositeUrl = '';
    state.geoSourceUrl = '';
    state.geoSourceTarget = '';
  }

  function editGeoPreset(id) {
    const preset = (state.geoStatus?.presets || []).find((item) => item.id === id);
    if (!preset) return;
    state.geoPresetEditingId = preset.id;
    state.geoSourceEditingId = '';
    state.geoSourceName = preset.name || '';
    state.geoSourceKind = preset.mode === 'extra-geosite' ? 'extra' : preset.mode === 'separate' ? 'separate' : 'base';
    state.geoSourceGeoipUrl = preset.geoipUrl || '';
    state.geoSourceGeositeUrl = preset.geositeUrl || '';
    state.geoSourceUrl = preset.url || preset.geositeUrl || '';
    state.geoSourceTarget = preset.target || '';
    render();
  }

  async function resetGeoPresetOverride(id) {
    const next = { ...(state.geoPresetOverrides || {}) };
    delete next[id];
    if (state.geoPresetEditingId === id) resetGeoSourceForm();
    await saveGeoPresetOverrides(next);
  }

  function editGeoSource(id) {
    const source = state.geoCustomSources.find((item) => item.id === id);
    if (!source) return;
    state.geoSourceEditingId = source.id;
    state.geoSourceName = source.name || '';
    state.geoSourceKind = source.kind === 'extra' || source.kind === 'separate' ? source.kind : 'base';
    state.geoSourceGeoipUrl = source.geoipUrl || '';
    state.geoSourceGeositeUrl = source.geositeUrl || '';
    state.geoSourceUrl = source.url || '';
    state.geoSourceTarget = source.target || '';
    render();
  }

  function cancelGeoSourceEdit() {
    resetGeoSourceForm();
    render();
  }

  async function removeGeoSource(id) {
    state.geoCustomSourceIds = state.geoCustomSourceIds.filter((item) => item !== id);
    if (state.geoSourceEditingId === id) resetGeoSourceForm();
    await saveGeoSources(state.geoCustomSources.filter((source) => source.id !== id));
  }

  async function toggleGeoSourceEnabled(id, enabled) {
    await saveGeoSources(state.geoCustomSources.map((source) => (source.id === id ? { ...source, enabled } : source)));
  }

  function cleanGeoListPayload(list = {}) {
    return {
      id: String(list.id || '').trim(),
      name: String(list.name || '').trim(),
      kind: list.kind === 'ip' ? 'ip' : 'domain',
      target: ['direct', 'block'].includes(list.target) ? list.target : 'proxy',
      items: Array.isArray(list.items)
        ? list.items.map((item) => String(item || '').trim()).filter(Boolean)
        : String(list.items || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      enabled: list.enabled !== false,
      updatedAt: list.updatedAt || new Date().toISOString()
    };
  }

  async function saveGeoLists(lists) {
    const result = await request('/api/geo/lists', {
      method: 'POST',
      body: JSON.stringify({ lists })
    });
    state.geoUserLists = result.lists || [];
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.stdout || 'Пользовательские geo-списки сохранены';
    render();
  }

  async function addGeoList() {
    const editingId = String(state.geoListEditingId || '').trim();
    const list = cleanGeoListPayload({
      id: editingId,
      name: state.geoListName,
      kind: state.geoListKind,
      target: state.geoListTarget,
      items: state.geoListItems,
      enabled: true
    });
    if (!list.name) {
      state.message = 'Укажите название geo-списка';
      render();
      return;
    }
    if (!list.items.length) {
      state.message = 'Добавьте хотя бы один домен, IP или подсеть';
      render();
      return;
    }
    const next = editingId
      ? state.geoUserLists.map((item) => (item.id === editingId ? { ...list, enabled: item.enabled !== false } : item))
      : [...state.geoUserLists, list];
    resetGeoListForm();
    await saveGeoLists(next);
  }

  function resetGeoListForm() {
    state.geoListEditingId = '';
    state.geoListName = '';
    state.geoListKind = 'domain';
    state.geoListTarget = 'proxy';
    state.geoListItems = '';
    state.geoCatalogEditKind = '';
    state.geoCatalogEditCode = '';
    state.geoCatalogEditFile = '';
    state.geoCatalogEditTruncated = false;
  }

  function editGeoList(id) {
    const list = state.geoUserLists.find((item) => item.id === id);
    if (!list) return;
    state.geoListEditingId = list.id || '';
    state.geoListName = list.name || '';
    state.geoListKind = list.kind === 'ip' ? 'ip' : 'domain';
    state.geoListTarget = ['direct', 'block'].includes(list.target) ? list.target : 'proxy';
    state.geoListItems = Array.isArray(list.items) ? list.items.join('\n') : '';
    state.geoCatalogEditKind = '';
    state.geoCatalogEditCode = '';
    state.geoCatalogEditFile = '';
    state.geoCatalogEditTruncated = false;
    render();
  }

  function cancelGeoListEdit() {
    resetGeoListForm();
    render();
  }

  async function loadGeoCatalog(kind, file = '') {
    const safeKind = kind === 'geoip' ? 'geoip' : 'geosite';
    if (file && state.geoCatalog?.file === file && !state.geoCatalogLoading) {
      state.geoCatalog = null;
      state.geoCatalogSearch = '';
      render();
      return;
    }
    state.geoCatalogLoading = true;
    state.geoCatalog = { kind: safeKind, file };
    render();
    try {
      const filePart = file ? `&file=${encodeURIComponent(file)}` : '';
      const result = await request(`/api/geo/catalog?kind=${encodeURIComponent(safeKind)}${filePart}`);
      state.geoCatalog = result;
      state.message = result.ok
        ? `${result.file || safeKind} открыт: ${(result.categories || []).length} категорий`
        : (result.stderr || result.error || 'Не удалось открыть dat-файл');
    } finally {
      state.geoCatalogLoading = false;
      render();
    }
  }

  async function openGeoCatalogCategory(kind, code, full = false, file = '') {
    const safeKind = kind === 'geoip' ? 'geoip' : 'geosite';
    const safeCode = String(code || '').trim();
    if (!safeCode) return;
    if (full && !confirm(`Открыть категорию ${safeCode} полностью? Большие DAT-списки могут долго загружаться и занять много памяти в браузере.`)) {
      return;
    }
    state.geoCatalogLoading = true;
    render();
    try {
      const fullFlag = full ? '&full=1' : '';
      const filePart = file ? `&file=${encodeURIComponent(file)}` : '';
      const result = await request(`/api/geo/catalog?kind=${encodeURIComponent(safeKind)}&code=${encodeURIComponent(safeCode)}${fullFlag}${filePart}`);
      if (!result.ok) {
        state.message = result.stderr || result.error || 'Не удалось открыть категорию';
        return;
      }
      const items = Array.isArray(result.items) ? result.items : [];
      state.geoListEditingId = '';
      state.geoListName = `${safeCode} из ${result.file || (safeKind === 'geoip' ? 'geoip.dat' : 'geosite.dat')}`;
      state.geoListKind = safeKind === 'geoip' ? 'ip' : 'domain';
      state.geoListTarget = 'proxy';
      state.geoListItems = items.join('\n');
      state.geoCatalogEditKind = safeKind;
      state.geoCatalogEditCode = safeCode;
      state.geoCatalogEditFile = result.file || (safeKind === 'geoip' ? 'geoip.dat' : 'geosite.dat');
      state.geoCatalogEditTruncated = Boolean(result.truncated);
      state.message = result.truncated
        ? `Категория ${safeCode} открыта частично: первые ${items.length} записей`
        : `Категория ${safeCode} открыта в редакторе: ${items.length} записей`;
    } finally {
      state.geoCatalogLoading = false;
      render();
    }
  }

  async function saveGeoCatalogCategory() {
    const kind = String(state.geoCatalogEditKind || '').trim();
    const code = String(state.geoCatalogEditCode || '').trim();
    if (state.geoCatalogEditTruncated) {
      state.message = 'Категория DAT открыта частично. Сохраните ее как новый список RuOpenRay или уточните категорию, чтобы не обрезать установленный DAT.';
      render();
      return;
    }
    if (!kind || !code) {
      state.message = 'Сначала откройте категорию из geosite.dat или geoip.dat';
      render();
      return;
    }
    if (!confirm(`Изменить категорию ${code} в ${state.geoCatalogEditFile || (kind === 'geoip' ? 'geoip.dat' : 'geosite.dat')}? RuOpenRay сохранит резервную копию, перезапишет DAT и перезапустит Xray.`)) {
      return;
    }
    state.geoUpdating = true;
    state.message = `Сохраняю категорию ${code} в DAT...`;
    render();
    try {
      const result = await request('/api/geo/catalog', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          code,
          file: state.geoCatalogEditFile,
          items: state.geoListItems,
          backup: true
        })
      });
      state.geoUpdate = result;
      state.geoStatus = result.status || state.geoStatus;
      state.message = result.ok ? result.stdout || 'Категория DAT сохранена' : result.stderr || 'Не удалось сохранить категорию DAT';
      if (result.ok) {
        await loadGeoCatalog(kind, result.file || state.geoCatalogEditFile);
      }
    } finally {
      state.geoUpdating = false;
      render();
    }
  }

  async function removeGeoList(id) {
    if (state.geoListEditingId === id) resetGeoListForm();
    await saveGeoLists(state.geoUserLists.filter((list) => list.id !== id));
  }

  async function toggleGeoListEnabled(id, enabled) {
    await saveGeoLists(state.geoUserLists.map((list) => (list.id === id ? { ...list, enabled } : list)));
  }

  return {
    updateCore,
    updateApp,
    checkAppUpdate,
    appVersionClick,
    updateGeo,
    checkGeoAudit,
    saveGeoSchedule,
    installCorePackage,
    cleanupGeoBackups,
    uploadGeoFile,
    deleteGeoFile,
    cleanupExtraGeoDat,
    cleanGeoSourcePayload,
    saveGeoSources,
    saveGeoPresetOverrides,
    addGeoSource,
    editGeoPreset,
    resetGeoPresetOverride,
    editGeoSource,
    cancelGeoSourceEdit,
    removeGeoSource,
    toggleGeoSourceEnabled,
    cleanGeoListPayload,
    saveGeoLists,
    addGeoList,
    editGeoList,
    cancelGeoListEdit,
    loadGeoCatalog,
    openGeoCatalogCategory,
    saveGeoCatalogCategory,
    removeGeoList,
    toggleGeoListEnabled
  };
}
