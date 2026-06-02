export function bindCoreControls({
  state,
  render,
  filteredCoreReleases,
}) {
  document.querySelectorAll('[data-core-version]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedCoreVersion = button.dataset.coreVersion;
      render();
    });
  });
  document.querySelectorAll('[data-core-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.coreReleaseFilter = button.dataset.coreFilter;
      const visible = filteredCoreReleases().find((release) => release.assetUrl);
      state.selectedCoreVersion = visible?.tag || '';
      render();
    });
  });

  document.querySelector('#selectedCoreVersion')?.addEventListener('change', (event) => {
    state.selectedCoreVersion = event.target.value;
    render();
  });
}
