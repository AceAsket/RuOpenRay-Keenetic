import { countryPickerView } from './server-location-view.js';

export function createImportDialogView({
  state,
  escapeHtml,
  checkForTag,
  checkLabel,
  outboundTransport,
  outboundAddress,
  serverCheckButton,
  suggestedSubscriptionBalancerTag,
  serverImportPreviewItem,
}) {
function importButton(title, detail, kind) {
  return `
    <button class="quick-action" data-import-dialog="${kind}">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(detail)}</span>
    </button>
  `;
}

function serverMini(outbound) {
  const tag = outbound?.tag || 'proxy';
  const check = checkForTag(tag);
  return `
    <div class="server-mini">
      <div class="server-mini-head">
        <span class="active-badge">активный</span>
        <span class="check-badge ${check?.ok ? 'ok' : check ? 'bad' : ''}">${escapeHtml(checkLabel(check))}</span>
      </div>
      <strong>${escapeHtml(tag)}</strong>
      <span>${escapeHtml(outbound?.protocol || 'protocol')} · ${escapeHtml(outboundTransport(outbound))}</span>
      <code>${escapeHtml(outboundAddress(outbound))}</code>
      <div class="server-mini-actions">
        <button class="btn secondary" data-tab-jump="servers">Серверы</button>
        ${serverCheckButton(tag)}
      </div>
    </div>
  `;
}

function emptyMini(title, detail, tab) {
  return `
    <div class="empty-mini">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(detail)}</span>
      <button class="btn secondary" data-tab-jump="${tab}">Перейти</button>
    </div>
  `;
}

function importDialog(kind) {
  if (!kind) return '';
  if (kind === 'choose') {
    return `
      <div class="modal-backdrop" data-action="closeImport">
        <section class="modal import-dialog" role="dialog" aria-modal="true" aria-labelledby="importDialogTitle" data-modal>
          <div class="modal-head">
            <div>
              <h2 id="importDialogTitle">Добавить сервер</h2>
              <span>Выберите источник: одиночную ссылку VLESS/VMess/Trojan или subscription URL.</span>
            </div>
            <button class="icon-btn" type="button" data-action="closeImport" aria-label="Закрыть">×</button>
          </div>
          <div class="import-choice import-choice-dialog">
            ${importButton('Сервер', 'Вставить одну ссылку, увидеть имя, протокол и адрес, затем подтвердить добавление.', 'server')}
            ${importButton('Подписка', 'Скачать subscription URL, проверить найденные серверы и добавить их в профиль.', 'subscription')}
          </div>
        </section>
      </div>
    `;
  }
  const isSubscription = kind === 'subscription';
  return `
    <div class="modal-backdrop" data-action="closeImport">
      <section class="modal import-dialog" role="dialog" aria-modal="true" aria-labelledby="importFormTitle" data-modal>
      <div class="panel-title">
        <div>
          <h2 id="importFormTitle">${isSubscription ? 'Добавить подписку' : 'Добавить сервер'}</h2>
          <span>${isSubscription ? 'Сначала покажем найденные серверы, затем импортируем их в профиль.' : 'Сначала распознаем ссылку, затем подтвердим добавление.'}</span>
        </div>
        <div class="split-actions">
          <button class="btn secondary" type="button" data-import-dialog="choose">Назад</button>
          <button class="btn secondary" type="button" data-action="closeImport">Закрыть</button>
        </div>
      </div>
      <div class="form-row">
        <label>Имя профиля</label>
        <input id="profileName" placeholder="Пусто = имя клиента" value="${escapeHtml(state.profileName)}" />
        <small class="muted">Если не задано, используем имя сервера или первого клиента из подписки.</small>
      </div>
      ${
        isSubscription
          ? `
            <div class="form-row">
              <label>URL подписки</label>
              <input id="subscriptionUrl" placeholder="https://..." value="${escapeHtml(state.subscriptionUrl)}" />
            </div>
            <label class="settings-check compact ${state.subscriptionAuthEnabled ? 'active' : ''}">
              <input id="subscriptionAuthEnabled" type="checkbox" ${state.subscriptionAuthEnabled ? 'checked' : ''} />
              <span><strong>Basic Auth</strong><em>Добавит Authorization при загрузке подписки. Пароль будет скрыт в списке подписок.</em></span>
            </label>
            ${state.subscriptionAuthEnabled ? `
              <div class="route-form">
                <div class="form-row">
                  <label>Логин</label>
                  <input id="subscriptionAuthUser" autocomplete="username" value="${escapeHtml(state.subscriptionAuthUser)}" />
                </div>
                <div class="form-row">
                  <label>Пароль</label>
                  <input id="subscriptionAuthPassword" type="password" autocomplete="current-password" value="${escapeHtml(state.subscriptionAuthPassword)}" />
                </div>
              </div>
            ` : ''}
            <label class="settings-check compact ${state.subscriptionAutoBalancer ? 'active' : ''}">
              <input id="subscriptionAutoBalancer" type="checkbox" ${state.subscriptionAutoBalancer ? 'checked' : ''} />
              <span><strong>Создать стабильную цель подписки</strong><em>В правилах останется один тег направления, а RuOpenRay сможет менять сервер внутри него при резервном переключении.</em></span>
            </label>
            ${state.subscriptionAutoBalancer ? `
              <div class="route-form subscription-balancer-options">
                <div class="form-row route-value">
                  <label>Имя outbound tag</label>
                  <input id="subscriptionBalancerTag" placeholder="${escapeHtml(suggestedSubscriptionBalancerTag())}" value="${escapeHtml(state.subscriptionBalancerTag)}" />
                </div>
              </div>
            ` : ''}
            <div class="import-action-bar">
              <button class="btn secondary" data-action="previewSubscription">Проверить подписку</button>
              <button class="btn" data-action="importSubscriptionToCurrent">В текущий профиль</button>
              <button class="btn warning" data-action="importSubscriptionActive">Добавить и выбрать</button>
              <button class="btn secondary" data-action="importSubscription">Отдельным профилем</button>
            </div>
            ${state.subscriptionPreview?.items?.length ? `<div class="preview-list">${state.subscriptionPreview.items.slice(0, 8).map(previewBox).join('')}</div>` : ''}
          `
          : `
            <div class="form-row">
              <label>Ссылка</label>
              <input id="importLink" placeholder="vless://..." value="${escapeHtml(state.importLink)}" />
            </div>
            <div class="form-row">
              <label>outboundTag</label>
              <input id="importOutboundTag" placeholder="Пусто = имя из ссылки" value="${escapeHtml(state.importOutboundTag)}" />
              <small class="muted">Тег используется в правилах, балансировщиках и статистике Xray.</small>
            </div>
            ${countryPickerView({
              escapeHtml,
              selected: state.importCountry,
              search: state.importCountrySearch,
              target: 'import',
              inputId: 'importCountrySearch',
              title: 'Флаг и страна'
            })}
            <div class="import-action-bar">
              <button class="btn secondary" data-action="previewImport">Распознать</button>
              <button class="btn" data-action="importToCurrent">В текущий профиль</button>
              <button class="btn warning" data-action="importActive">Добавить и выбрать</button>
              <button class="btn secondary" data-action="import">Отдельным профилем</button>
            </div>
            ${serverImportPreviewItem() ? previewBox(serverImportPreviewItem()) : ''}
          `
      }
      ${state.message ? `<p class="notice" style="margin-top: 14px">${escapeHtml(state.message)}</p>` : ''}
      </section>
    </div>
  `;
}

function previewBox(item) {
  return `<article class="preview-box">
    <strong>${escapeHtml(item.tag || 'server')}</strong>
    <span>${escapeHtml(item.protocol || '')} · ${escapeHtml([item.address, item.port].filter(Boolean).join(':'))}</span>
    <small>${escapeHtml(item.network || 'tcp')} / ${escapeHtml(item.security || 'none')}</small>
  </article>`;
}


  return {
    importButton,
    serverMini,
    emptyMini,
    importDialog,
    previewBox,
  };
}
