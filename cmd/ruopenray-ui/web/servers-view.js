import { noticeView } from './notice-view.js';
import { countryPickerView } from './server-location-view.js';
import { parseServerEditJson, serverEditFields } from './server-edit-model.js';
import { countryFlagMarkup, countryNames, serverLocation } from './server-location.js';
import { fragmentOutboundDetail, isFragmentOutboundTag, serviceOutboundLabel } from './outbound-tags.js';

export function createServersView(deps) {
  const {
    activeProxyTag,
    checkForTag,
    configOutbounds,
    escapeHtml,
    isSystemOutbound,
    operationProgressView,
    outboundAddress,
    outboundTransport,
    outboundUsage,
    proxyOutbounds,
    proxyRuleStrategyStats,
    routingBalancersPanel,
    serverCheckButton,
    serverLocationChip,
    serverMetaChips,
    serverStats,
    serverTrafficView,
    state,
    stat,
  } = deps;

function serverActionButton({ label, icon, tone = 'secondary', attrs = '', busy = false, disabled = false }) {
  const icons = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z"/></svg>',
    connect: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
    active: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35"/><circle cx="11" cy="11" r="7"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.1 6.6"/><path d="M3 12A9 9 0 0 1 18.1 5.4"/><path d="M3 18v-5h5"/><path d="M21 6v5h-5"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  };
  const safeLabel = escapeHtml(label);
  return `<button type="button" class="server-action-icon ${tone} ${busy ? 'is-busy' : ''}" ${attrs} data-busy-label-inline="0" ${disabled ? 'disabled' : ''} title="${safeLabel}" aria-label="${safeLabel}">
    ${icons[icon] || ''}
  </button>`;
}

function serverActionState(label) {
  const safeLabel = escapeHtml(label);
  return `<span class="server-action-icon active" title="${safeLabel}" aria-label="${safeLabel}" role="status">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
  </span>`;
}

function subscriptionCandidateStatus(check, checking = false) {
  if (checking) return '<span class="server-chip warn subscription-check-status"><i></i>проверяю</span>';
  if (!check) return '<span class="server-chip warn subscription-check-status"><i></i>не проверен</span>';
  const latency = Number(check.latencyMs || check.httpLatencyMs || check.endpointLatencyMs || 0);
  const method = check.method === 'endpoint' ? 'TCP' : 'HTTP';
  if (check.ok) {
    return `<span class="server-chip ok subscription-check-status"><i></i>${escapeHtml(`${method} доступен${latency ? ` · ${latency} мс` : ''}`)}</span>`;
  }
  if (check.httpOk === false && check.endpointOk) {
    const endpointLatency = Number(check.endpointLatencyMs || 0);
    return `<span class="server-chip warn subscription-check-status"><i></i>${escapeHtml(`TCP открыт${endpointLatency ? ` · ${endpointLatency} мс` : ''} · HTTP нет`)}</span>`;
  }
  if (check.endpointOk === false) {
    return '<span class="server-chip bad subscription-check-status"><i></i>порт закрыт</span>';
  }
  const text = check.error ? `${method} нет ответа` : `${method} недоступен`;
  return `<span class="server-chip bad subscription-check-status"><i></i>${escapeHtml(text)}</span>`;
}

function subscriptionCandidateSearchText(candidate, index, location, address) {
  return [
    index + 1,
    candidate?.tag,
    candidate?.address,
    candidate?.port,
    candidate?.network,
    candidate?.security,
    location?.code,
    location?.label,
    countryNames[location?.code] || '',
    address
  ].filter(Boolean).join(' ').toLowerCase();
}

function serverCard(outbound, index, activeTag) {
  const tag = outbound?.tag || `outbound-${index + 1}`;
  const usage = outboundUsage(tag);
  const check = checkForTag(tag);
  const active = tag === activeTag;
  const connecting = state.pendingServerTag === tag;
  const checking = state.serverChecking && (!state.serverCheckingTags.length || state.serverCheckingTags.includes(tag));
  const meta = serverMetaChips(outbound, usage, check);
  return `<article class="server-row server-card ${active ? 'is-active' : ''}">
    <div class="server-identity">
      <span class="server-protocol">${escapeHtml(outbound?.protocol || 'unknown')}</span>
      <div class="server-main">
        <strong>${serverLocationChip(outbound)}${escapeHtml(tag)}</strong>
        <span>${escapeHtml(outboundAddress(outbound))}</span>
        ${meta}
      </div>
    </div>
    ${serverTrafficView(tag)}
    <div class="server-actions">
      ${serverActionButton({ label: checking ? 'Проверяю сервер' : 'Проверить сервер', icon: 'check', attrs: `data-server-check="${escapeHtml(tag)}"`, busy: checking, disabled: checking })}
      ${serverActionButton({ label: 'Править прокси', icon: 'edit', attrs: `data-server-edit="${index}"` })}
      ${active ? serverActionState('Основной proxy') : serverActionButton({ label: connecting ? 'Подключаю сервер' : 'Подключиться', icon: 'connect', tone: 'warning', attrs: `data-route-all="${escapeHtml(tag)}"`, busy: connecting, disabled: connecting })}
      ${serverActionButton({ label: 'Удалить прокси', icon: 'delete', tone: 'danger', attrs: `data-outbound-delete="${index}"` })}
    </div>
  </article>`;
}

function subscriptionPoolCard(pool) {
  const active = pool?.activeCandidate || {};
  const tag = pool?.tag || '';
  const connecting = state.pendingServerTag === tag;
  const candidates = Array.isArray(pool?.candidates) ? pool.candidates : [];
  const activeIndex = Number(pool?.active ?? 0);
  const fallbackActive = state.subscriptionFallbackTag === tag;
  const fallbackTotal = state.subscriptionFallbackTotal || candidates.length || pool?.count || 0;
  const fallbackElapsed = fallbackActive && state.subscriptionFallbackStartedAt
    ? Math.max(1, Math.round((Date.now() - state.subscriptionFallbackStartedAt) / 1000))
    : 0;
  const fallbackMessage = state.subscriptionFallbackMessage || `Проверяю кандидатов подписки${fallbackTotal ? `: до ${fallbackTotal}` : ''}`;
  const fallbackChecked = Math.min(Number(state.subscriptionFallbackChecked || 0), fallbackTotal || Number(state.subscriptionFallbackChecked || 0));
  const fallbackCountText = fallbackTotal
    ? `${fallbackChecked} из ${fallbackTotal}`
    : `${fallbackChecked} проверено`;
  const fallbackCurrent = String(state.subscriptionFallbackCurrent || '').trim();
  const search = String(state.subscriptionCandidateSearch?.[tag] || '').trim();
  const query = search.toLowerCase();
  const candidateChecks = state.subscriptionCandidateChecks?.[tag] || {};
  const candidateEntries = candidates.map((candidate, index) => {
    const address = [candidate?.address, candidate?.port].filter(Boolean).join(':');
    const selected = index === activeIndex;
    const location = serverLocation(candidate, {});
    const searchText = subscriptionCandidateSearchText(candidate, index, location, address);
    const visible = !query || searchText.includes(query);
    const countryCode = location?.code || '';
    const countryTitle = countryCode ? `${countryCode} · ${location.label || countryCode}` : 'Локация не определена';
    const savedCheck = candidateChecks[index] || null;
    const checkMatchesCandidate = savedCheck
      && String(savedCheck.address || '') === String(candidate?.address || '')
      && String(savedCheck.port || '') === String(candidate?.port || '');
    const check = checkMatchesCandidate ? savedCheck : null;
    const checkKey = `${tag}:${index}`;
    const checking = state.subscriptionCandidateChecking === checkKey;
    return {
      visible,
      markup: `<article class="subscription-candidate ${selected ? 'selected' : ''}" data-subscription-candidate-row="${escapeHtml(tag)}" data-subscription-candidate-text="${escapeHtml(searchText)}" ${visible ? '' : 'hidden'}>
      <label class="subscription-candidate-pick" title="Добавить этот сервер как отдельный proxy">
        <input type="checkbox" data-subscription-candidate-pick="${escapeHtml(tag)}" value="${index}" />
        <span></span>
      </label>
      <span class="subscription-candidate-flag" title="${escapeHtml(countryTitle)}">${countryFlagMarkup(countryCode)}</span>
      <div class="subscription-candidate-main">
        <strong>${escapeHtml(candidate?.tag || `server-${index + 1}`)}</strong>
        <span>${escapeHtml([address, candidate?.network, candidate?.security].filter(Boolean).join(' · '))}</span>
      </div>
      ${subscriptionCandidateStatus(check, checking)}
      <button class="btn secondary compact subscription-candidate-check" data-action="checkSubscriptionCandidate" data-busy="0" data-subscription-check="${escapeHtml(tag)}" data-subscription-candidate-index="${index}" ${checking ? 'disabled' : ''}>${checking ? 'Проверяю' : 'Проверить'}</button>
      ${selected
        ? '<span class="server-chip ok">по умолчанию</span>'
        : `<button class="btn secondary compact" data-action="selectSubscriptionCandidate" data-subscription-select="${escapeHtml(tag)}" data-subscription-candidate-index="${index}">Сделать основным</button>`}
    </article>`
    };
  });
  const visibleCount = candidateEntries.filter((entry) => entry.visible).length;
  const candidateRows = candidateEntries.map((entry) => entry.markup).join('');
  return `<article class="server-row subscription-pool-row">
    <div class="server-identity">
      <span class="server-protocol">pool</span>
      <div class="server-main">
        <strong>${escapeHtml(tag || 'subscription')}</strong>
        <span>${escapeHtml(pool?.url || 'subscription URL')}</span>
      </div>
    </div>
    <div class="server-health">
      <span class="check-badge ok">${escapeHtml(`${pool?.count || 0} кандидатов`)}</span>
      <small>${escapeHtml(active?.tag ? `активен ${active.tag} · ${[active.address, active.port].filter(Boolean).join(':')}` : 'активный сервер не выбран')}</small>
    </div>
    <div class="server-actions">
      ${serverActionButton({ label: 'Обновить список серверов подписки', icon: 'refresh', attrs: `data-action="refreshSubscription" data-subscription-refresh="${escapeHtml(tag)}"` })}
      ${fallbackActive
        ? serverActionButton({ label: 'Остановить поиск доступного сервера', icon: 'stop', tone: 'danger', attrs: 'data-action="cancelSubscriptionFallback"' })
        : serverActionButton({ label: 'Найти доступный сервер', icon: 'search', attrs: `data-action="fallbackSubscription" data-subscription-fallback="${escapeHtml(tag)}"` })}
      ${serverActionButton({ label: connecting ? 'Подключаю подписку' : 'Подключиться', icon: 'connect', tone: 'warning', attrs: `data-route-all="${escapeHtml(tag)}"`, busy: connecting, disabled: connecting })}
      ${serverActionButton({ label: 'Удалить подписку', icon: 'delete', tone: 'danger', attrs: `data-action="deleteSubscription" data-subscription-delete="${escapeHtml(tag)}"` })}
    </div>
    ${fallbackActive ? `<div class="subscription-fallback-progress">
      <div>
        <strong>Ищу доступный сервер</strong>
        <span>${escapeHtml(`${fallbackMessage} · проверено ${fallbackCountText} · прошло ${fallbackElapsed} с${fallbackCurrent ? ` · сейчас ${fallbackCurrent}` : ''}`)}</span>
      </div>
      <button class="btn danger compact" data-action="cancelSubscriptionFallback">Остановить</button>
      <i aria-hidden="true"></i>
    </div>` : ''}
    ${candidates.length ? `<details class="subscription-candidates" data-details-key="subscription-candidates-${escapeHtml(tag)}">
      <summary>Серверы подписки · ${candidates.length}</summary>
      <div class="subscription-candidate-tools">
        <input data-subscription-candidate-search="${escapeHtml(tag)}" value="${escapeHtml(search)}" placeholder="Найти сервер, страну, адрес..." />
        <span data-subscription-candidate-count="${escapeHtml(tag)}">${escapeHtml(`Показано ${visibleCount} из ${candidates.length}`)}</span>
      </div>
      <div class="subscription-candidate-actions">
        <button class="btn secondary compact" data-action="exportSubscriptionSelected" data-subscription-export="${escapeHtml(tag)}">Добавить выбранные как прокси</button>
        <button class="btn secondary compact" data-action="exportSubscriptionAll" data-subscription-export="${escapeHtml(tag)}">Добавить все как прокси</button>
      </div>
      <div class="subscription-candidate-list">${candidateRows || '<p class="muted">В подписке нет серверов.</p>'}</div>
    </details>` : ''}
  </article>`;
}

function serverAvailabilityPanel() {
  const activeTag = activeProxyTag();
  const proxyStats = proxyRuleStrategyStats(activeTag);
  return `
    <section class="panel server-check-panel">
      <div class="panel-title">
        <div><h2>Проверка прокси</h2><span>Разовая проверка перед ручным переключением сервера. Результаты сразу видны в списке ниже.</span></div>
      <button class="btn" data-action="checkServers" data-busy="0" ${state.serverChecking ? 'disabled' : ''}>Проверить все</button>
      </div>
      <div class="availability-settings">
        <div class="form-row">
          <label>Таймаут, мс</label>
          <input id="serverCheckTimeout" type="number" min="300" max="15000" step="100" value="${escapeHtml(state.serverCheckTimeout)}" />
        </div>
        <div class="form-row">
          <label>Попыток</label>
          <input id="serverCheckAttempts" type="number" min="1" max="5" step="1" value="${escapeHtml(state.serverCheckAttempts)}" />
        </div>
        <div class="form-row method-row">
          <label>Метод</label>
          <select id="serverCheckMode">
            <option value="http" ${state.serverCheckMode === 'http' ? 'selected' : ''}>HTTP через proxy</option>
            <option value="endpoint" ${state.serverCheckMode === 'endpoint' ? 'selected' : ''}>Порт сервера</option>
          </select>
        </div>
        <div class="form-row check-url-row">
          <label>URL проверки</label>
          <input id="serverCheckUrl" value="${escapeHtml(state.serverCheckUrl)}" placeholder="https://www.gstatic.com/generate_204" />
        </div>
        <div class="availability-note">
          <strong>Активный сервер: ${escapeHtml(activeTag || 'не выбран')}</strong>
          <span>Подключение меняет основное proxy-направление: ${proxyStats.primary} правил. Правила, закрепленные на других серверах, не трогаются: ${proxyStats.pinned}.</span>
        </div>
      </div>
      ${state.serverCheckHistory.length ? `<div class="health-history">
        ${state.serverCheckHistory.slice(0, 5).map((item) => `<article>
          <strong>${new Date(item.at).toLocaleTimeString()} · ${item.alive}/${item.total}</strong>
          <span>${escapeHtml(item.results.filter((result) => result.ok).map((result) => `${result.tag} ${result.latencyMs || 0}мс`).join(' · ') || 'нет доступных')}</span>
        </article>`).join('')}
      </div>` : ''}
    </section>
  `;
}

function serverEditDialog() {
  if (!state.serverEditDialog) return '';
  const outbound = configOutbounds()[state.serverEditIndex] || {};
  const parsed = parseServerEditJson(state.serverEditJson || '{}');
  const editable = serverEditFields(parsed.outbound || outbound);
  const protocol = editable.protocol || 'vless';
  const streamSecurity = editable.security || 'none';
  const option = (value, label, selected = editable.protocol) => `<option value="${escapeHtml(value)}" ${selected === value ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  const field = (name, label, placeholder = '', type = 'text') => `
    <div class="form-row">
      <label for="serverEdit_${escapeHtml(name)}">${escapeHtml(label)}</label>
      <input id="serverEdit_${escapeHtml(name)}" data-server-edit-field="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(editable[name] ?? '')}" placeholder="${escapeHtml(placeholder)}" />
    </div>`;
  return `
    <div class="modal-backdrop" data-action="closeServerEdit">
      <section class="modal server-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="serverEditTitle" data-modal>
        <div class="modal-head">
          <div>
            <h2 id="serverEditTitle">Редактировать прокси</h2>
            <span>Основные параметры меняются полями ниже. JSON оставлен для редких настроек Xray.</span>
          </div>
          <button class="icon-btn" type="button" data-action="closeServerEdit" aria-label="Закрыть">×</button>
        </div>
        <div class="server-edit-layout">
          <div class="server-edit-form">
            <div class="server-edit-section">
              <h3>Подключение</h3>
              <div class="server-edit-fields">
                ${field('tag', 'Outbound tag', 'cloudone-vless')}
                <div class="form-row">
                  <label for="serverEdit_protocol">Протокол</label>
                  <select id="serverEdit_protocol" data-server-edit-field="protocol">
                    ${option('vless', 'VLESS')}
                    ${option('vmess', 'VMess')}
                    ${option('trojan', 'Trojan')}
                    ${option('shadowsocks', 'Shadowsocks')}
                  </select>
                </div>
                ${field('address', 'Адрес', 'example.com')}
                ${field('port', 'Порт', '443', 'number')}
              </div>
            </div>
            <div class="server-edit-section">
              <h3>${protocol === 'trojan' || protocol === 'shadowsocks' ? 'Доступ' : 'Пользователь'}</h3>
              <div class="server-edit-fields">
                ${protocol === 'trojan' || protocol === 'shadowsocks'
                  ? `${field('password', 'Пароль', 'password')}${field('userSecurity', protocol === 'shadowsocks' ? 'Метод шифрования' : 'Метод', 'chacha20-ietf-poly1305')}`
                  : `${field('id', 'UUID / ID', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')}${field('userSecurity', protocol === 'vmess' ? 'Security' : 'Encryption', protocol === 'vmess' ? 'auto' : 'none')}${field('flow', 'Flow', 'xtls-rprx-vision')}`}
              </div>
            </div>
            <div class="server-edit-section">
              <h3>Транспорт и TLS</h3>
              <div class="server-edit-fields">
                <div class="form-row">
                  <label for="serverEdit_network">Transport</label>
                  <select id="serverEdit_network" data-server-edit-field="network">
                    ${['tcp', 'ws', 'grpc', 'http', 'httpupgrade', 'splithttp', 'kcp'].map((value) => `<option value="${value}" ${editable.network === value ? 'selected' : ''}>${value}</option>`).join('')}
                  </select>
                </div>
                <div class="form-row">
                  <label for="serverEdit_security">Security</label>
                  <select id="serverEdit_security" data-server-edit-field="security">
                    ${['none', 'reality', 'tls'].map((value) => `<option value="${value}" ${streamSecurity === value ? 'selected' : ''}>${value}</option>`).join('')}
                  </select>
                </div>
                ${field('sni', 'SNI / serverName', 'cloudone.example.com')}
                ${field('fingerprint', 'Fingerprint', 'chrome')}
                ${streamSecurity === 'reality' ? `${field('publicKey', 'Reality public key', 'base64url key')}${field('shortId', 'Short ID', '2fb9438cd4858c37')}${field('spiderX', 'SpiderX', '/')}` : ''}
                ${editable.network && editable.network !== 'tcp' ? field('path', editable.network === 'grpc' ? 'gRPC serviceName' : 'Path', '/') : ''}
              </div>
            </div>
            <details class="server-json-details">
              <summary>Расширенный JSON</summary>
              <div class="form-row">
                <label>Параметры outbound</label>
                <textarea id="serverEditJson" class="code-textarea server-json-editor" spellcheck="false">${escapeHtml(state.serverEditJson)}</textarea>
                <small class="muted">Если меняете tag, RuOpenRay обновит ссылки в правилах и балансировщиках.</small>
              </div>
            </details>
          </div>
          ${countryPickerView({
            escapeHtml,
            selected: state.serverEditCountry,
            search: state.serverEditCountrySearch,
            target: 'serverEdit',
            inputId: 'serverEditCountrySearch',
            title: 'Флаг и страна'
          })}
        </div>
        ${state.serverEditError ? `<p class="notice danger">${escapeHtml(state.serverEditError)}</p>` : ''}
        <div class="modal-actions">
          <button class="btn secondary" type="button" data-action="closeServerEdit">Отмена</button>
          <span class="muted">${escapeHtml(outbound?.tag || '')}</span>
          <button class="btn warning" type="button" data-action="saveServerEdit">Сохранить прокси</button>
        </div>
      </section>
    </div>
  `;
}

function serversPanel() {
  const outbounds = configOutbounds();
  const outboundEntries = outbounds.map((outbound, index) => ({ outbound, index }));
  const serverEntries = outboundEntries.filter(({ outbound }) => !isSystemOutbound(outbound));
  const systemEntries = outboundEntries.filter(({ outbound }) => isSystemOutbound(outbound));
  const stats = serverStats();
  const activeTag = activeProxyTag();
  const proxyServers = proxyOutbounds();
  const alive = proxyServers.filter((outbound) => checkForTag(outbound?.tag || '')?.ok).length;
  const serverTabs = [
    ['list', 'Прокси'],
    ['balancers', 'Балансировка'],
    ['subscriptions', 'Подписки'],
    ['system', 'Служебные']
  ];
  const requestedView = state.serversView === 'check' ? 'balancers' : state.serversView;
  const view = serverTabs.some(([value]) => value === requestedView) ? requestedView : 'list';
  return `
    <section class="route-hero servers-hero">
      <div>
        <h2>Прокси и группы</h2>
        <p>Прокси-серверы, подписки и группы балансировки для правил маршрутизации. Служебные direct/block вынесены отдельно.</p>
      </div>
      <div class="route-score">
        <strong>${proxyServers.length}</strong>
        <span>прокси</span>
      </div>
    </section>

    <section class="stats route-stats">
      ${stat('Прокси', stats.proxy, 'Пользовательские подключения')}
      ${stat('Служебные', stats.system, 'direct, block, DNS, fragment')}
      ${stat('В правилах', stats.used, 'Используются маршрутизацией')}
      ${stat('Доступны', alive, `По последней проверке: ${state.serverCheckMode === 'http' ? 'HTTP через прокси' : 'порт сервера'}`)}
    </section>

    <section class="servers-nav-panel">
      <div class="routing-subnav" role="tablist" aria-label="Подменю серверов">
        ${serverTabs.map(([value, label]) => `<button type="button" class="${view === value ? 'active' : ''}" data-servers-view="${value}">${label}</button>`).join('')}
      </div>
    </section>

    ${view === 'list' ? `
    <section class="panel">
      <div class="panel-title">
        <div><h2>Прокси</h2><span>Адреса, транспорт${state.status?.xrayStats?.enabled ? ', трафик по outbound' : ''}, ручная проверка и выбор активного proxy-направления.</span></div>
        <div class="split-actions">
          <button class="btn secondary" data-action="checkServers" data-busy="0" ${state.serverChecking ? 'disabled' : ''}>Проверить все</button>
          <button class="btn" data-import-dialog="choose">Добавить прокси</button>
        </div>
      </div>
      <div class="server-list">
        ${state.serverChecking ? operationProgressView() : ''}
        ${serverEntries
          .map(({ outbound, index }) => serverCard(outbound, index, activeTag))
          .join('') || '<p class="muted">В конфигурации пока нет proxy-серверов. Добавьте VLESS/VMess/Trojan ссылкой или подпиской.</p>'}
      </div>
      ${noticeView(state, escapeHtml, { style: 'margin-top: 14px' })}
    </section>
    ` : ''}

    ${view === 'balancers' ? routingBalancersPanel() : ''}

    ${view === 'subscriptions' ? `<section class="panel subscription-pools-panel">
      <div class="panel-title">
        <div><h2>Подписки и резерв</h2><span>Стабильный тег направления остается в правилах, а RuOpenRay переключает сервер внутри него.</span></div>
        <button class="btn secondary" data-import-dialog="subscription">Добавить подписку</button>
      </div>
      <div class="server-list">
        ${state.subscriptionPools.length ? state.subscriptionPools.map(subscriptionPoolCard).join('') : '<p class="muted">Подписок пока нет. Добавьте subscription URL через кнопку добавления сервера.</p>'}
      </div>
    </section>` : ''}

    ${view === 'system' ? `<section class="panel system-outbounds-panel">
      <div class="panel-title">
        <div><h2>Системные выходы</h2><span>Это технические outbounds Xray для прямого доступа, блокировки и DNS. Они не являются серверами.</span></div>
      </div>
      <div class="server-list">
        ${systemEntries.length ? systemEntries.map(({ outbound, index }) => {
          const tag = outbound?.tag || `outbound-${index + 1}`;
          const usage = outboundUsage(tag);
          const label = serviceOutboundLabel(outbound);
          const detail = fragmentOutboundDetail(tag) || outboundAddress(outbound);
          const protocolLabel = isFragmentOutboundTag(tag) ? 'fragment' : (outbound?.protocol || 'unknown');
          return `<article class="server-row system-row">
            <div class="server-protocol">${escapeHtml(protocolLabel)}</div>
            <div class="server-main">
              <strong title="${escapeHtml(tag)}">${escapeHtml(label)}</strong>
              <span>${escapeHtml(detail)}</span>
            </div>
            <div class="server-meta">
              <span>${escapeHtml(outboundTransport(outbound))}</span>
              <span>${usage} правил</span>
            </div>
            <div class="server-actions">
              <span class="tag">системный</span>
              <button class="btn secondary" data-outbound-delete="${index}" disabled>Удалить</button>
            </div>
          </article>`;
        }).join('') : '<p class="muted">Системные выходы не найдены.</p>'}
      </div>
    </section>` : ''}
    ${serverEditDialog()}
  `;
}

  return {
    serverAvailabilityPanel,
    serverCard,
    serverEditDialog,
    serversPanel,
    subscriptionPoolCard,
  };
}
