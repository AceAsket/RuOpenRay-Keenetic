import { countryFlagMarkup, countryOptions } from './server-location.js';

export function countryPickerView({
  escapeHtml,
  selected = '',
  search = '',
  target = 'server',
  inputId = 'serverCountrySearch',
  title = 'Локация сервера'
}) {
  const query = String(search || '').trim().toLowerCase();
  const normalizedSelected = String(selected || '').trim().toUpperCase();
  const selectedItem = countryOptions.find((item) => item.code === normalizedSelected);
  const visible = countryOptions.filter((item) => {
    if (!query) return true;
    return item.code.toLowerCase().includes(query) || item.name.toLowerCase().includes(query);
  });
  return `
    <div class="country-picker">
      <div class="country-picker-head">
        <label for="${escapeHtml(inputId)}">${escapeHtml(title)}</label>
        ${normalizedSelected ? `<button class="link-button" type="button" data-country-clear="${escapeHtml(target)}">Сбросить</button>` : ''}
      </div>
      <div class="country-search-row">
        <span class="country-search-current">
          ${countryFlagMarkup(normalizedSelected)}
          <b>${escapeHtml(normalizedSelected || 'LOC')}</b>
          <em>${escapeHtml(selectedItem?.name || 'Локация не задана')}</em>
        </span>
        <input id="${escapeHtml(inputId)}" data-country-search="${escapeHtml(target)}" placeholder="Найти страну: de, Германия, nl..." value="${escapeHtml(search)}" />
      </div>
      <div class="country-grid" data-country-grid>
        ${visible.map((item) => `
          <button class="country-option ${item.code === normalizedSelected ? 'active' : ''}" type="button" data-country-pick="${escapeHtml(item.code)}" data-country-target="${escapeHtml(target)}" data-country-search-text="${escapeHtml(`${item.code} ${item.name}`.toLowerCase())}">
            ${countryFlagMarkup(item.code)}
            <strong>${escapeHtml(item.code)}</strong>
            <em>${escapeHtml(item.name)}</em>
          </button>
        `).join('')}
        <span class="muted country-empty" ${visible.length ? 'hidden' : ''}>Страна не найдена</span>
      </div>
      <p class="country-picker-foot"><span data-country-visible-count>${visible.length}</span> из ${countryOptions.length}</p>
    </div>
  `;
}
