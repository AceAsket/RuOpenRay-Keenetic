import { normalizeIconifyIcon, routePresetIconView } from './route-visuals.js';

export function createRoutingDialogsView({
  state,
  escapeHtml,
  routeKinds,
  routePlaceholders,
  customRoutePresetEntries,
  builtinRoutePresetEntries,
  ruleCountLabel,
  routePresetConditionCount,
  routePresetInstallSummary = () => ({ installed: false, partial: false }),
  routePresetInstallLabel = () => '',
  routeTargetOptions,
  balancerOptions,
  routeLeasePicker,
  dslPreviewView,
  routeBalancers,
  balancerTargetOptions,
  splitRouteValues,
  balancerSelectorMatches,
  strategyObserverType,
  observerLabel,
  routeRules,
  balancerStrategyLabel,
  routePresetCheckResultView,
  describeRouteRule,
  routePresetRules,
  routeTargetReplacementSummary = () => ({ sources: [], targets: [], selectedCount: 0, affectedCount: 0, sample: [], fromLabel: '', toLabel: '' }),
}) {
function routeRuleTestResultView(result) {
  if (!result) return '';
  const tone = result.tone || (result.ok ? 'both-ok' : 'bad');
  return `
    <div class="domain-probe compact route-rule-test-result ${escapeHtml(tone)}">
      <span>${escapeHtml(result.title || 'Тест выполнен')}</span>
      <small>${escapeHtml(result.detail || '')}</small>
    </div>
  `;
}

function routeRuleDialog() {
  if (!state.routeRuleDialog) return '';
  const outboundTargetOptions = routeTargetOptions()
    .filter((option) => String(option.value || '').startsWith('outbound:'))
    .map((option) => ({ tag: String(option.value).replace(/^outbound:/, ''), label: option.label }));
  const balancers = balancerOptions();
  const editing = state.routeRuleEditingIndex >= 0;
  const listMode = !editing && state.routeRuleMode === 'list';
  const presetsMode = !editing && state.routeRuleMode === 'presets';
  const defaultMode = state.routeKind === 'default';
  const selected = new Set(state.selectedRoutePresets);
  const customEntries = customRoutePresetEntries();
  const sourceBadge = (source) => {
    const clean = source === 'github' ? 'github' : source === 'local' ? 'local' : 'builtin';
    return `<em class="scenario-source-badge source-${escapeHtml(clean)}">${escapeHtml(clean)}</em>`;
  };
  const routeValueItems = splitRouteValues(state.routeValue);
  const useRouteValueTextarea = !defaultMode && (state.routeValueMultiline || routeValueItems.length > 1 || String(state.routeValue || '').length > 90 || String(state.routeValue || '').includes('\n'));
  const routeValueEditorText = useRouteValueTextarea && !String(state.routeValue || '').includes('\n')
    ? routeValueItems.join('\n')
    : state.routeValue;
  return `
    <div class="modal-backdrop" data-action="closeRouteRuleDialog">
      <section class="modal route-rule-dialog" role="dialog" aria-modal="true" aria-labelledby="routeRuleTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="routeRuleTitle">${editing ? 'Редактирование правила' : presetsMode ? 'Добавить подборки' : 'Новое правило'}</h2>
            <span>${editing ? 'Измените условие, цель или название правила. Порядок в списке останется прежним.' : presetsMode ? 'Выберите одну или несколько подборок правил и добавьте их в черновик маршрутизации.' : listMode ? 'Вставьте несколько правил списком и добавьте их в черновик маршрутизации.' : 'Добавьте один сайт, IP, LAN-устройство, порт или входящий поток в черновик маршрутизации.'}</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeRouteRuleDialog" aria-label="Закрыть">×</button>
        </div>
        ${editing ? '' : `
        <div class="segmented route-dialog-mode" aria-label="Режим добавления правил">
          <button type="button" class="${!listMode && !presetsMode ? 'active' : ''}" data-route-rule-mode="single">Одно правило</button>
          <button type="button" class="${listMode ? 'active' : ''}" data-route-rule-mode="list">Список правил</button>
          <button type="button" class="${presetsMode ? 'active' : ''}" data-route-rule-mode="presets">Подборки</button>
        </div>
        `}
        ${presetsMode ? `
        <div class="preset-check-list route-dialog-presets">
          <button class="preset-create" type="button" data-action="newRoutePreset">Добавить свою подборку</button>
          ${customEntries.length ? `
            <div class="preset-group-title">Мои подборки</div>
            ${customEntries.map(([key, preset]) => {
              const install = routePresetInstallSummary(key);
              const label = routePresetInstallLabel(key);
              return `
              <label class="preset-check custom ${selected.has(key) ? 'active' : ''} ${install.installed ? 'installed' : install.partial ? 'partial' : ''}">
                <input type="checkbox" data-route-preset-check="${key}" ${selected.has(key) ? 'checked' : ''} ${install.installed ? 'disabled' : ''} />
                <span class="checkmark"></span>
                ${routePresetIconView(escapeHtml, key, preset)}
                <span class="preset-check-copy">
                  <strong>${escapeHtml(preset.title)}</strong>
                  <small>${sourceBadge('local')} ${escapeHtml(preset.detail ? `${preset.detail} · ${ruleCountLabel(routePresetConditionCount(key))}` : ruleCountLabel(routePresetConditionCount(key)))}</small>
                  ${label ? `<em class="preset-install-badge">${escapeHtml(label)}</em>` : ''}
                </span>
                <span class="preset-check-actions">
                  <button class="preset-edit" type="button" data-route-preset-edit="${key}">Править</button>
                  <button class="preset-delete" type="button" data-route-preset-delete="${key}">Удалить</button>
                </span>
              </label>
            `;
            }).join('')}
          ` : ''}
          <div class="preset-group-title">Подборки</div>
          ${builtinRoutePresetEntries().map(([key, preset]) => {
            const install = routePresetInstallSummary(key);
            const label = routePresetInstallLabel(key);
            return `
            <label class="preset-check ${selected.has(key) ? 'active' : ''} ${install.installed ? 'installed' : install.partial ? 'partial' : ''}">
              <input type="checkbox" data-route-preset-check="${key}" ${selected.has(key) ? 'checked' : ''} ${install.installed ? 'disabled' : ''} />
              <span class="checkmark"></span>
              ${routePresetIconView(escapeHtml, key, preset)}
              <span class="preset-check-copy">
                <strong>${escapeHtml(preset.title)}</strong>
                <small>${sourceBadge(preset.source)} ${escapeHtml(`${preset.detail || describeRouteRule(preset.rule || routePresetRules(key)[0]).fullValue} · ${ruleCountLabel(routePresetConditionCount(key))}`)}</small>
                ${label ? `<em class="preset-install-badge">${escapeHtml(label)}</em>` : ''}
              </span>
              <button class="preset-edit" type="button" data-route-preset-edit="${key}">Править</button>
            </label>
          `;
          }).join('')}
        </div>
        ` : listMode ? `
        <div class="route-form route-form-dialog route-list-form">
          <div class="form-row wide">
            <label>Название списка</label>
            <input id="routeDslName" value="${escapeHtml(state.routeDslName)}" placeholder="Например: Discord, YouTube, Игровые сервисы" />
          </div>
          <div class="form-row wide">
            <label>Правила списком</label>
            <textarea id="routeDsl" class="dsl-editor route-dialog-dsl" spellcheck="false" placeholder="default: direct&#10;domain(domain:discord.com) -> proxy&#10;network(udp) &amp;&amp; ip(104.16.0.0/12) -> proxy&#10;source(192.168.50.157) -> direct">${escapeHtml(state.routeDsl)}</textarea>
            <small>Поддерживается формат строк маршрутизации: <code>domain(...)</code>, <code>ip(...)</code>, <code>source(...)</code>, <code>network(udp)</code> и назначение через <code>-> proxy/direct/block</code>.</small>
          </div>
          ${state.routeDslPreview ? dslPreviewView(state.routeDslPreview) : ''}
        </div>
        ` : `
        <div class="route-form route-form-dialog">
          <div class="form-row route-value">
            <label>Название</label>
            <input id="routeName" value="${escapeHtml(state.routeName)}" placeholder="Например: Discord, ТВ напрямую, ChatGPT" />
          </div>
          <div class="form-row">
            <label>Что направляем</label>
            <select id="routeKind">
              ${Object.entries(routeKinds)
                .map(([key, title]) => `<option value="${key}" ${state.routeKind === key ? 'selected' : ''}>${title}</option>`)
                .join('')}
            </select>
          </div>
          ${defaultMode ? `
          <div class="route-default-hint">
            <strong>Остальной трафик</strong>
            <span>Это правило сработает только после всех правил выше. Обычно его ставят последним: например, <code>default: direct</code>.</span>
          </div>
          ` : `
          <div class="form-row route-value">
            <div class="label-actions">
              <label>Значение</label>
              <button class="btn ghost compact" type="button" data-route-value-multiline="${useRouteValueTextarea ? '0' : '1'}">${useRouteValueTextarea ? 'Одной строкой' : 'Списком'}</button>
            </div>
            ${useRouteValueTextarea ? `
              <textarea id="routeValue" class="route-value-editor" spellcheck="false" placeholder="${escapeHtml(routePlaceholders[state.routeKind])}">${escapeHtml(routeValueEditorText)}</textarea>
              <small>${routeValueItems.length ? `${routeValueItems.length} знач.` : 'По одному значению на строку или через запятую.'}</small>
            ` : `
              <input id="routeValue" value="${escapeHtml(state.routeValue)}" placeholder="${escapeHtml(routePlaceholders[state.routeKind])}" />
            `}
          </div>
          ${routeLeasePicker()}
          `}
          <div class="form-row">
            <label>Тип цели</label>
            <div class="segmented route-target-switch" aria-label="Тип цели правила">
              <button type="button" class="${state.routeTargetType !== 'balancer' ? 'active' : ''}" data-route-target-type="outbound">Сервер</button>
              <button type="button" class="${state.routeTargetType === 'balancer' ? 'active' : ''}" data-route-target-type="balancer" ${balancers.length ? '' : 'disabled'}>Балансировщик</button>
            </div>
          </div>
          <div class="form-row route-target-row">
            <label>Куда отправляем</label>
            <div class="route-target-control">
              ${state.routeTargetType === 'balancer' ? `
                <select id="routeBalancer">
                  ${balancers.map((tag) => `<option value="${escapeHtml(tag)}" ${state.routeBalancer === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('')}
                </select>
              ` : `
                <select id="routeOutbound" class="route-outbound" data-route-outbound-picker>
                  ${outboundTargetOptions.map((option) => `<option value="${escapeHtml(option.tag)}" ${state.routeOutbound === option.tag ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                </select>
              `}
              <button class="btn secondary icon-btn route-target-test-btn ${state.busyAction === 'testRouteRuleTarget' ? 'is-busy' : ''}" type="button" data-action="testRouteRuleTarget" title="Проверить через выбранный сервер" aria-label="Проверить через выбранный сервер" ${state.busyAction === 'testRouteRuleTarget' ? 'disabled' : ''}>${state.busyAction === 'testRouteRuleTarget' ? '…' : '✓'}</button>
            </div>
          </div>
          ${routeRuleTestResultView(state.routeRuleTestResult)}
        </div>
        `}
        ${state.message ? `<p class="notice route-dialog-notice">${escapeHtml(state.message)}</p>` : ''}
        <div class="modal-actions">
          <button class="btn secondary" type="button" data-action="closeRouteRuleDialog">Отмена</button>
          ${presetsMode ? `
            <div class="split-actions">
              <button class="btn secondary" type="button" data-action="selectAllRoutePresets">Отметить все</button>
              <button class="btn secondary" type="button" data-action="clearRoutePresets">Снять выбор</button>
            </div>
            <button class="btn warning ${state.busyAction === 'applyRoutePresets' ? 'is-busy' : ''}" type="button" data-action="applyRoutePresets" ${state.selectedRoutePresets.length && state.busyAction !== 'applyRoutePresets' ? '' : 'disabled'}>${state.busyAction === 'applyRoutePresets' ? 'Добавляю...' : 'Добавить подборки'}</button>
          ` : listMode ? `
            <button class="btn secondary ${state.busyAction === 'previewRouteDsl' ? 'is-busy' : ''}" type="button" data-action="previewRouteDsl" ${state.busyAction === 'previewRouteDsl' ? 'disabled' : ''}>${state.busyAction === 'previewRouteDsl' ? 'Проверяю...' : 'Проверить список'}</button>
            <button class="btn warning ${state.busyAction === 'appendRouteDslFromDialog' ? 'is-busy' : ''}" type="button" data-action="appendRouteDslFromDialog" ${state.busyAction === 'appendRouteDslFromDialog' ? 'disabled' : ''}>${state.busyAction === 'appendRouteDslFromDialog' ? 'Добавляю...' : 'Добавить список'}</button>
          ` : `
            <button class="btn warning ${state.busyAction === (editing ? 'saveRouteEdit' : 'addRoute') ? 'is-busy' : ''}" type="button" data-action="${editing ? 'saveRouteEdit' : 'addRoute'}" ${state.busyAction === (editing ? 'saveRouteEdit' : 'addRoute') ? 'disabled' : ''}>${state.busyAction === (editing ? 'saveRouteEdit' : 'addRoute') ? 'Сохраняю...' : editing ? 'Сохранить правило' : 'Добавить правило'}</button>
          `}
        </div>
      </section>
    </div>
  `;
}

function routeBalancerDialog() {
  if (!state.routeBalancerDialog) return '';
  const balancers = routeBalancers();
  const targets = balancerTargetOptions();
  const selectedSelectors = new Set(splitRouteValues(state.routeBalancerSelectors));
  const selectorOrder = splitRouteValues(state.routeBalancerSelectors);
  const isRoundRobin = state.routeBalancerStrategy === 'roundRobin';
  const knownTargetTags = new Set(targets.map((target) => target.tag));
  const legacySelectors = [...selectedSelectors].filter((selector) => !knownTargetTags.has(selector));
  const orderedTargets = [...targets].sort((a, b) => {
    const aIndex = selectorOrder.indexOf(a.tag);
    const bIndex = selectorOrder.indexOf(b.tag);
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
    if (aIndex >= 0) return -1;
    if (bIndex >= 0) return 1;
    return 0;
  });
  const fallbackTargets = [...targets];
  if (state.routeBalancerFallback && !fallbackTargets.some((target) => target.tag === state.routeBalancerFallback)) {
    fallbackTargets.push({ tag: state.routeBalancerFallback, kind: 'custom', title: state.routeBalancerFallback, detail: 'текущий резерв из конфигурации' });
  }
  const matches = balancerSelectorMatches(state.routeBalancerSelectors);
  const strategies = [
    ['random', 'Случайно'],
    ['roundRobin', 'По очереди'],
    ['leastPing', 'Меньший ping'],
    ['leastLoad', 'Меньше нагрузка']
  ];
  const advancedObserver = strategyObserverType(state.routeBalancerStrategy);
  const advancedStrategy = Boolean(advancedObserver);
  const advancedHelp = advancedObserver === 'burstObservatory'
    ? 'Для этой стратегии Xray включает burst-наблюдение: проверяет серверы сериями и выбирает менее нагруженный доступный участник. Это расширенная настройка.'
    : 'Для этой стратегии Xray включает наблюдение за серверами: проверяет их HTTP-запросом и выбирает участника с меньшей задержкой. Ручная проверка RuOpenRay только показывает результат в интерфейсе.';
  return `
    <div class="modal-backdrop" data-action="closeRouteBalancerDialog">
      <section class="modal route-balancer-dialog" role="dialog" aria-modal="true" aria-labelledby="routeBalancerTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="routeBalancerTitle">Группа серверов</h2>
            <span>Создайте одну цель из нескольких серверов и выбирайте ее в правилах маршрутизации вместо конкретного сервера.</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeRouteBalancerDialog" aria-label="Закрыть">×</button>
        </div>

        <div class="balancer-layout">
          <section class="balancer-form">
            <div class="form-row">
              <label>Имя группы</label>
              <input id="routeBalancerTag" value="${escapeHtml(state.routeBalancerTag)}" placeholder="auto-proxy" />
            </div>
            <div class="form-row">
              <label>Стратегия</label>
              <select id="routeBalancerStrategy">
                ${strategies.map(([value, label]) => `<option value="${value}" ${state.routeBalancerStrategy === value ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </div>
            <div class="form-row wide">
              <label>Участники</label>
              <div class="balancer-target-list">
                ${orderedTargets.length ? orderedTargets.map((target) => {
                  const selected = selectedSelectors.has(target.tag);
                  const orderIndex = selectorOrder.indexOf(target.tag);
                  return `
                  <div class="balancer-target ${selected ? 'active' : ''}">
                    <input type="checkbox" data-balancer-selector="${escapeHtml(target.tag)}" ${selectedSelectors.has(target.tag) ? 'checked' : ''} />
                    <span class="balancer-kind">${target.kind === 'subscription' ? 'pool' : 'server'}</span>
                    <span>
                      <strong>${escapeHtml(target.title)}</strong>
                      <em>${escapeHtml(target.detail)}</em>
                    </span>
                    ${isRoundRobin && selected ? `
                      <span class="balancer-order-controls" aria-label="Порядок для round-robin">
                        <button type="button" data-balancer-selector-move="${escapeHtml(target.tag)}" data-direction="-1" ${orderIndex <= 0 ? 'disabled' : ''}>↑</button>
                        <button type="button" data-balancer-selector-move="${escapeHtml(target.tag)}" data-direction="1" ${orderIndex < 0 || orderIndex >= selectorOrder.length - 1 ? 'disabled' : ''}>↓</button>
                      </span>
                    ` : ''}
                  </div>
                `; }).join('') : '<p class="muted">Сначала добавьте хотя бы один сервер или подписку.</p>'}
                ${legacySelectors.map((selector) => {
                  const orderIndex = selectorOrder.indexOf(selector);
                  return `
                  <div class="balancer-target active legacy">
                    <input type="checkbox" data-balancer-selector="${escapeHtml(selector)}" checked />
                    <span class="balancer-kind">selector</span>
                    <span>
                      <strong>${escapeHtml(selector)}</strong>
                      <em>Сохраненный selector из текущей конфигурации.</em>
                    </span>
                    ${isRoundRobin ? `
                      <span class="balancer-order-controls" aria-label="Порядок для round-robin">
                        <button type="button" data-balancer-selector-move="${escapeHtml(selector)}" data-direction="-1" ${orderIndex <= 0 ? 'disabled' : ''}>↑</button>
                        <button type="button" data-balancer-selector-move="${escapeHtml(selector)}" data-direction="1" ${orderIndex < 0 || orderIndex >= selectorOrder.length - 1 ? 'disabled' : ''}>↓</button>
                      </span>
                    ` : ''}
                  </div>
                `; }).join('')}
              </div>
            </div>
            <div class="form-row">
              <label>Fallback</label>
              <select id="routeBalancerFallback">
                <option value="">Без резервного сервера</option>
                ${fallbackTargets.map((target) => `<option value="${escapeHtml(target.tag)}" ${state.routeBalancerFallback === target.tag ? 'selected' : ''}>${escapeHtml(target.title)}${target.kind === 'subscription' ? ' · подписка' : ''}</option>`).join('')}
              </select>
            </div>
            <div class="balancer-preview ${matches.length ? '' : 'empty'}">
              <strong>${matches.length ? `Подходит серверов: ${matches.length}` : 'Пока нет совпадений'}</strong>
              <span>${matches.length ? matches.join(', ') : 'Выберите серверы или подписки, которые уже есть в профиле.'}</span>
            </div>
            ${advancedStrategy ? `<p class="settings-warning compact"><strong>${escapeHtml(observerLabel(advancedObserver))}</strong><span>${escapeHtml(advancedHelp)}</span></p>` : ''}
          </section>

          <section class="balancer-list">
            ${balancers.length ? balancers.map((balancer, index) => {
              const selectors = Array.isArray(balancer.selector) ? balancer.selector.join(', ') : '';
              const strategy = balancer.strategy?.type || 'random';
              const used = routeRules().filter((rule) => rule.balancerTag === balancer.tag).length;
              return `<article class="balancer-row">
                <div>
                  <strong>${escapeHtml(balancer.tag || 'без имени')}</strong>
                  <span>${escapeHtml(balancerStrategyLabel(strategy))} · выбор: ${escapeHtml(selectors || 'не задан')} · правил: ${used}</span>
                </div>
                <button class="btn secondary" type="button" data-route-balancer-edit="${index}">Править</button>
                <button class="btn danger" type="button" data-route-balancer-delete="${index}" ${used ? 'disabled' : ''}>Удалить</button>
              </article>`;
            }).join('') : `<p class="muted">Групп пока нет. Создайте группу и затем выберите ее в правиле маршрутизации.</p>`}
          </section>
        </div>

        ${state.message ? `<p class="notice route-dialog-notice">${escapeHtml(state.message)}</p>` : ''}
        <div class="modal-actions">
          <button class="btn secondary" type="button" data-action="closeRouteBalancerDialog">Отмена</button>
          <button class="btn warning ${state.busyAction === 'saveRouteBalancer' ? 'is-busy' : ''}" type="button" data-action="saveRouteBalancer" ${state.busyAction === 'saveRouteBalancer' ? 'disabled' : ''}>${state.busyAction === 'saveRouteBalancer' ? 'Сохраняю...' : 'Сохранить'}</button>
        </div>
      </section>
    </div>
  `;
}

function selectedRouteGroupDialog() {
  if (!state.routeGroupDialog) return '';
  const selectedCount = (state.selectedRouteRuleIndexes || []).length;
  const iconPreview = routePresetIconView(escapeHtml, `custom:${state.routeGroupTitle || 'group'}`, {
    title: state.routeGroupTitle || 'Моя группа правил',
    detail: state.routeGroupDetail,
    icon: state.routeGroupIcon
  }, 'preset-editor-icon-preview');
  const normalizedIcon = normalizeIconifyIcon(state.routeGroupIcon);
  return `
    <div class="modal-backdrop" data-action="closeSelectedRouteGroupDialog">
      <section class="modal route-group-dialog" role="dialog" aria-modal="true" aria-labelledby="routeGroupTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="routeGroupTitle">Новая группа правил</h2>
            <span>Отмеченные правила будут собраны рядом и сохранены как локальная подборка. Иконку можно оставить пустой или указать Iconify ID.</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeSelectedRouteGroupDialog" aria-label="Закрыть">×</button>
        </div>
        <div class="preset-editor route-group-editor">
          <div class="preset-editor-grid">
            <label>
              <span>Название</span>
              <input id="routeGroupTitleInput" value="${escapeHtml(state.routeGroupTitle)}" placeholder="Например, Мои медиа через proxy" />
            </label>
            <label>
              <span>Описание</span>
              <input id="routeGroupDetailInput" value="${escapeHtml(state.routeGroupDetail)}" placeholder="Коротко, что входит в группу" />
            </label>
            <label class="preset-icon-field">
              <span>Иконка Iconify</span>
              <input id="routeGroupIconInput" value="${escapeHtml(state.routeGroupIcon)}" placeholder="simple-icons:youtube или https://icon-sets.iconify.design/..." />
              <small>${normalizedIcon ? `Будет использована ${escapeHtml(normalizedIcon)}` : 'Необязательно: если поле пустое, RuOpenRay подберет нейтральную иконку.'}</small>
            </label>
            <div class="preset-icon-preview">
              ${iconPreview}
              <em>${selectedCount} правил выбрано</em>
            </div>
          </div>
          <div class="preset-editor-hint">После создания группа появится в списке правил как единый блок. Порядок выбранных правил сохранится, а остальные правила останутся вокруг него.</div>
        </div>
        ${state.message ? `<p class="notice route-dialog-notice">${escapeHtml(state.message)}</p>` : ''}
        <div class="modal-actions">
          <button class="btn secondary" type="button" data-action="closeSelectedRouteGroupDialog">Отмена</button>
          <button class="btn warning" type="button" data-action="createSelectedRouteGroup" ${selectedCount >= 2 ? '' : 'disabled'}>Создать группу</button>
        </div>
      </section>
    </div>
  `;
}

function routeTargetReplaceDialog() {
  if (!state.routeTargetReplaceDialog) return '';
  const summary = routeTargetReplacementSummary();
  const selectedAvailable = summary.selectedCount > 0;
  return `
    <div class="modal-backdrop" data-action="closeRouteTargetReplaceDialog">
      <section class="modal route-replace-dialog" role="dialog" aria-modal="true" aria-labelledby="routeReplaceTitle" data-modal>
        <div class="modal-head route-replace-head">
          <div>
            <h2 id="routeReplaceTitle">Заменить серверы в правилах</h2>
            <span>Массово меняет цель правил в черновике маршрутизации. Служебные правила RuOpenRay не затрагиваются.</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeRouteTargetReplaceDialog" aria-label="Закрыть">×</button>
        </div>
        <div class="route-replace-grid">
          <label>
            <span>Что заменить</span>
            <select id="routeReplaceFrom" ${summary.sources.length ? '' : 'disabled'}>
              ${summary.sources.length
                ? summary.sources.map((option) => `<option value="${escapeHtml(option.value)}" ${state.routeReplaceFrom === option.value ? 'selected' : ''}>${escapeHtml(option.label)} · ${option.count}</option>`).join('')
                : '<option value="">Нет целей в пользовательских правилах</option>'}
            </select>
          </label>
          <label>
            <span>На что заменить</span>
            <select id="routeReplaceTo" ${summary.targets.length ? '' : 'disabled'}>
              ${summary.targets.length
                ? summary.targets.map((option) => `<option value="${escapeHtml(option.value)}" ${state.routeReplaceTo === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')
                : '<option value="">Нет доступных целей</option>'}
            </select>
          </label>
        </div>
        <div class="route-replace-scope" role="radiogroup" aria-label="Область замены">
          <label class="${state.routeReplaceScope !== 'selected' ? 'active' : ''}">
            <input type="radio" name="routeReplaceScope" value="all" ${state.routeReplaceScope !== 'selected' ? 'checked' : ''} />
            <span>Все пользовательские правила</span>
          </label>
          <label class="${state.routeReplaceScope === 'selected' ? 'active' : ''} ${selectedAvailable ? '' : 'disabled'}">
            <input type="radio" name="routeReplaceScope" value="selected" ${state.routeReplaceScope === 'selected' ? 'checked' : ''} ${selectedAvailable ? '' : 'disabled'} />
            <span>Только отмеченные${selectedAvailable ? ` · ${summary.selectedCount}` : ''}</span>
          </label>
        </div>
        <div class="route-replace-preview">
          <div>
            <strong>${escapeHtml(summary.fromLabel || 'не выбрано')} → ${escapeHtml(summary.toLabel || 'не выбрано')}</strong>
            <span>Будет изменено правил: ${summary.affectedCount}</span>
          </div>
          ${summary.sample.length ? `
            <ul>
              ${summary.sample.map((item) => `<li><span>#${item.index + 1}</span><strong>${escapeHtml(item.name)}</strong><em>${escapeHtml(item.detail)}</em></li>`).join('')}
              ${summary.affectedCount > summary.sample.length ? `<li><span>+${summary.affectedCount - summary.sample.length}</span><strong>еще правила</strong><em>они тоже попадут в замену</em></li>` : ''}
            </ul>
          ` : '<p class="muted">Нет правил, подходящих под выбранную замену.</p>'}
        </div>
        ${state.message ? `<p class="notice route-dialog-notice">${escapeHtml(state.message)}</p>` : ''}
        <div class="modal-actions">
          <button class="btn secondary" type="button" data-action="closeRouteTargetReplaceDialog">Отмена</button>
          <button class="btn warning" type="button" data-action="applyRouteTargetReplacement" ${summary.affectedCount && state.routeReplaceFrom && state.routeReplaceTo && state.routeReplaceFrom !== state.routeReplaceTo ? '' : 'disabled'}>Заменить в черновике</button>
        </div>
      </section>
    </div>
  `;
}

function routePresetDialog() {
  if (!state.routePresetDialog) return '';
  const editorOpen = Boolean(state.routePresetEditor);
  if (!editorOpen) return '';
  const editorPreview = state.routePresetEditPreview;
  const showCheckResult = state.routePresetEditChecked && editorPreview;
  const iconPreview = routePresetIconView(escapeHtml, state.routePresetEditor, {
    title: state.routePresetEditTitle,
    detail: state.routePresetEditDetail,
    icon: state.routePresetEditIcon
  }, 'preset-editor-icon-preview');
  const normalizedIcon = normalizeIconifyIcon(state.routePresetEditIcon);
  return `
    <div class="modal-backdrop" data-action="closeRoutePresetDialog">
      <section class="modal preset-dialog" role="dialog" aria-modal="true" aria-labelledby="routePresetTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="routePresetTitle">Редактор подборки</h2>
            <span>Поправьте название, описание и строки правил перед добавлением в маршрутизацию.</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeRoutePresetDialog" aria-label="Закрыть">×</button>
        </div>
          <div class="preset-editor">
            <div class="preset-editor-grid">
              <label>
                <span>Название</span>
                <input id="routePresetEditTitle" value="${escapeHtml(state.routePresetEditTitle)}" placeholder="Например, YouTube через прокси" />
              </label>
              <label>
                <span>Описание</span>
                <input id="routePresetEditDetail" value="${escapeHtml(state.routePresetEditDetail)}" placeholder="Коротко, что делает подборка" />
              </label>
              <label class="preset-icon-field">
                <span>Иконка Iconify</span>
                <input id="routePresetEditIcon" value="${escapeHtml(state.routePresetEditIcon)}" placeholder="simple-icons:telegram или ссылка icon-sets.iconify.design" />
                <small>${normalizedIcon ? `Будет использована ${escapeHtml(normalizedIcon)}` : 'Можно вставить ID iconify или URL страницы иконки.'}</small>
              </label>
              <div class="preset-icon-preview">
                ${iconPreview}
                <em>Предпросмотр</em>
              </div>
            </div>
            <label>
              <span>Правила</span>
              <textarea id="routePresetEditDsl" class="dsl-editor preset-editor-dsl" spellcheck="false" placeholder="domain(domain:...) -> proxy&#10;ip(.../24) -> proxy&#10;network(udp) &amp;&amp; ip(.../16) -> proxy&#10;source(192.168.1.50) -> direct">${escapeHtml(state.routePresetEditDsl)}</textarea>
            </label>
            ${showCheckResult ? routePresetCheckResultView(editorPreview) : '<div class="preset-editor-hint">Проверка покажет, сколько правил распознано, куда они направлены и какие строки требуют внимания.</div>'}
          </div>
          <div class="modal-actions">
            <button class="btn secondary" type="button" data-action="closeRoutePresetDialog">Отмена</button>
            <div class="split-actions">
              <button class="btn secondary ${state.busyAction === 'previewRoutePresetEdit' ? 'is-busy' : ''}" type="button" data-action="previewRoutePresetEdit" ${state.busyAction === 'previewRoutePresetEdit' ? 'disabled' : ''}>${state.busyAction === 'previewRoutePresetEdit' ? 'Проверяю...' : 'Проверить'}</button>
              <button class="btn secondary ${state.busyAction === 'saveRoutePresetEdit' ? 'is-busy' : ''}" type="button" data-action="saveRoutePresetEdit" ${state.busyAction === 'saveRoutePresetEdit' ? 'disabled' : ''}>${state.busyAction === 'saveRoutePresetEdit' ? 'Сохраняю...' : 'Сохранить подборку'}</button>
              <button class="btn warning ${state.busyAction === 'applyRoutePresetEdit' ? 'is-busy' : ''}" type="button" data-action="applyRoutePresetEdit" ${state.busyAction === 'applyRoutePresetEdit' ? 'disabled' : ''}>${state.busyAction === 'applyRoutePresetEdit' ? 'Добавляю...' : 'Добавить в правила'}</button>
            </div>
          </div>
      </section>
    </div>
  `;
}


  return {
    routeRuleDialog,
    routeBalancerDialog,
    selectedRouteGroupDialog,
    routeTargetReplaceDialog,
    routePresetDialog,
  };
}
