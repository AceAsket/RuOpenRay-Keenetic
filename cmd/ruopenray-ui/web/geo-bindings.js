export function bindGeoControls({
  state,
  render,
  toggleGeoSourceEnabled,
  removeGeoSource,
  editGeoPreset,
  resetGeoPresetOverride,
  editGeoSource,
  cancelGeoSourceEdit,
  deleteGeoFile,
  toggleGeoListEnabled,
  removeGeoList,
  editGeoList,
  cancelGeoListEdit,
  loadGeoCatalog,
  openGeoCatalogCategory,
  addGeoListToRouting,
}) {
  document.querySelectorAll('[data-geo-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      state.geoPreset = button.dataset.geoPreset;
      render();
    });
  });
  document.querySelectorAll('[data-geo-base]').forEach((button) => {
    button.addEventListener('click', () => {
      state.geoBasePreset = button.dataset.geoBase;
      state.geoPreset = button.dataset.geoBase;
      render();
    });
  });
  document.querySelectorAll('[data-geo-extra]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.geoExtra;
      state.geoExtraPresets = input.checked
        ? [...new Set([...state.geoExtraPresets, id])]
        : state.geoExtraPresets.filter((item) => item !== id);
      render();
    });
  });
  document.querySelectorAll('[data-geo-custom]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.geoCustom;
      state.geoCustomSourceIds = input.checked
        ? [...new Set([...state.geoCustomSourceIds, id])]
        : state.geoCustomSourceIds.filter((item) => item !== id);
      render();
    });
  });
  document.querySelectorAll('[data-geo-source-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const source = state.geoCustomSources.find((item) => item.id === button.dataset.geoSourceToggle);
      if (source) toggleGeoSourceEnabled(source.id, source.enabled === false);
    });
  });
  document.querySelectorAll('[data-geo-preset-edit]').forEach((button) => {
    button.addEventListener('click', () => editGeoPreset(button.dataset.geoPresetEdit));
  });
  document.querySelectorAll('[data-geo-preset-reset]').forEach((button) => {
    button.addEventListener('click', () => resetGeoPresetOverride(button.dataset.geoPresetReset));
  });
  document.querySelectorAll('[data-geo-source-delete]').forEach((button) => {
    button.addEventListener('click', () => removeGeoSource(button.dataset.geoSourceDelete));
  });
  document.querySelectorAll('[data-geo-source-edit]').forEach((button) => {
    button.addEventListener('click', () => editGeoSource(button.dataset.geoSourceEdit));
  });
  document.querySelectorAll('[data-geo-source-cancel]').forEach((button) => {
    button.addEventListener('click', () => cancelGeoSourceEdit());
  });
  document.querySelectorAll('[data-geo-delete]').forEach((button) => {
    button.addEventListener('click', () => deleteGeoFile(button.dataset.geoDelete));
  });
  document.querySelectorAll('[data-geo-list-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const list = state.geoUserLists.find((item) => item.id === button.dataset.geoListToggle);
      if (list) toggleGeoListEnabled(list.id, list.enabled === false);
    });
  });
  document.querySelectorAll('[data-geo-list-delete]').forEach((button) => {
    button.addEventListener('click', () => removeGeoList(button.dataset.geoListDelete));
  });
  document.querySelectorAll('[data-geo-list-edit]').forEach((button) => {
    button.addEventListener('click', () => editGeoList(button.dataset.geoListEdit));
  });
  document.querySelectorAll('[data-geo-list-route]').forEach((button) => {
    button.addEventListener('click', () => addGeoListToRouting(button.dataset.geoListRoute));
  });
  document.querySelectorAll('[data-geo-list-cancel]').forEach((button) => {
    button.addEventListener('click', () => cancelGeoListEdit());
  });
  document.querySelectorAll('[data-geo-catalog]').forEach((button) => {
    button.addEventListener('click', () => loadGeoCatalog(button.dataset.geoCatalog, button.dataset.geoCatalogFile || ''));
  });
  document.querySelectorAll('[data-geo-catalog-code]').forEach((button) => {
    button.addEventListener('click', () => openGeoCatalogCategory(button.dataset.geoCatalogKind, button.dataset.geoCatalogCode, button.dataset.geoCatalogFull === '1', button.dataset.geoCatalogFile || ''));
  });

  document.querySelector('#geoipUrl')?.addEventListener('input', (event) => {
    state.geoipUrl = event.target.value;
  });
  document.querySelector('#geositeUrl')?.addEventListener('input', (event) => {
    state.geositeUrl = event.target.value;
  });
  document.querySelector('#geoSourceName')?.addEventListener('input', (event) => {
    state.geoSourceName = event.target.value;
  });
  document.querySelector('#geoSourceKind')?.addEventListener('change', (event) => {
    state.geoSourceKind = event.target.value;
    render();
  });
  document.querySelector('#geoSourceGeoipUrl')?.addEventListener('input', (event) => {
    state.geoSourceGeoipUrl = event.target.value;
  });
  document.querySelector('#geoSourceGeositeUrl')?.addEventListener('input', (event) => {
    state.geoSourceGeositeUrl = event.target.value;
  });
  document.querySelector('#geoSourceUrl')?.addEventListener('input', (event) => {
    state.geoSourceUrl = event.target.value;
  });
  document.querySelector('#geoSourceTarget')?.addEventListener('input', (event) => {
    state.geoSourceTarget = event.target.value;
  });
  document.querySelector('#geoListName')?.addEventListener('input', (event) => {
    state.geoListName = event.target.value;
  });
  document.querySelector('#geoListKind')?.addEventListener('change', (event) => {
    state.geoListKind = event.target.value;
    render();
  });
  document.querySelector('#geoListTarget')?.addEventListener('change', (event) => {
    state.geoListTarget = event.target.value;
  });
  document.querySelector('#geoListItems')?.addEventListener('input', (event) => {
    state.geoListItems = event.target.value;
  });
  document.querySelector('#geoCatalogSearch')?.addEventListener('input', (event) => {
    state.geoCatalogSearch = event.target.value;
    render();
  });
  document.querySelector('#geoUploadTarget')?.addEventListener('change', (event) => {
    state.geoUploadTarget = event.target.value;
    render();
  });
  document.querySelector('#geoUploadName')?.addEventListener('input', (event) => {
    state.geoUploadName = event.target.value;
  });
  document.querySelector('#geoUploadBackup')?.addEventListener('change', (event) => {
    state.geoUploadBackup = event.target.checked;
    render();
  });
  document.querySelector('#geoUploadRestart')?.addEventListener('change', (event) => {
    state.geoUploadRestart = event.target.checked;
    render();
  });
  document.querySelector('#geoUploadFile')?.addEventListener('change', (event) => {
    state.geoUploadFile = event.target.files?.[0] || null;
    render();
  });
  document.querySelector('#geoBackup')?.addEventListener('change', (event) => {
    state.geoBackup = event.target.checked;
    render();
  });
  document.querySelector('#geoScheduleEnabled')?.addEventListener('change', (event) => {
    state.geoScheduleEnabled = event.target.checked;
  });
  document.querySelector('#geoScheduleInterval')?.addEventListener('change', (event) => {
    state.geoScheduleInterval = event.target.value;
    render();
  });
  document.querySelector('#geoScheduleWeekday')?.addEventListener('change', (event) => {
    state.geoScheduleWeekday = event.target.value;
  });
  document.querySelector('#geoScheduleTime')?.addEventListener('input', (event) => {
    state.geoScheduleTime = event.target.value;
  });
}
