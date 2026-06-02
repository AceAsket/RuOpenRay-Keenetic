import { noticeView } from './notice-view.js';
import { routePresetIconView } from './route-visuals.js';

export function createRoutingView(deps) {
  const {
    state,
    escapeHtml,
    operationProgressView,
    stat,
    routeRules,
    routeStats,
    routeTargetOptions,
    visibleRoutingRuleItems,
    managedRoutingRuleItems,
    routeSectionDefinitions,
    orderedRouteList,
    describeRouteRule,
    routeRuleName,
    resolveRoutingAlias,
    dslPreviewView,
    configAnalysisView,
    builtinRoutePresetEntries,
    customRoutePresetEntries,
    ruleCountLabel,
    routePresetConditionCount,
    routePresetInstallSummary,
    routePresetInstallLabel,
    routeBalancers,
    observatoryPanel,
    balancerSelectorMatches,
    balancerObserverSummary,
    balancerStrategyLabel,
    balancerMembersView,
    currentSnifferSettings,
    tcpFastOpenDraftEnabled,
    firewallInfo,
    firewallReadyStatus,
    firewallPendingReasons,
    firewallPolicyPreview,
    firewallSafetyCheck,
    firewallDeviceChoices,
    firewallSelectedDevices,
    firewallCommands,
    geoEditorPanel,
    geoPanel,
  } = deps;

function routingRulesPanel() {
  const rules = routeRules();
  const stats = routeStats();
  const options = routeTargetOptions();
  const visibleRules = visibleRoutingRuleItems(80);
  const managedRules = managedRoutingRuleItems();
  const userRulesCount = rules.length - managedRules.length;
  const selectedRuleCount = (state.selectedRouteRuleIndexes || []).length;

  return `
    <section class="panel routing-simple-panel">
      <div class="panel-title">
        <div><h2>Правила маршрутизации</h2><span>${userRulesCount} пользовательских · ${managedRules.length} служебных скрыто. Xray читает правила сверху вниз.</span></div>
        <div class="split-actions">
          <button class="btn secondary ${state.configTesting ? 'is-busy' : ''}" data-action="test" ${state.configTesting || state.configApplying ? 'disabled' : ''}>${state.configTesting ? 'Проверяю...' : 'Проверить черновик'}</button>
        </div>
      </div>
      ${operationProgressView()}
      <div class="routing-summary">
        ${routeSectionDefinitions(stats).map((item) => `<article class="routing-summary-card routing-summary-${item.id}">
          <span>${escapeHtml(item.title)}</span>
          <strong>${item.count}</strong>
          <small>${escapeHtml(item.detail)}</small>
        </article>`).join('')}
      </div>
      <div class="route-tools">
        <button class="btn" data-action="openRouteRuleDialog">Добавить правило</button>
        <button class="btn secondary" data-action="openRouteTargetReplaceDialog" ${userRulesCount > 0 ? '' : 'disabled'}>Заменить серверы</button>
        <input id="routeSearch" value="${escapeHtml(state.routeSearch)}" placeholder="Найти: youtube, 192.168, прокси, direct..." />
        <button class="btn secondary" data-action="openSelectedRouteGroupDialog" ${selectedRuleCount >= 2 ? '' : 'disabled'}>Собрать группу${selectedRuleCount ? ` (${selectedRuleCount})` : ''}</button>
        <button class="btn secondary compact" data-action="disableSelectedRouteRules" ${selectedRuleCount ? '' : 'disabled'}>Отключить выбранные</button>
        <button class="btn danger compact" data-action="removeSelectedRouteRules" ${selectedRuleCount ? '' : 'disabled'}>Удалить выбранные</button>
        <button class="btn secondary compact" data-action="clearRouteRuleSelection" ${selectedRuleCount ? '' : 'disabled'}>Снять выбор</button>
        <button class="btn secondary" data-action="disableVisibleRoutes" ${visibleRules.length ? '' : 'disabled'}>Отключить найденные</button>
        <span class="muted">${visibleRules.length} из ${userRulesCount}</span>
      </div>
      ${noticeView(state, escapeHtml, { style: 'margin-top: 14px' })}
      <div class="route-table">
        ${orderedRouteList(visibleRules, options, rules.length, managedRules)}
      </div>
      ${state.disabledRouteRules.length ? `<div class="disabled-routes">
        <div class="disabled-routes-head">
          <strong>Отключенные правила</strong>
          <span>${state.disabledRouteRules.length} сохранено вне активного Xray-конфига</span>
          <button class="btn secondary" data-action="restoreAllDisabledRoutes">Вернуть все</button>
        </div>
        ${state.disabledRouteRules.slice(0, 20).map((item) => {
          const info = describeRouteRule(item.rule);
          return `<article class="disabled-route-row">
            <div>
              <strong>${escapeHtml(item.name || routeRuleName(item.rule, info))}</strong>
              <span>${escapeHtml(info.value)} → ${escapeHtml(info.outbound)}</span>
            </div>
            <button class="btn secondary" data-route-restore="${escapeHtml(item.id)}">Вернуть</button>
            <button class="btn danger" data-route-disabled-delete="${escapeHtml(item.id)}">Удалить</button>
          </article>`;
        }).join('')}
      </div>` : ''}
    </section>

    <details class="panel route-advanced">
      <summary>
        <span>Дополнительно</span>
        <small>Импорт правил списком и проверка анализа</small>
      </summary>
      <div class="dsl-compact">
        <div class="panel-title">
          <div><h2>Импорт правил списком</h2><span><code>domain(domain:discord.com) -> proxy</code>, слово proxy сейчас ведет на <code>${escapeHtml(resolveRoutingAlias('proxy'))}</code>.</span></div>
          <div class="split-actions">
            <button class="btn secondary" data-action="previewRouteDsl">Предпросмотр</button>
            <button class="btn secondary" data-action="analyzeConfig">Проверить</button>
            <button class="btn secondary" data-action="appendRouteDsl">Добавить</button>
            <button class="btn warning" data-action="replaceRouteDsl">Заменить</button>
          </div>
        </div>
        <div class="form-row">
          <label>Название списка</label>
          <input id="routeDslName" value="${escapeHtml(state.routeDslName)}" placeholder="Например: Discord, YouTube, Игровые сервисы" />
        </div>
        <textarea id="routeDsl" class="dsl-editor" spellcheck="false" placeholder="default: direct&#10;domain(domain:discord.com) -> proxy&#10;network(udp) &amp;&amp; ip(104.16.0.0/12) -> proxy&#10;source(192.168.50.157) -> direct">${escapeHtml(state.routeDsl)}</textarea>
        ${state.routeDslPreview ? dslPreviewView(state.routeDslPreview) : ''}
        ${configAnalysisView()}
      </div>
    </details>
  `;
}

function routingScenariosPanel() {
  const presetEntries = builtinRoutePresetEntries();
  const customEntries = customRoutePresetEntries();
  const sourceBadge = (source) => {
    const clean = source === 'github' ? 'github' : source === 'local' ? 'local' : 'builtin';
    return `<em class="scenario-source-badge source-${escapeHtml(clean)}">${escapeHtml(clean)}</em>`;
  };
  const presetSource = (preset, fallback = 'builtin') => preset?.source || fallback;
  const sourceCheck = state.routePresetSourceCheck;
  return `
    <section class="panel routing-scenarios-panel">
      <div class="panel-title">
        <div><h2>Сценарии маршрутизации</h2><span>Подборки правил можно открыть в редакторе, сохранить как свои или добавить через окно “Подборки”.</span></div>
        <div class="split-actions">
          <button class="btn secondary ${state.routePresetSourcesUpdating ? 'is-busy' : ''}" data-action="updateRoutePresetSources" ${state.routePresetSourcesUpdating ? 'disabled' : ''}>${state.routePresetSourcesUpdating ? 'Обновляю...' : 'Обновить источники'}</button>
          <button class="btn secondary" data-action="newRoutePreset">Добавить подборку</button>
        </div>
      </div>
      <details class="scenario-source-box" ${state.routePresetSources.length || state.routePresetSourceCheck ? 'open' : ''}>
        <summary>
          <strong>Источники сценариев</strong>
          <span>${state.routePresetSources.length} git/raw · сценарии не вшиваются в бинарник</span>
        </summary>
        <div class="scenario-source-form">
          <input id="routePresetSourceUrl" value="${escapeHtml(state.routePresetSourceUrl)}" placeholder="https://github.com/user/repo/blob/main/ruopenray-scenarios.json или raw URL" />
          <input id="routePresetSourceName" value="${escapeHtml(state.routePresetSourceName)}" placeholder="Название источника" />
          <label class="check-row compact"><input id="routePresetSourceAutoUpdate" type="checkbox" ${state.routePresetSourceAutoUpdate ? 'checked' : ''} /> Автообновлять ежедневно</label>
          <button class="btn secondary ${state.busyAction === 'checkRoutePresetSource' ? 'is-busy' : ''}" data-action="checkRoutePresetSource" ${state.busyAction === 'checkRoutePresetSource' ? 'disabled' : ''}>${state.busyAction === 'checkRoutePresetSource' ? 'Проверяю...' : 'Проверить'}</button>
          <button class="btn warning ${state.busyAction === 'saveRoutePresetSource' ? 'is-busy' : ''}" data-action="saveRoutePresetSource" ${state.busyAction === 'saveRoutePresetSource' ? 'disabled' : ''}>${state.busyAction === 'saveRoutePresetSource' ? 'Сохраняю...' : 'Сохранить'}</button>
        </div>
        ${sourceCheck ? `<div class="scenario-source-check ${sourceCheck.ok ? 'ok' : 'bad'}">
          <strong>${escapeHtml(sourceCheck.ok ? `${sourceCheck.name || 'Источник'} · ${sourceCheck.version || 'без версии'}` : 'Источник не прошел проверку')}</strong>
          <span>${escapeHtml(sourceCheck.ok ? `${sourceCheck.count || 0} сценариев · ${sourceCheck.rules || 0} правил` : sourceCheck.error || 'Ошибка проверки')}</span>
          ${(sourceCheck.warnings || []).length ? `<ul>${sourceCheck.warnings.slice(0, 8).map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
          ${Array.isArray(sourceCheck.presets) && sourceCheck.presets.length ? `<div class="scenario-source-preview">${sourceCheck.presets.map((item) => `<span>${escapeHtml(item.title || item.id)} · ${escapeHtml(String(item.rules || 0))}</span>`).join('')}</div>` : ''}
        </div>` : ''}
        ${state.routePresetSources.length ? `<div class="scenario-source-list">
          ${state.routePresetSources.map((source) => {
            const title = source.name || source.url;
            const meta = `${source.version || 'без версии'} · ${String(source.count || 0)} сценариев${source.error ? ` · ошибка: ${source.error}` : ''}`;
            return `<article>
              <label class="check-row compact scenario-source-toggle" title="${escapeHtml(source.enabled === false ? 'Источник отключен' : 'Источник включен')}"><input type="checkbox" data-route-preset-source-enabled="${escapeHtml(source.id)}" ${source.enabled === false ? '' : 'checked'} /></label>
              <span class="scenario-source-main"><strong>${escapeHtml(title)}</strong><em>${escapeHtml(meta)}</em></span>
              <button class="btn secondary compact" data-route-preset-source-update="${escapeHtml(source.id)}">Обновить</button>
              <button class="btn danger compact" data-route-preset-source-delete="${escapeHtml(source.id)}">Удалить</button>
            </article>`;
          }).join('')}
        </div>` : ''}
      </details>
      ${customEntries.length ? `
        <div class="scenario-section-title">Мои подборки</div>
        <div class="scenario-grid">
          ${customEntries.map(([key, preset]) => {
            const install = routePresetInstallSummary(key);
            const label = routePresetInstallLabel(key);
            return `<article class="scenario-card custom ${install.installed ? 'installed' : install.partial ? 'partial' : ''}">
            ${routePresetIconView(escapeHtml, key, preset)}
            <div>
              <strong>${escapeHtml(preset.title)}</strong>
              <span>${sourceBadge('local')} ${escapeHtml(preset.detail || 'Пользовательская подборка маршрутизации.')}</span>
            </div>
            <small>${ruleCountLabel(routePresetConditionCount(key))}</small>
            ${label ? `<em class="scenario-install-badge">${escapeHtml(label)}</em>` : ''}
            <span class="scenario-actions">
              <button class="btn secondary" data-route-preset-edit="${escapeHtml(key)}">Править</button>
              <button class="icon-btn danger" type="button" data-route-preset-delete="${escapeHtml(key)}" aria-label="Удалить подборку">×</button>
            </span>
          </article>`;
          }).join('')}
        </div>
      ` : ''}
      <div class="scenario-section-title">Подборки</div>
      <div class="scenario-grid">
        ${presetEntries.map(([key, preset]) => {
          const install = routePresetInstallSummary(key);
          const label = routePresetInstallLabel(key);
          return `<article class="scenario-card ${install.installed ? 'installed' : install.partial ? 'partial' : ''}">
          ${routePresetIconView(escapeHtml, key, preset)}
          <div>
            <strong>${escapeHtml(preset.title)}</strong>
            <span>${sourceBadge(presetSource(preset))} ${escapeHtml(preset.detail || 'Один набор условий для правила маршрутизации.')}</span>
          </div>
          <small>${ruleCountLabel(routePresetConditionCount(key))}</small>
          ${label ? `<em class="scenario-install-badge">${escapeHtml(label)}</em>` : ''}
          <button class="btn secondary" data-route-preset-edit="${escapeHtml(key)}">Править</button>
        </article>`;
        }).join('')}
      </div>
    </section>
  `;
}

function balancerHistoryEvents(tags = []) {
  const history = state.serverCheckHistoryByTag || {};
  return tags
    .flatMap((tag) => (Array.isArray(history[tag]) ? history[tag] : []).map((item) => ({ ...item, tag: item.tag || tag })))
    .sort((a, b) => new Date(b.checkedAt || 0).getTime() - new Date(a.checkedAt || 0).getTime());
}

function balancerHistoryLabel(item = {}) {
  const latency = Number(item.latencyMs || item.httpLatencyMs || item.endpointLatencyMs || item.pingLatencyMs || 0);
  const status = item.ok ? 'доступен' : item.error ? 'ошибка' : 'нет ответа';
  return `${item.tag || 'сервер'}: ${status}${latency ? ` · ${Math.round(latency)} мс` : ''}`;
}

function balancerHistoryTime(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return 'время неизвестно';
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function balancerHistoryView(tags = []) {
  const events = balancerHistoryEvents(tags);
  if (!tags.length) return '';
  if (!events.length) {
    return `<div class="balancer-history muted">Истории проверок пока нет. Запустите ручную проверку или включите наблюдение для участников группы.</div>`;
  }
  const failed = events.filter((item) => item.ok === false).length;
  const last = events[0];
  return `<div class="balancer-history">
    <div class="balancer-history-head">
      <strong>История проверок</strong>
      <span>${events.length} записей · отказов: ${failed} · последняя: ${escapeHtml(balancerHistoryTime(last.checkedAt))}</span>
    </div>
    <div class="balancer-history-strip">
      ${events.slice(0, 8).map((item) => `<span class="${item.ok ? 'ok' : 'bad'}" title="${escapeHtml(balancerHistoryLabel(item))}">
        ${escapeHtml(item.ok ? 'ok' : 'fail')} · ${escapeHtml(balancerHistoryTime(item.checkedAt))}
      </span>`).join('')}
    </div>
  </div>`;
}

function balancerHistorySettingsView() {
  return `<div class="balancer-history-settings">
    <div>
      <strong>История проверок</strong>
      <span>RuOpenRay хранит последние результаты на роутере: это помогает увидеть, когда серверы в группе отваливались.</span>
    </div>
    <label>На сервер
      <input id="serverCheckHistoryLimit" type="number" min="0" max="200" value="${escapeHtml(state.serverCheckHistoryLimit)}" />
    </label>
    <label>Период, часов
      <input id="serverCheckHistoryRetentionHours" type="number" min="1" max="2160" value="${escapeHtml(state.serverCheckHistoryRetentionHours)}" />
    </label>
    <button class="btn secondary ${state.serverCheckHistorySaving ? 'is-busy' : ''}" data-action="saveServerCheckHistorySettings" ${state.serverCheckHistorySaving ? 'disabled' : ''}>${state.serverCheckHistorySaving ? 'Сохраняю...' : 'Сохранить'}</button>
  </div>`;
}

function routingBalancersPanel() {
  const balancers = routeBalancers();
  return `
    ${observatoryPanel()}
    <section class="panel routing-balancers-panel">
      <div class="panel-title">
        <div><h2>Группы серверов</h2><span>Правило может вести не в один сервер, а в группу: случайно, по очереди, по меньшему ping или по меньшей нагрузке. Для выбора по задержке нужно наблюдение Xray, для выбора по нагрузке — burst-наблюдение.</span></div>
        <button class="btn warning" data-action="openRouteBalancerDialog">Добавить</button>
      </div>
      ${balancerHistorySettingsView()}
      <div class="balancer-list wide">
        ${balancers.length ? balancers.map((balancer, index) => {
          const selectors = Array.isArray(balancer.selector) ? balancer.selector.join(', ') : '';
          const strategy = balancer.strategy?.type || 'random';
          const used = routeRules().filter((rule) => rule.balancerTag === balancer.tag).length;
          const matched = balancerSelectorMatches(selectors);
          const observer = balancerObserverSummary(balancer);
          return `<article class="balancer-row">
            <div>
              <div class="server-meta-chips balancer-meta-chips">
                <span class="server-chip ${used ? 'ok' : 'muted'}">${escapeHtml(ruleCountLabel(used))}</span>
                <span class="server-chip ${matched.length ? 'info' : 'muted'}">${escapeHtml(`${matched.length} серверов`)}</span>
                <span class="server-chip ${observer.tone}">${escapeHtml(observer.label)}</span>
              </div>
              <strong>${escapeHtml(balancer.tag || 'без имени')}</strong>
              <span>${escapeHtml(balancerStrategyLabel(strategy))} · выбор: ${escapeHtml(selectors || 'не задан')} · правил: ${used}${balancer.fallbackTag ? ` · резерв: ${balancer.fallbackTag}` : ''}</span>
              ${balancerMembersView(matched)}
              ${balancerHistoryView(matched)}
            </div>
            <button class="btn secondary" type="button" data-route-balancer-edit="${index}">Править</button>
            <button class="btn danger" type="button" data-route-balancer-delete="${index}" ${used ? 'disabled' : ''}>Удалить</button>
          </article>`;
        }).join('') : `<p class="muted">Групп пока нет. Создайте группу, если хотите переключать серверы случайно, по очереди или по меньшей задержке.</p>`}
      </div>
    </section>
  `;
}

function interceptAdvancedSections() {
  const sniffer = currentSnifferSettings();
  const tfo = state.tcpFastOpen || {};
  const tfoDraft = tcpFastOpenDraftEnabled();
  const quicBlocked = state.firewallBlockQuic;
  const snifferWantsQuic = sniffer.mode === 'http-tls-quic';
  return `
    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>Сниффер Xray</h2><span>Расширенная настройка для прозрачного перехвата: Xray извлекает домен из HTTP/TLS/QUIC и использует его в правилах маршрутизации.</span></div>
      </div>
      <div class="advanced-grid">
        <div class="settings-field wide">
          <label>Режим</label>
          <div class="segmented settings-log-levels" aria-label="Режим сниффера">
            ${[
              ['off', 'Выключено'],
              ['http-tls', 'HTTP + TLS'],
              ['http-tls-quic', 'HTTP + TLS + QUIC']
            ].map(([value, label]) => `<button type="button" class="${sniffer.mode === value ? 'active' : ''}" data-sniffer-mode="${value}">${label}</button>`).join('')}
          </div>
          <small>${sniffer.targets ? `Будет применено к входам: ${sniffer.targets}` : 'Входящий поток пока не найден. Подготовьте перехват в разделе “Перехват”.'}</small>
        </div>
        <label class="settings-check compact ${sniffer.routeOnly ? 'active' : ''}">
          <input id="snifferRouteOnly" type="checkbox" ${sniffer.routeOnly ? 'checked' : ''} ${sniffer.mode === 'off' ? 'disabled' : ''} />
          <span><strong>Только для маршрутизации</strong><em>Безопасный режим: домен используется для правил, но destination не подменяется.</em></span>
        </label>
        <div class="settings-field wide">
          <label>Исключенные домены</label>
          <textarea id="snifferExcluded" rows="4" ${sniffer.mode === 'off' ? 'disabled' : ''} placeholder="bank.example.com&#10;*.local">${escapeHtml(sniffer.excluded)}</textarea>
          <small>Добавляйте банки, локальные сервисы, captive portal и устройства, которые плохо переносят sniffing.</small>
        </div>
      </div>
    </section>

    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>QUIC и HTTP/3</h2><span>Это общий переключатель для сниффера и firewall-перехвата: либо пропускаем QUIC в Xray, либо режем UDP/443 и заставляем браузеры перейти на TCP.</span></div>
      </div>
      <div class="advanced-grid two">
        <button type="button" class="advanced-card ${!quicBlocked ? 'active' : ''}" data-quic-policy="allow">
          <strong>Разрешить QUIC</strong>
          <span>Подходит для TPROXY и сниффера HTTP + TLS + QUIC. Xray увидит UDP/443, если transparent-схема готова.</span>
        </button>
        <button type="button" class="advanced-card ${quicBlocked ? 'active' : ''}" data-quic-policy="block">
          <strong>Блокировать QUIC</strong>
          <span>Firewall отбросит UDP/443 до Xray. Браузеры обычно откатываются на TCP, что полезно для REDIRECT и простого TCP-прокси.</span>
        </button>
      </div>
      ${quicBlocked && snifferWantsQuic ? `<div class="settings-warning"><strong>Конфликт</strong><span>В сниффере выбран QUIC, но Block QUIC его отрежет на firewall-уровне. Либо разрешите QUIC, либо переключите сниффер на HTTP + TLS.</span></div>` : ''}
      ${!quicBlocked && state.firewallRouterMode === 'redirect' ? `<div class="settings-warning"><strong>REDIRECT</strong><span>REDIRECT работает в основном с TCP. Если используете его как основной режим роутера, лучше включить блокировку QUIC.</span></div>` : ''}
    </section>

    <section class="panel settings-section">
      <div class="panel-title">
        <div><h2>TCP Fast Open</h2><span>Может ускорять установку TCP-соединений, если поддерживается ядром, провайдером и сервером. На слабых роутерах лучше включать осознанно.</span></div>
      </div>
      <div class="settings-info-grid">
        <article><span>Система OpenWrt</span><strong>${escapeHtml(tfo.available ? (tfo.enabled ? 'включено' : 'выключено') : 'недоступно')}</strong></article>
        <article><span>Значение sysctl</span><strong>${escapeHtml(tfo.value ?? '—')}</strong></article>
        <article><span>Черновик Xray</span><strong>${escapeHtml(tfoDraft ? 'включен' : 'выключен')}</strong></article>
        <article><span>Файл sysctl</span><strong>${escapeHtml(tfo.persistentPath || '/etc/sysctl.d/90-ruopenray-tcp-fastopen.conf')}</strong></article>
      </div>
      <div class="toolbar">
        <button class="btn secondary ${state.tcpFastOpenSaving && state.busyAction === 'enableTcpFastOpenSystem' ? 'is-busy' : ''}" data-action="enableTcpFastOpenSystem" ${state.tcpFastOpenSaving ? 'disabled' : ''}>${state.tcpFastOpenSaving && state.busyAction === 'enableTcpFastOpenSystem' ? 'Включаю...' : 'Включить в системе'}</button>
        <button class="btn secondary ${state.tcpFastOpenSaving && state.busyAction === 'disableTcpFastOpenSystem' ? 'is-busy' : ''}" data-action="disableTcpFastOpenSystem" ${state.tcpFastOpenSaving ? 'disabled' : ''}>${state.tcpFastOpenSaving && state.busyAction === 'disableTcpFastOpenSystem' ? 'Выключаю...' : 'Выключить в системе'}</button>
        <button class="btn" data-action="enableTcpFastOpenDraft">Включить в Xray</button>
        <button class="btn secondary" data-action="disableTcpFastOpenDraft">Выключить в Xray</button>
        <button class="btn warning ${state.configTesting ? 'is-busy' : ''}" data-action="test" ${state.configTesting || state.configApplying ? 'disabled' : ''}>${state.configTesting ? 'Проверяю...' : 'Проверить черновик'}</button>
      </div>
    </section>

  `;
}

function interceptAdvancedAccordion() {
  return `
    <details class="panel intercept-details" data-details-key="intercept-advanced-options">
      <summary>
        <span>
          <strong>Расширенные сетевые опции</strong>
          <em>Сниффер Xray, QUIC/HTTP3 и TCP Fast Open. Обычно это трогают после базовой настройки перехвата.</em>
        </span>
        <b>Открыть</b>
      </summary>
      <div class="intercept-details-body">
        ${interceptAdvancedSections()}
      </div>
    </details>
  `;
}

function routingPanel() {
  const routingTabs = [
    ['rules', 'Правила'],
    ['scenarios', 'Сценарии'],
    ['intercept', 'Перехват'],
    ['leaks', 'Защита от утечек'],
    ['geo', 'Geo'],
    ['geo-editor', 'Редактор geo']
  ];
  const view = routingTabs.some(([value]) => value === state.routingView) ? state.routingView : 'rules';
  const views = {
    rules: routingRulesPanel,
    scenarios: routingScenariosPanel,
    intercept: firewallPanel,
    leaks: leakProtectionPanel,
    geo: geoPanel,
    'geo-editor': geoEditorPanel
  };
  return `
    <section class="routing-nav-panel">
      <div class="routing-subnav" role="tablist" aria-label="Подменю маршрутизации">
        ${routingTabs.map(([value, label]) => `<button type="button" class="${view === value ? 'active' : ''}" data-routing-view="${value}">${label}</button>`).join('')}
      </div>
    </section>
    ${views[view]()}
  `;
}

function statusCard(title, ok, detail) {
  return `
    <article class="status-card ${ok ? 'ok' : 'warn'}">
      <span>${ok ? 'Готово' : 'Нужно проверить'}</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function firewallPanel() {
  const info = firewallInfo();
  const preview = firewallPolicyPreview();
  const deviceChoices = firewallDeviceChoices();
  const selectedDevices = new Set(state.firewallSelectedDevices);
  const transparentRows = info.transparent.length
    ? info.transparent.map((item) => `${item.tag || 'transparent'} · ${item.protocol || 'вход'} · порт ${item.port || 'не задан'}`).join('\n')
    : 'Входящий поток перехвата пока не найден.';
  const dnsRows = info.dnsOut.length
    ? info.dnsOut.map((item) => `${item.tag || 'dns'} · ${item.protocol}`).join('\n')
    : 'DNS-выход пока не найден.';
  const sourceRows = info.sourceRules.length
    ? info.sourceRules.slice(0, 8).map((rule) => `${rule.source.join(', ')} -> ${rule.outboundTag}`).join('\n')
    : 'Отдельных правил для LAN-устройств пока нет.';
  const missingTransparent = !info.transparent.length;

  return `
    <section class="route-hero firewall-hero intercept-hero">
      <div>
        <h2>Перехват трафика</h2>
        <p>Короткая настройка прозрачного перехвата: кого обрабатываем, какие порты берем и как рано отсекаем трафик напрямую или через прокси.</p>
      </div>
      <div class="route-score">
        <strong>${info.ready ? 'OK' : '3'}</strong>
        <span>${info.ready ? 'схема готова' : 'пункта готовности'}</span>
      </div>
    </section>

    <section class="panel intercept-start-panel">
      <div class="panel-title">
        <div><h2>Текущая схема</h2><span>Коротко: способ обработки, политика до Xray и охват устройств.</span></div>
      </div>
      ${firewallApplyComparisonView({ compact: true })}
      <div class="intercept-summary-grid">
        <article>
          <span>Способ</span>
          <strong>${escapeHtml(state.firewallRouterMode === 'redirect' ? 'REDIRECT' : 'TPROXY')}</strong>
          <small>${escapeHtml(state.firewallRouterMode === 'redirect' ? 'TCP-сценарий, QUIC лучше блокировать' : 'TCP+UDP, лучше для прозрачного перехвата')}</small>
        </article>
        <article>
          <span>Политика</span>
          <strong>${escapeHtml(preview.policyName)}</strong>
          <small>${escapeHtml(preview.policy)}</small>
        </article>
        <article>
          <span>Охват</span>
          <strong>${escapeHtml(preview.traffic)}</strong>
          <small>${escapeHtml(`Порты: ${preview.ports}`)}</small>
        </article>
        <article>
          <span>Готовность</span>
          <strong>${escapeHtml(info.ready ? 'Можно применять' : 'Нужно проверить')}</strong>
          <small>${escapeHtml([
            info.transparent.length ? 'вход найден' : 'нет входящего потока перехвата',
            info.dnsOut.length ? 'dns-out найден' : 'нет dns-out',
            info.localBypass.length ? 'direct есть' : 'нет local bypass'
          ].join(' · '))}</small>
        </article>
      </div>
      ${preview.warnings.length ? `<div class="settings-warning compact"><strong>Проверить</strong><span>${escapeHtml(preview.warnings.join(' '))}</span></div>` : ''}
      ${missingTransparent ? `<div class="settings-warning compact"><strong>Перехват не готов</strong><span>Сейчас найден только DNS/SOCKS-вход или входов нет. Для LAN-клиентов нужен входящий поток на порт перехвата.</span><button class="btn secondary" data-action="prepareTransparent">Подготовить черновик</button></div>` : ''}
    </section>

    <section class="panel intercept-compact-panel">
      <div class="panel-title">
        <div><h2>Основной сценарий</h2><span>Выберите способ обработки и сколько трафика отправлять в Xray.</span></div>
      </div>
      <div class="intercept-compact-grid">
        <div class="intercept-setting-card">
          <span class="intercept-label">Способ</span>
          <div class="segmented compact intercept-segmented" role="group" aria-label="Способ перехвата">
            <button type="button" class="${state.firewallRouterMode === 'tproxy' ? 'active' : ''}" data-firewall-router-mode="tproxy">TPROXY</button>
            <button type="button" class="${state.firewallRouterMode === 'redirect' ? 'active' : ''}" data-firewall-router-mode="redirect">REDIRECT</button>
          </div>
          <small>${state.firewallRouterMode === 'redirect' ? 'Проще для TCP. Для UDP/QUIC лучше включить блокировку QUIC.' : 'Рекомендуется: TCP+UDP, сохраняет исходное назначение.'}</small>
        </div>
        <div class="intercept-setting-card wide">
          <span class="intercept-label">Что отправляем в Xray</span>
          <div class="intercept-choice-list">
            <button type="button" class="${state.firewallBypassMode === 'off' ? 'active' : ''}" data-firewall-bypass-mode="off">
              <strong>Все выбранное</strong>
              <em>Xray сам решает по правилам: proxy, direct или block.</em>
            </button>
            <button type="button" class="${state.firewallBypassMode === 'bypass' ? 'active' : ''}" data-firewall-bypass-mode="bypass">
              <strong>Direct мимо Xray</strong>
              <em>Direct-адреса не нагружают Xray, остальное идет в правила.</em>
            </button>
            <button type="button" class="${state.firewallBypassMode === 'redirect' ? 'active' : ''}" data-firewall-bypass-mode="redirect">
              <strong>Только прокси</strong>
              <em>В Xray попадает только то, что заранее отмечено для прокси.</em>
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="panel intercept-compact-panel">
      <div class="panel-title">
        <div><h2>Охват</h2><span>Клиенты, порты и QUIC. Обычно достаточно «все LAN» и порты 80/443.</span></div>
      </div>
      <div class="intercept-compact-grid">
        <div class="intercept-setting-card wide">
          <span class="intercept-label">Клиенты</span>
          <div class="segmented compact intercept-segmented three" role="group" aria-label="Устройства">
            <button type="button" class="${state.firewallDeviceMode === 'all' ? 'active' : ''}" data-firewall-device-mode="all">Все LAN</button>
            <button type="button" class="${state.firewallDeviceMode === 'selected' ? 'active' : ''}" data-firewall-device-mode="selected">Только выбранные</button>
            <button type="button" class="${state.firewallDeviceMode === 'exclude' ? 'active' : ''}" data-firewall-device-mode="exclude">Исключить</button>
          </div>
          <small>${escapeHtml(preview.traffic)}</small>
        </div>
        <div class="intercept-setting-card">
          <span class="intercept-label">Порты</span>
          <div class="segmented compact intercept-segmented" role="group" aria-label="Режим портов">
            <button type="button" class="${state.firewallPortMode === 'all' ? 'active' : ''}" data-firewall-port-mode="all">Все</button>
            <button type="button" class="${state.firewallPortMode !== 'all' ? 'active' : ''}" data-firewall-port-mode="custom">Список</button>
          </div>
          ${state.firewallPortMode === 'all' ? '<small>Все TCP/UDP-порты в выбранной области клиентов.</small>' : `
            <input id="firewallPorts" value="${escapeHtml(state.firewallPorts)}" placeholder="80,443,50000-65535" />
          `}
        </div>
        <label class="settings-check compact intercept-quic-toggle ${state.firewallBlockQuic ? 'active' : ''}">
          <input id="firewallBlockQuic" type="checkbox" ${state.firewallBlockQuic ? 'checked' : ''} />
          <span><strong>Блокировать QUIC</strong><em>UDP/443 режется до Xray, браузеры переходят на TCP.</em></span>
        </label>
        <label class="settings-check compact intercept-quic-toggle ${state.firewallDnsIntercept ? 'active' : ''}">
          <input id="firewallDnsIntercept" type="checkbox" ${state.firewallDnsIntercept ? 'checked' : ''} />
          <span><strong>Перехватывать DNS</strong><em>UDP/TCP 53 отправляется в Xray DNS, даже если основные порты только 80/443.</em></span>
        </label>
      </div>
      <div class="firewall-device-list">
        ${deviceChoices.length ? deviceChoices.slice(0, 16).map((device) => `<label class="firewall-device ${selectedDevices.has(device.ip) ? 'active' : ''}">
          <input type="checkbox" data-firewall-device="${escapeHtml(device.ip)}" ${selectedDevices.has(device.ip) ? 'checked' : ''} />
          <span><strong>${escapeHtml(device.name || device.ip)}</strong><em>${escapeHtml([device.ip, device.mac].filter(Boolean).join(' · '))}</em></span>
        </label>`).join('') : '<p class="muted">DHCP leases пока не найдены. Устройства можно добавить в разделе LAN-устройств, после этого они появятся здесь.</p>'}
      </div>
    </section>

    ${interceptAdvancedAccordion()}

    ${firewallApplyPanel()}

    <details class="panel intercept-details" data-details-key="intercept-xray-prep">
      <summary>
        <span>
          <strong>Техническая подготовка Xray</strong>
          <em>Что найдено в конфигурации и какие части можно добавить в черновик.</em>
        </span>
        <b>Открыть</b>
      </summary>
      <div class="intercept-details-body">
    <div class="route-layout firewall-layout">
      <section class="panel">
        <div class="panel-title">
          <div><h2>Что найдено в конфигурации</h2><span>Сводка по текущему Xray JSON без терминальных команд.</span></div>
        </div>
        <div class="firewall-facts">
          <div>
            <label>Входящий поток перехвата</label>
            <pre class="mini-console">${escapeHtml(transparentRows)}</pre>
          </div>
          <div>
            <label>DNS-выход</label>
            <pre class="mini-console">${escapeHtml(dnsRows)}</pre>
          </div>
          <div>
            <label>LAN-устройства</label>
            <pre class="mini-console">${escapeHtml(sourceRows)}</pre>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">
          <div><h2>Подготовка Xray</h2><span>Добавляет недостающие входы, выходы и правила в черновик.</span></div>
        </div>
        <div class="firewall-steps">
          <div><strong>1</strong><span>Входящий поток перехвата принимает TCP/UDP после firewall.</span></div>
          <div><strong>2</strong><span>DNS-направление отдельно обрабатывает порт 53.</span></div>
          <div><strong>3</strong><span>Локальные адреса и LAN не уходят в прокси.</span></div>
        </div>
        <div class="toolbar">
          <button class="btn" data-action="prepareTransparent" ${state.configApplying || state.configTesting ? 'disabled' : ''}>Подготовить черновик</button>
          <button class="btn secondary ${state.configTesting ? 'is-busy' : ''}" data-action="test" ${state.configTesting || state.configApplying ? 'disabled' : ''}>${state.configTesting ? 'Проверяю...' : 'Проверить черновик'}</button>
        </div>
        ${noticeView(state, escapeHtml, { style: 'margin-top: 14px' })}
        ${xrayConfigTestLogView()}
      </section>
    </div>
      </div>
    </details>

    <details class="panel intercept-details" data-details-key="intercept-openwrt-commands">
      <summary>
        <span>
          <strong>Команды для OpenWrt</strong>
          <em>Активные или будущие правила nftables/TProxy для ручной проверки.</em>
        </span>
        <b>Открыть</b>
      </summary>
      <div class="intercept-details-body">
    <section class="panel intercept-command-panel">
      <div class="panel-title">
        <div><h2>Команды OpenWrt</h2><span>Если статус ниже говорит «Применено сейчас», это уже активные правила на роутере. Иначе это черновик для следующего применения.</span></div>
        <button class="btn secondary" data-action="copyFirewall">Скопировать</button>
      </div>
      ${firewallCommandsStatusView()}
      <pre class="console">${escapeHtml(firewallCommands())}</pre>
    </section>
      </div>
    </details>
  `;
}

function xrayConfigTestLogView() {
  const log = state.configTestLog || {};
  const text = [log.message, log.stdout, log.stderr].filter(Boolean).join('\n').trim();
  if (!text) return '';
  const time = log.at ? new Date(log.at).toLocaleTimeString() : 'последняя проверка';
  return `
    <details class="xray-test-log" data-details-key="intercept-xray-test-log">
      <summary>${log.ok ? 'Технический вывод Xray' : 'Подробности ошибки Xray'} · ${escapeHtml(time)}</summary>
      <pre class="mini-console">${escapeHtml(text)}</pre>
    </details>
  `;
}

function firewallApplyComparison() {
  const status = state.firewallStatus || {};
  const preview = firewallPolicyPreview();
  const routeSets = preview.routeSets || {};
  const ready = typeof firewallReadyStatus === 'function' ? firewallReadyStatus(status) : false;
  const pending = typeof firewallPendingReasons === 'function' ? firewallPendingReasons(status) : [];
  const currentRouter = status.active || status.persistent
    ? `${routerModeLabel(status.routerMode || state.firewallRouterMode)} · ${deviceModeLabel(status.deviceMode || 'all')} · ${portModeValue(status)}`
    : 'правила firewall еще не применены';
  const draftRouter = `${routerModeLabel(state.firewallRouterMode)} · ${preview.traffic} · ${preview.ports}`;
  const currentPolicy = status.active || status.persistent
    ? `${bypassModeLabel(status.bypassMode || 'off')} · DNS ${onOffLabel(status.dnsIntercept)} · QUIC ${onOffLabel(status.blockQuic)}`
    : 'не выбрана на роутере';
  const draftPolicy = `${bypassModeLabel(state.firewallBypassMode || 'off')} · DNS ${onOffLabel(state.firewallDnsIntercept)} · QUIC ${onOffLabel(state.firewallBlockQuic)}`;
  const currentDnsNftset = firewallDnsNftsetCurrent(status);
  const draftDnsNftset = firewallDnsNftsetDraft(routeSets, state.firewallBypassMode || 'off');
  const currentLeak = firewallLeakCurrent(status);
  const draftLeak = firewallLeakDraft(preview);
  const rows = [
    {
      title: 'Перехват LAN',
      current: currentRouter,
      draft: draftRouter,
      ok: ready || (status.active && sameText(currentRouter, draftRouter))
    },
    {
      title: 'Политика BYPASS/REDIRECT',
      current: currentPolicy,
      draft: draftPolicy,
      ok: ready || sameText(currentPolicy, draftPolicy)
    },
    {
      title: 'DNS nftset',
      current: currentDnsNftset,
      draft: draftDnsNftset,
      ok: dnsNftsetMatchesDraft(status, routeSets, state.firewallBypassMode || 'off')
    },
    {
      title: 'Защита от утечек',
      current: currentLeak,
      draft: draftLeak,
      ok: leakMatchesDraft(status, preview)
    }
  ];
  return { ready, pending, rows };
}

function firewallApplyComparisonView(options = {}) {
  const comparison = firewallApplyComparison();
  const limit = options.limit || comparison.rows.length;
  return `
    <div class="apply-state-panel ${comparison.ready ? 'ok' : 'warn'}">
      <div class="apply-state-head">
        <strong>${comparison.ready ? 'Сейчас применено' : 'Черновик отличается от роутера'}</strong>
        <span>${escapeHtml(comparison.ready ? 'Активные правила совпадают с выбранными настройками.' : comparison.pending.slice(0, 2).join(' · ') || 'Ниже видно, что изменится при применении.')}</span>
      </div>
      <div class="apply-state-grid">
        ${comparison.rows.slice(0, limit).map((row) => `
          <article class="${row.ok ? 'ok' : 'warn'}">
            <span>${escapeHtml(row.title)}</span>
            <strong>Сейчас: ${escapeHtml(row.current)}</strong>
            <small>Черновик: ${escapeHtml(row.draft)}</small>
          </article>
        `).join('')}
      </div>
      ${comparison.pending.length > 2 && !options.compact ? `<small class="apply-state-more">Еще отличия: ${escapeHtml(comparison.pending.slice(2, 8).join(' · '))}</small>` : ''}
    </div>
  `;
}

function firewallDnsNftsetCurrent(status) {
  const mode = status.bypassMode || 'off';
  if (!status.active && !status.persistent) return 'не применен';
  if (mode === 'bypass') {
    const count = status.directNftset?.count ?? (status.directNftset?.domains || []).length;
    return count ? `direct-домены в bypass4: ${count}` : 'direct-домены не подключены';
  }
  if (mode === 'redirect') {
    const count = status.proxyNftset?.count ?? (status.proxyNftset?.domains || []).length;
    return count ? `прокси-домены в proxy4: ${count}` : 'прокси-домены не подключены';
  }
  return 'geo/domain nftset не используется';
}

function firewallDnsNftsetDraft(routeSets, mode) {
  if (mode === 'bypass') {
    const count = (routeSets.directDomains || []).length + (routeSets.directGeosite || []).length + (routeSets.directExt || []).length;
    return count ? `direct-домены/geo: ${count}` : 'direct-домены не нужны';
  }
  if (mode === 'redirect') {
    const count = (routeSets.proxyDomains || []).length + (routeSets.proxyGeosite || []).length + (routeSets.proxyExt || []).length;
    return count ? `прокси-домены/geo: ${count}` : 'прокси-домены не заданы';
  }
  return 'OFF: DNS nftset не нужен';
}

function dnsNftsetMatchesDraft(status, routeSets, mode) {
  if (mode === 'off') return true;
  if (!status.active && !status.persistent) return false;
  if (mode === 'bypass') {
    const expected = (routeSets.directDomains || []).length;
    const actual = (status.directNftset?.domains || []).length;
    return expected === 0 || actual >= expected;
  }
  const expected = (routeSets.proxyDomains || []).length;
  const actual = (status.proxyNftset?.domains || []).length;
  return expected === 0 || actual >= expected;
}

function firewallLeakCurrent(status) {
  if (!status.active && !status.persistent) return 'не применена';
  if (!status.killSwitch) return 'выключена';
  const ips = (status.killSwitchIps || []).length;
  const domains = status.killSwitchDomainMode === 'nftset'
    ? (status.killSwitchNftset?.domains || []).length
    : (status.killSwitchDNSBlock?.domains || []).length;
  return `${domainModeLabel(status.killSwitchDomainMode)} · IP ${ips} · домены ${domains}`;
}

function firewallLeakDraft(preview) {
  if (!state.firewallKillSwitchEnabled) return 'выключена';
  const guard = preview.guard || {};
  const ips = (guard.ips || []).length + (guard.geoip || []).length;
  const domains = (guard.domains || []).length + (guard.geosite || []).length + (guard.ext || []).length;
  return `${domainModeLabel(state.firewallKillSwitchDomainMode)} · IP/geo ${ips} · домены/geo ${domains}`;
}

function leakMatchesDraft(status, preview) {
  if (!state.firewallKillSwitchEnabled) return status.killSwitch !== true;
  if (!status.killSwitch) return false;
  const guard = preview.guard || {};
  const expectedIps = (guard.ips || []).length;
  const actualIps = (status.killSwitchIps || []).length;
  const expectedDomains = (guard.domains || []).length;
  const actualDomains = state.firewallKillSwitchDomainMode === 'nftset'
    ? (status.killSwitchNftset?.domains || []).length
    : (status.killSwitchDNSBlock?.domains || []).length;
  return actualIps >= expectedIps && actualDomains >= expectedDomains;
}

function routerModeLabel(value) {
  return value === 'redirect' ? 'REDIRECT' : 'TPROXY';
}

function bypassModeLabel(value) {
  if (value === 'bypass') return 'BYPASS: direct мимо Xray';
  if (value === 'redirect') return 'REDIRECT: только proxy в Xray';
  return 'OFF: все выбранное в Xray';
}

function deviceModeLabel(value) {
  if (value === 'selected') return 'выбранные клиенты';
  if (value === 'exclude') return 'кроме выбранных';
  return 'весь LAN';
}

function portModeValue(status) {
  if (status.portMode === 'all') return 'все порты';
  const ports = Array.isArray(status.ports) ? status.ports.filter(Boolean) : [];
  return ports.length ? `порты ${ports.join(', ')}` : 'порты по списку';
}

function domainModeLabel(value) {
  return value === 'nftset' ? 'nftset по клиентам' : 'DNS-блокировка';
}

function onOffLabel(value) {
  return value ? 'вкл' : 'выкл';
}

function sameText(left, right) {
  return String(left || '').trim() === String(right || '').trim();
}

function firewallCommandsStatusView() {
  const status = state.firewallStatus || {};
  const ready = typeof firewallReadyStatus === 'function' ? firewallReadyStatus(status) : false;
  const pending = typeof firewallPendingReasons === 'function' ? firewallPendingReasons(status) : [];
  const hasActive = Boolean(status.active);
  const hasPersistent = Boolean(status.persistent);
  if (ready) {
    return `
      <div class="settings-warning compact ok">
        <strong>Применено сейчас</strong>
        <span>Активная таблица nftables и сохраненный файл совпадают с выбранными настройками.</span>
      </div>
    `;
  }
  if (hasActive || hasPersistent) {
    return `
      <div class="settings-warning compact">
        <strong>Черновик отличается</strong>
        <span>${escapeHtml(pending.slice(0, 3).join(' · ') || 'Ниже показано, что будет записано при следующем применении firewall.')}</span>
      </div>
    `;
  }
  return `
    <div class="settings-warning compact">
      <strong>Еще не применено</strong>
      <span>Ниже показан черновик команд, которые RuOpenRay сохранит и применит на OpenWrt.</span>
    </div>
  `;
}

function leakProtectionPanel() {
  const preview = firewallPolicyPreview();
  const status = state.firewallStatus || {};
  const protectedIps = preview.guard?.ips || [];
  const protectedDomains = preview.guard?.domains || [];
  const protectedGeoip = preview.guard?.geoip || [];
  const protectedGeosite = preview.guard?.geosite || [];
  const protectedExt = preview.guard?.ext || [];
  const protectedGeoCount = protectedGeoip.length + protectedGeosite.length + protectedExt.length;
  const invalidTargets = preview.guard?.invalid || [];
  const deviceChoices = firewallDeviceChoices();
  const selectedDevices = new Set(state.firewallKillSwitchSelectedDevices || []);
  const killSwitchNftset = status.killSwitchNftset || {};
  const killSwitchDNSBlock = status.killSwitchDNSBlock || {};
  const nftsetDomains = killSwitchNftset.domains || [];
  const dnsBlockDomains = killSwitchDNSBlock.domains || [];
  const domainMode = state.firewallKillSwitchDomainMode === 'nftset' ? 'nftset' : 'dns-block';
  const firewallApplied = typeof firewallReadyStatus === 'function' ? firewallReadyStatus(status) : false;
  const scopeLabel = state.firewallKillSwitchDeviceMode === 'selected'
    ? `только выбранные клиенты (${selectedDevices.size || 0})`
    : state.firewallKillSwitchDeviceMode === 'exclude'
      ? `весь LAN, кроме выбранных (${selectedDevices.size || 0})`
      : 'весь LAN';
  const totalTargets = protectedIps.length + protectedDomains.length + protectedGeoCount;
  const protectedDomainLikeCount = protectedDomains.length + protectedGeosite.length + protectedExt.length;
  const domainStatus = protectedDomainLikeCount
    ? domainMode === 'nftset'
      ? killSwitchNftset.active && nftsetDomains.length >= protectedDomains.length
        ? `dnsmasq nftset активен: ${nftsetDomains.length} доменов`
        : 'нажмите «Применить», чтобы подключить домены/geo к dnsmasq nftset'
      : killSwitchDNSBlock.active && dnsBlockDomains.length >= protectedDomains.length
        ? `точная DNS-блокировка активна: ${dnsBlockDomains.length} доменов`
        : 'нажмите «Применить», чтобы включить блокировку доменов/geo'
    : 'доменные цели не используются';
  const geoExpansion = state.firewallGeoExpansion || {};
  const geoExpansionActive = Number(geoExpansion.addedIps || 0) || Number(geoExpansion.addedDomains || 0) || Number(geoExpansion.skipped || 0) || (geoExpansion.warnings || []).length;
  const statusKillSwitchIps = Array.isArray(status.killSwitchIps) ? status.killSwitchIps : [];
  const statusKillSwitchDevices = Array.isArray(status.killSwitchDevices) ? status.killSwitchDevices : [];
  const domainApplied = !protectedDomainLikeCount
    ? true
    : domainMode === 'nftset'
      ? Boolean(killSwitchNftset.active && (nftsetDomains.length >= protectedDomains.length || protectedGeoCount))
      : Boolean(killSwitchDNSBlock.active && (dnsBlockDomains.length >= protectedDomains.length || protectedGeoCount));
  const leakChecks = [
    {
      ok: !state.firewallKillSwitchEnabled || firewallApplied,
      title: 'nftables',
      detail: state.firewallKillSwitchEnabled ? 'правила защиты включены в таблице ruopenray' : 'защита выключена'
    },
    {
      ok: !state.firewallKillSwitchEnabled || !protectedIps.length || protectedIps.every((item) => statusKillSwitchIps.includes(item)),
      title: 'IP и подсети',
      detail: protectedIps.length ? `${protectedIps.length} прямых целей · применено ${statusKillSwitchIps.length}` : 'прямые IP не заданы'
    },
    {
      ok: !state.firewallKillSwitchEnabled || domainApplied,
      title: domainMode === 'nftset' ? 'dnsmasq nftset' : 'dnsmasq block',
      detail: protectedDomainLikeCount ? domainStatus : 'доменные цели не заданы'
    },
    {
      ok: !state.firewallKillSwitchEnabled || state.firewallKillSwitchDeviceMode === 'all' || statusKillSwitchDevices.length >= selectedDevices.size,
      title: 'Клиенты LAN',
      detail: scopeLabel
    }
  ];

  return `
    <section class="route-hero firewall-hero intercept-hero">
      <div>
        <h2>Защита от утечек</h2>
        <p>Цифровая гигиена для адресов, которые нельзя выпускать напрямую: если Xray остановлен или VPN не работает, firewall не даст им уйти мимо прокси.</p>
      </div>
      <div class="route-score">
        <strong>${state.firewallKillSwitchEnabled ? totalTargets : 'OFF'}</strong>
        <span>${state.firewallKillSwitchEnabled ? 'целей под защитой' : 'защита выключена'}</span>
      </div>
    </section>

    <section class="panel intercept-compact-panel">
      <div class="panel-title">
        <div><h2>Не выпускать без Xray</h2><span>IP и подсети принудительно идут в Xray. Если Xray остановлен, прямой выход блокируется. Для доменов можно выбрать точную DNS-блокировку или nftset по клиентам.</span></div>
      </div>
      ${firewallApplyComparisonView({ limit: 4 })}
      <div class="leak-check-list">
        ${leakChecks.map((item) => `<article class="${item.ok ? 'ok' : 'warn'}">
          <i>${item.ok ? '✓' : '!'}</i>
          <span><strong>${escapeHtml(item.title)}</strong><em>${escapeHtml(item.detail)}</em></span>
        </article>`).join('')}
      </div>
      <div class="intercept-compact-grid">
        <label class="settings-check compact intercept-kill-toggle ${state.firewallKillSwitchEnabled ? 'active' : ''}">
          <input id="firewallKillSwitchEnabled" type="checkbox" ${state.firewallKillSwitchEnabled ? 'checked' : ''} />
          <span><strong>Включить защиту</strong><em>${escapeHtml(totalTargets ? `${totalTargets} целей: IP, домены или geo` : 'Добавьте IP, домены или geo-ссылки, которые нельзя выпускать без Xray.')}</em></span>
        </label>
        <div class="intercept-setting-card wide">
          <span class="intercept-label">Защищенные адреса</span>
          <textarea id="firewallKillSwitchTargets" rows="7" placeholder="162.159.140.0/24&#10;openai.com&#10;geoip:antifilter&#10;geosite:telegram&#10;ext:&quot;LoyalsoldierSite.dat:antifilter-community&quot;">${escapeHtml(state.firewallKillSwitchTargets || '')}</textarea>
          <small>Пишите по одному или через запятую: IPv4, IPv4-подсети, домены, geoip:code, geosite:code и ext:"file.dat:list". Geo-категории разворачиваются из установленных DAT перед применением.</small>
        </div>
        <div class="intercept-setting-card wide">
          <span class="intercept-label">Домены без Xray</span>
          <div class="segmented compact intercept-segmented two" role="group" aria-label="Режим защиты доменов">
            <button type="button" class="${domainMode === 'dns-block' ? 'active' : ''}" data-kill-switch-domain-mode="dns-block">DNS-блокировка</button>
            <button type="button" class="${domainMode === 'nftset' ? 'active' : ''}" data-kill-switch-domain-mode="nftset">nftset по клиентам</button>
          </div>
          <small>${domainMode === 'dns-block'
            ? 'dnsmasq будет отвечать 0.0.0.0/:: для этих доменов. Это точнее, но действует на всех клиентов, которые используют DNS роутера.'
            : 'dnsmasq будет наполнять nftset IP-адресами доменов. Это можно ограничить выбранными LAN-клиентами, но защита зависит от DNS-резолва.'}</small>
        </div>
      </div>

      <div class="leak-scope-panel">
        <div class="panel-title inline">
          <div><h2>Область действия</h2><span>Эта область применяется к IP/подсетям и к доменам в режиме nftset. DNS-блокировка действует на всех, кто использует DNS роутера.</span></div>
        </div>
        <div class="segmented compact intercept-segmented three" role="group" aria-label="Область защиты">
          <button type="button" class="${state.firewallKillSwitchDeviceMode === 'all' ? 'active' : ''}" data-kill-switch-device-mode="all">Весь LAN</button>
          <button type="button" class="${state.firewallKillSwitchDeviceMode === 'selected' ? 'active' : ''}" data-kill-switch-device-mode="selected">Только выбранные</button>
          <button type="button" class="${state.firewallKillSwitchDeviceMode === 'exclude' ? 'active' : ''}" data-kill-switch-device-mode="exclude">Кроме выбранных</button>
        </div>
        <div class="firewall-device-list leak-device-list">
          ${deviceChoices.length ? deviceChoices.slice(0, 16).map((device) => `<label class="firewall-device ${selectedDevices.has(device.ip) ? 'active' : ''}">
            <input type="checkbox" data-kill-switch-device="${escapeHtml(device.ip)}" ${selectedDevices.has(device.ip) ? 'checked' : ''} />
            <span><strong>${escapeHtml(device.name || device.ip)}</strong><em>${escapeHtml([device.ip, device.mac].filter(Boolean).join(' · '))}</em></span>
          </label>`).join('') : '<p class="muted">DHCP leases пока не найдены. Можно сначала открыть LAN-устройства или добавить правило по IP вручную.</p>'}
        </div>
      </div>

      <div class="intercept-summary-grid">
        <article>
          <span>Что применится</span>
          <strong>${escapeHtml(state.firewallKillSwitchEnabled ? 'защита включена' : 'защита выключена')}</strong>
          <small>${escapeHtml(state.firewallKillSwitchEnabled ? `${totalTargets} целей · ${scopeLabel}` : 'Firewall не будет добавлять правила защиты от прямого выхода.')}</small>
        </article>
        <article>
          <span>Firewall-защита</span>
          <strong>${escapeHtml(protectedIps.length ? `${protectedIps.length} IP/подсетей` : 'нет IP')}</strong>
          <small>Эти цели уйдут только через Xray. Если Xray недоступен, прямой выход блокируется.</small>
        </article>
        <article>
          <span>Домены</span>
          <strong>${escapeHtml(protectedDomains.length ? `${protectedDomains.length} в списке` : 'нет')}</strong>
          <small>${escapeHtml(domainStatus)}</small>
        </article>
        <article>
          <span>Geo</span>
          <strong>${escapeHtml(protectedGeoCount ? `${protectedGeoCount} ссылок` : 'нет')}</strong>
          <small>${escapeHtml(protectedGeoCount ? [...protectedGeoip.map((item) => `geoip:${item}`), ...protectedGeosite.map((item) => `geosite:${item}`), ...protectedExt].slice(0, 3).join(', ') : 'Можно использовать geoip/geosite/ext из DAT-файлов.')}</small>
        </article>
        <article>
          <span>Ошибки списка</span>
          <strong>${escapeHtml(invalidTargets.length ? `${invalidTargets.length}` : 'нет')}</strong>
          <small>${escapeHtml(invalidTargets.length ? invalidTargets.slice(0, 3).join(', ') : 'Список выглядит корректно.')}</small>
        </article>
        <article>
          <span>Режим firewall</span>
          <strong>${escapeHtml(state.firewallRouterMode === 'redirect' ? 'REDIRECT' : 'TPROXY')}</strong>
          <small>Защита применится вместе с текущей схемой перехвата.</small>
        </article>
      </div>
      ${state.firewallKillSwitchEnabled && protectedDomains.length && domainMode === 'dns-block' ? `<div class="settings-warning"><strong>Точная DNS-блокировка</strong><span>RuOpenRay пропишет ${escapeHtml(protectedDomains.length)} доменов в dnsmasq address и будет блокировать имя без накопления IP. Если клиент использует DoH или внешний DNS в обход роутера, нужен перехват DNS/DoH guard.</span></div>` : ''}
      ${state.firewallKillSwitchEnabled && protectedDomainLikeCount && domainMode === 'nftset' ? `<div class="settings-warning"><strong>nftset по клиентам</strong><span>RuOpenRay пропишет домены и доступные geosite/ext-категории в dnsmasq nftset. Это можно ограничить выбранными LAN-клиентами, но это уже защита по IP после резолва, а не точный DNS-ответ.</span></div>` : ''}
      ${state.firewallKillSwitchEnabled && protectedDomainLikeCount && domainMode === 'dns-block' && state.firewallKillSwitchDeviceMode !== 'all' ? `<div class="settings-warning"><strong>Область действия</strong><span>Точная DNS-блокировка в dnsmasq действует для всех LAN-клиентов, которые используют DNS роутера. Чтобы ограничить защиту выбранными клиентами, переключите режим доменов на nftset.</span></div>` : ''}
      ${state.firewallKillSwitchEnabled && !totalTargets ? `<div class="settings-warning"><strong>Нет целей</strong><span>Защита включена, но firewall пока нечего блокировать. Добавьте IP, подсеть, домен или geo-ссылку, например geoip:antifilter или geosite:telegram.</span></div>` : ''}
      ${geoExpansionActive ? `<div class="settings-warning compact ${geoExpansion.warnings?.length ? '' : 'ok'}"><strong>Geo-развертка</strong><span>${escapeHtml(`${geoExpansion.addedIps || 0} IP/подсетей · ${geoExpansion.addedDomains || 0} доменов · пропущено ${geoExpansion.skipped || 0}`)}${geoExpansion.warnings?.length ? ` · ${escapeHtml(geoExpansion.warnings.slice(0, 2).join('; '))}` : ''}</span></div>` : ''}
    </section>

    ${firewallApplyPanel()}
  `;
}

function firewallApplyPanel() {
  const status = state.firewallStatus || {};
  const active = Boolean(status.active);
  const persistent = Boolean(status.persistent);
  const tproxyReady = status.routerMode !== 'tproxy' || (status.ipRule && status.ipRoute && status.hotplug);
  const available = status.available !== false;
  const matchesSelection = typeof firewallReadyStatus === 'function' ? firewallReadyStatus(status) : true;
  const safety = typeof firewallSafetyCheck === 'function' ? firewallSafetyCheck() : { level: 'safe', items: [], hasDanger: false };
  const blockedBySafety = Boolean(safety.hasDanger && !state.firewallSafetyAccepted);
  const summary = active
    ? persistent
      ? 'активен и сохранен'
      : 'активен до перезапуска'
    : persistent
      ? 'сохранен, но не активен'
      : 'не применен';
  return `
    <section class="panel firewall-preview-panel intercept-apply-panel">
      <div class="panel-title">
        <div><h2>Применение</h2><span>Сохраняет nftables и, для TPROXY, policy routing после перезапуска firewall.</span></div>
        <div class="split-actions">
          <button class="btn secondary" data-action="refreshFirewallStatus" ${state.firewallSaving ? 'disabled' : ''}>Обновить</button>
          <button class="btn secondary" data-action="downloadFirewallRules" ${state.firewallSaving ? 'disabled' : ''}>Скачать правила</button>
          <button class="btn warning ${state.firewallSaving || state.configApplying ? 'is-busy' : ''}" data-action="apply" ${state.firewallSaving || state.configApplying || !available || blockedBySafety ? 'disabled' : ''}>${state.firewallSaving || state.configApplying ? 'Применяю изменения...' : 'Применить изменения'}</button>
          <button class="btn secondary" data-action="disableFirewall" ${state.firewallSaving || (!active && !persistent) ? 'disabled' : ''}>Отключить</button>
        </div>
      </div>
      ${operationProgressView()}
      ${firewallApplyComparisonView({ limit: 4 })}
      ${firewallSafetyPanel(safety, blockedBySafety)}
      <div class="firewall-preview-grid">
        <article><span>Состояние</span><strong>${escapeHtml(summary)}</strong><small>${escapeHtml(status.routerMode || state.firewallRouterMode)}</small></article>
        <article><span>nftables</span><strong>${escapeHtml(active ? 'таблица активна' : 'таблица не активна')}</strong><small>${escapeHtml(status.nftPath || '/etc/nftables.d/ruopenray.nft')}</small></article>
        <article><span>TPROXY route</span><strong>${escapeHtml(tproxyReady ? 'готово' : 'нужно восстановить')}</strong><small>${escapeHtml(`ip rule: ${status.ipRule ? 'есть' : 'нет'} · route: ${status.ipRoute ? 'есть' : 'нет'} · hotplug: ${status.hotplug ? 'есть' : 'нет'}`)}</small></article>
        <article><span>Модули</span><strong>${escapeHtml(status.tproxyModules?.ok === false ? 'не все установлены' : 'готово')}</strong><small>${escapeHtml(status.tproxyModules?.detail || 'проверяется на роутере')}</small></article>
        <article><span>Домены защиты</span><strong>${escapeHtml(status.killSwitchDNSBlock?.active ? `${status.killSwitchDNSBlock.count || 0} DNS` : status.killSwitchNftset?.active ? `${status.killSwitchNftset.count || 0} nftset` : 'не заданы')}</strong><small>${escapeHtml(status.killSwitchDNSBlock?.active ? 'dnsmasq address' : (status.killSwitchNftset?.set || 'inet ruopenray killswitch4'))}</small></article>
      </div>
      <details class="intercept-details compact" data-details-key="firewall-preview-nft">
        <summary>
          <span><strong>Preview nftables</strong><em>Что будет сохранено и применено на OpenWrt.</em></span>
          <b>Открыть</b>
        </summary>
        <pre class="mini-console">${escapeHtml(firewallCommands())}</pre>
      </details>
      ${!available ? `<div class="settings-warning"><strong>Недоступно</strong><span>nftables не найден. Постоянный перехват можно применить только на OpenWrt с firewall4/nft.</span></div>` : ''}
      ${status.needsPolicyFix ? `<div class="settings-warning"><strong>TPROXY</strong><span>nft-таблица есть, но policy routing неполный. Нажмите «Применить перехват», чтобы восстановить ip rule, route и hotplug.</span></div>` : ''}
    </section>
  `;
}

function firewallSafetyPanel(safety, blockedBySafety) {
  const items = safety?.items || [];
  if (!items.length) {
    return `
      <div class="firewall-safety-panel safe">
        <strong>Проверка безопасности</strong>
        <span>Опасных сочетаний не найдено. Перед применением все равно проверьте доступ к LuCI/SSH с локальной сети.</span>
      </div>
    `;
  }
  return `
    <div class="firewall-safety-panel ${escapeHtml(safety.level || 'warn')}">
      <div class="firewall-safety-head">
        <strong>Проверка безопасности</strong>
        <span>${safety.dangerCount ? `${escapeHtml(safety.dangerCount)} опасных пункта` : `${escapeHtml(safety.warningCount || items.length)} предупреждений`}</span>
      </div>
      <div class="firewall-safety-list">
        ${items.map((item) => `
          <article class="${item.level === 'danger' ? 'danger' : 'warn'}">
            <b>${item.level === 'danger' ? 'Стоп' : 'Проверить'}</b>
            <span><strong>${escapeHtml(item.title)}</strong><em>${escapeHtml(item.detail)}${item.fix ? ` ${item.fix}` : ''}</em></span>
          </article>
        `).join('')}
      </div>
      ${safety.hasDanger ? `
        <label class="settings-check compact firewall-risk-ack ${state.firewallSafetyAccepted ? 'active' : ''}">
          <input id="firewallSafetyAccepted" type="checkbox" ${state.firewallSafetyAccepted ? 'checked' : ''} />
          <span><strong>Понимаю риск и хочу применить</strong><em>${blockedBySafety ? 'Без подтверждения кнопка применения заблокирована.' : 'Подтверждение действует только до изменения настроек.'}</em></span>
        </label>
      ` : ''}
    </div>
  `;
}

  return {
    firewallApplyPanel,
    firewallPanel,
    interceptAdvancedAccordion,
    interceptAdvancedSections,
    routingBalancersPanel,
    routingPanel,
    routingRulesPanel,
    routingScenariosPanel,
  };
}
