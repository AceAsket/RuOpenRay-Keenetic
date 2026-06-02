export function bindImportControls({ state, render }) {
  document.querySelector('#importLink')?.addEventListener('input', (event) => {
    state.importLink = event.target.value;
    state.importPreview = null;
  });
  document.querySelector('#importOutboundTag')?.addEventListener('input', (event) => {
    state.importOutboundTag = event.target.value;
  });
  document.querySelector('#importCountrySearch')?.addEventListener('input', (event) => {
    const query = String(event.target.value || '').trim().toLowerCase();
    state.importCountrySearch = event.target.value;
    const picker = event.target.closest('.country-picker');
    let visible = 0;
    picker?.querySelectorAll('.country-option[data-country-search-text]').forEach((item) => {
      const match = !query || String(item.dataset.countrySearchText || '').includes(query);
      item.hidden = !match;
      if (match) visible += 1;
    });
    const counter = picker?.querySelector('[data-country-visible-count]');
    if (counter) counter.textContent = String(visible);
    const empty = picker?.querySelector('.country-empty');
    if (empty) empty.hidden = visible > 0;
  });
  document.querySelectorAll('[data-country-pick][data-country-target="import"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.importCountry = button.dataset.countryPick || '';
      state.importCountrySearch = '';
      render();
    });
  });
  document.querySelector('[data-country-clear="import"]')?.addEventListener('click', () => {
    state.importCountry = '';
    state.importCountrySearch = '';
    render();
  });
  document.querySelector('#subscriptionUrl')?.addEventListener('input', (event) => {
    state.subscriptionUrl = event.target.value;
    state.subscriptionPreview = null;
  });
  document.querySelector('#subscriptionAuthEnabled')?.addEventListener('change', (event) => {
    state.subscriptionAuthEnabled = event.target.checked;
    state.subscriptionPreview = null;
    render();
  });
  document.querySelector('#subscriptionAuthUser')?.addEventListener('input', (event) => {
    state.subscriptionAuthUser = event.target.value;
    state.subscriptionPreview = null;
  });
  document.querySelector('#subscriptionAuthPassword')?.addEventListener('input', (event) => {
    state.subscriptionAuthPassword = event.target.value;
    state.subscriptionPreview = null;
  });
  document.querySelector('#subscriptionAutoBalancer')?.addEventListener('change', (event) => {
    state.subscriptionAutoBalancer = event.target.checked;
    render();
  });
  document.querySelector('#subscriptionBalancerTag')?.addEventListener('input', (event) => {
    state.subscriptionBalancerTag = event.target.value;
  });
  document.querySelector('#subscriptionBalancerStrategy')?.addEventListener('change', (event) => {
    state.subscriptionBalancerStrategy = event.target.value;
    render();
  });
}
