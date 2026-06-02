import { parseServerEditJson, patchServerEditField, stringifyServerEditOutbound } from './server-edit-model.js';
import { inferredCountryForOutbound } from './server-location.js';

export function createServerActions({
  state,
  request,
  render,
  refresh,
  syncConfig,
  keepOperationVisible,
  configOutbounds,
  proxyOutbounds,
  proxyRuleStrategyStats,
  setActiveProxyDraft,
  setActiveServerTag,
  applyConfig
}) {
  let subscriptionFallbackAbort = null;
  let subscriptionFallbackTimer = 0;

  function clearSubscriptionFallbackState() {
    if (subscriptionFallbackTimer) clearInterval(subscriptionFallbackTimer);
    subscriptionFallbackTimer = 0;
    subscriptionFallbackAbort = null;
    state.subscriptionFallbackTag = '';
    state.subscriptionFallbackStartedAt = 0;
    state.subscriptionFallbackMessage = '';
    state.subscriptionFallbackTotal = 0;
    state.subscriptionFallbackChecked = 0;
    state.subscriptionFallbackCurrent = '';
    state.subscriptionFallbackTick = 0;
  }

  function rememberSubscriptionCandidateChecks(tag, results = []) {
    if (!tag || !Array.isArray(results)) return;
    const next = { ...(state.subscriptionCandidateChecks || {}) };
    const poolChecks = { ...(next[tag] || {}) };
    for (const item of results) {
      const index = Number(item?.index);
      if (!Number.isFinite(index) || index < 0) continue;
      poolChecks[index] = {
        ...item,
        checkedAt: item?.checkedAt || new Date().toISOString(),
        method: item?.method || state.serverCheckMode
      };
    }
    next[tag] = poolChecks;
    state.subscriptionCandidateChecks = next;
  }

  async function persistServerMeta(items = state.serverMeta) {
    const result = await request('/api/server-meta', {
      method: 'POST',
      body: JSON.stringify({ items: items || {} })
    });
    if (result?.items && typeof result.items === 'object') state.serverMeta = result.items;
    return result;
  }

  async function persistInferredServerMeta(outbounds = [], { tagMap = {} } = {}) {
    const nextMeta = { ...(state.serverMeta || {}) };
    let changed = 0;
    for (const outbound of outbounds || []) {
      if (!outbound?.tag) continue;
      const targetTag = tagMap[outbound.tag] || outbound.tag;
      const current = nextMeta[targetTag] || {};
      if (current.country) continue;
      const country = inferredCountryForOutbound(outbound, current);
      if (!country) continue;
      nextMeta[targetTag] = { ...current, country };
      changed += 1;
    }
    if (!changed) return 0;
    state.serverMeta = nextMeta;
    await persistServerMeta(nextMeta);
    return changed;
  }

  async function persistPoolActiveCandidateMeta(result, tag) {
    if (!result?.ok || !result.pool?.activeCandidate) return 0;
    return persistInferredServerMeta([result.pool.activeCandidate], {
      tagMap: { [result.pool.activeCandidate.tag]: tag }
    });
  }

  function openServerEditor(index) {
    const outbound = configOutbounds()[index];
    if (!outbound) return;
    state.serverEditDialog = true;
    state.serverEditIndex = index;
    state.serverEditJson = JSON.stringify(outbound, null, 2);
    state.serverEditCountry = state.serverMeta?.[outbound.tag]?.country || '';
    state.serverEditCountrySearch = '';
    state.serverEditError = '';
    render();
  }

  function closeServerEditor() {
    state.serverEditDialog = false;
    state.serverEditIndex = -1;
    state.serverEditJson = '';
    state.serverEditCountry = '';
    state.serverEditCountrySearch = '';
    state.serverEditError = '';
    render();
  }

  function setServerEditCountry(country) {
    state.serverEditCountry = String(country || '').trim().toUpperCase();
    state.serverEditCountrySearch = '';
    render();
  }

  function updateServerEditField(field, value, { rerender = false } = {}) {
    const parsed = parseServerEditJson(state.serverEditJson || '{}');
    if (parsed.error) {
      state.serverEditError = parsed.error;
      if (rerender) render();
      return;
    }
    const outbound = patchServerEditField(parsed.outbound, field, value);
    state.serverEditJson = stringifyServerEditOutbound(outbound);
    state.serverEditError = '';
    if (rerender) render();
  }

  function replaceRouteTargetReferences(config, oldTag, newTag) {
    if (!oldTag || !newTag || oldTag === newTag) return config;
    const routing = config.routing && typeof config.routing === 'object' ? config.routing : {};
    if (Array.isArray(routing.rules)) {
      routing.rules = routing.rules.map((rule) => {
        if (!rule || typeof rule !== 'object') return rule;
        const next = { ...rule };
        if (next.outboundTag === oldTag) next.outboundTag = newTag;
        return next;
      });
    }
    if (Array.isArray(routing.balancers)) {
      routing.balancers = routing.balancers.map((balancer) => {
        if (!balancer || typeof balancer !== 'object') return balancer;
        const next = { ...balancer };
        if (next.fallbackTag === oldTag) next.fallbackTag = newTag;
        if (Array.isArray(next.selector)) {
          next.selector = next.selector.map((selector) => selector === oldTag ? newTag : selector);
        }
        return next;
      });
    }
    config.routing = routing;
    return config;
  }

  function mergeSubscriptionOutbounds(config, outbounds) {
    const next = JSON.parse(JSON.stringify(config || {}));
    const imported = (outbounds || []).filter(Boolean).map((outbound) => JSON.parse(JSON.stringify(outbound)));
    const tags = new Set(imported.map((outbound) => outbound?.tag).filter(Boolean));
    const current = Array.isArray(next.outbounds) ? next.outbounds : [];
    const systemTags = new Set(['direct', 'block', 'dns-out']);
    const system = current.filter((outbound) => systemTags.has(outbound?.tag) || outbound?.protocol === 'freedom' || outbound?.protocol === 'blackhole' || outbound?.protocol === 'dns');
    const regular = current.filter((outbound) => !system.includes(outbound) && !tags.has(outbound?.tag));
    next.outbounds = [...imported, ...regular, ...system];
    return next;
  }

  async function saveServerEdit() {
    const index = Number(state.serverEditIndex);
    const current = configOutbounds()[index];
    if (!current) return;
    let outbound = null;
    const parsed = parseServerEditJson(state.serverEditJson || '{}');
    if (parsed.error) {
      state.serverEditError = parsed.error;
      render();
      return;
    }
    outbound = parsed.outbound;
    const oldTag = String(current.tag || '').trim();
    const newTag = String(outbound.tag || '').trim();
    if (!newTag) {
      state.serverEditError = 'У сервера должен быть outbound tag';
      render();
      return;
    }
    const duplicate = configOutbounds().some((item, itemIndex) => itemIndex !== index && item?.tag === newTag);
    if (duplicate) {
      state.serverEditError = `Тег ${newTag} уже используется другим направлением`;
      render();
      return;
    }
    const next = JSON.parse(JSON.stringify(state.config || {}));
    if (!Array.isArray(next.outbounds)) next.outbounds = [];
    next.outbounds[index] = outbound;
    replaceRouteTargetReferences(next, oldTag, newTag);
    const nextMeta = { ...(state.serverMeta || {}) };
    if (oldTag && oldTag !== newTag) delete nextMeta[oldTag];
    const country = String(state.serverEditCountry || '').trim().toUpperCase();
    if (country) nextMeta[newTag] = { ...(nextMeta[newTag] || {}), country };
    else delete nextMeta[newTag];
    state.serverMeta = nextMeta;
    syncConfig(next);
    if (state.activeServerTag === oldTag && oldTag !== newTag && typeof setActiveServerTag === 'function') setActiveServerTag(newTag);
    await persistServerMeta(nextMeta);
    state.message = oldTag === newTag
      ? `Сервер ${newTag} обновлен в черновике`
      : `Сервер ${oldTag} переименован в ${newTag}, ссылки в правилах обновлены`;
    closeServerEditor();
  }

  function removeOutbound(index) {
    const outbound = configOutbounds()[index];
    const tag = outbound?.tag || '';
    if (['direct', 'block', 'dns-out'].includes(tag)) {
      state.message = 'Служебные направления direct, block и dns-out лучше не удалять';
      render();
      return;
    }
    const next = JSON.parse(JSON.stringify(state.config || {}));
    next.outbounds = configOutbounds().filter((_, itemIndex) => itemIndex !== index);
    if (tag && state.serverMeta?.[tag]) {
      const nextMeta = { ...(state.serverMeta || {}) };
      delete nextMeta[tag];
      state.serverMeta = nextMeta;
      persistServerMeta(nextMeta).catch(() => {});
    }
    syncConfig(next);
    state.message = `Сервер ${tag || index + 1} удален из черновика`;
    render();
  }

  async function routeAllToOutbound(tag, { apply = true } = {}) {
    if (state.configApplying) return;
    const before = proxyRuleStrategyStats();
    state.pendingServerTag = tag;
    state.message = `Подключаю ${tag}: меняю основное proxy-направление...`;
    render();
    setActiveProxyDraft(tag);
    const after = proxyRuleStrategyStats(tag);
    const switched = Math.max(before.primary, after.primary);
    const pinned = after.pinned ? `, закрепленных на других серверах не тронуто: ${after.pinned}` : '';
    if (!apply) {
      state.pendingServerTag = '';
      state.message = `Основное proxy-направление теперь ведет в ${tag}. Переключено правил: ${switched}${pinned}`;
      render();
      return;
    }
    state.message = `Подключаю ${tag}: меняю proxy-направление, записываю config.json и перезапускаю Xray...`;
    render();
    try {
      await applyConfig({
        successMessage: `Подключен ${tag}. Переключено правил: ${switched}${pinned}`
      });
    } finally {
      state.pendingServerTag = '';
      render();
    }
  }

  async function checkServers(tags = [], options = {}) {
    const startedAt = Date.now();
    const renderAfter = options.renderAfter !== false;
    const requestedTags = tags.length
      ? tags
      : proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean);
    state.serverChecking = true;
    state.serverCheckingTags = requestedTags;
    state.message = requestedTags.length === 1 ? 'Проверяю выбранный прокси...' : 'Проверяю все прокси...';
    if (renderAfter) render();
    try {
      const result = await request('/api/outbounds/check', {
        method: 'POST',
        body: JSON.stringify({
          tags: requestedTags,
          timeoutMs: Math.max(5000, Number(state.serverCheckTimeout) || 5000),
          attempts: Math.max(3, Number(state.serverCheckAttempts) || 3),
          mode: state.serverCheckMode,
          url: state.serverCheckUrl
        })
      });
      for (const item of result.results || []) {
        if (item.tag) state.serverChecks[item.tag] = item;
      }
      const alive = (result.results || []).filter((item) => item.ok).length;
      state.serverCheckHistory = [
        {
          at: new Date().toISOString(),
          total: result.results?.length || 0,
          alive,
          results: result.results || []
        },
        ...state.serverCheckHistory
      ].slice(0, 12);
      state.message = requestedTags.length === 1
        ? `Проверка сервера: ${alive ? 'доступен' : 'нет ответа'}`
        : `Проверено серверов: ${result.results?.length || 0}, доступны: ${alive}`;
    } catch (error) {
      state.message = `Проверка прокси не завершилась: ${error.message || error}`;
    } finally {
      await keepOperationVisible(startedAt);
      state.serverChecking = false;
      state.serverCheckingTags = [];
      if (renderAfter) render();
    }
  }

  async function saveServerCheckHistorySettings() {
    if (state.serverCheckHistorySaving) return;
    state.serverCheckHistorySaving = true;
    render();
    try {
      const result = await request('/api/outbounds/check-history/settings', {
        method: 'POST',
        body: JSON.stringify({
          limit: Math.max(0, Number(state.serverCheckHistoryLimit) || 0),
          retentionHours: Math.max(1, Number(state.serverCheckHistoryRetentionHours) || 168)
        })
      });
      if (result?.settings) {
        state.serverCheckHistoryLimit = String(result.settings.limit ?? state.serverCheckHistoryLimit);
        state.serverCheckHistoryRetentionHours = String(result.settings.retentionHours ?? state.serverCheckHistoryRetentionHours);
      }
      if (result?.history && typeof result.history === 'object') {
        state.serverCheckHistoryByTag = result.history;
      }
      state.message = result?.ok
        ? 'История проверок серверов сохранена'
        : `Не удалось сохранить историю проверок: ${result?.error || 'ошибка'}`;
    } finally {
      state.serverCheckHistorySaving = false;
      render();
    }
  }

  async function fallbackSubscriptionPool(tag) {
    if (!tag || subscriptionFallbackAbort) return;
    const pool = (state.subscriptionPools || []).find((item) => item?.tag === tag);
    const total = Array.isArray(pool?.candidates) ? pool.candidates.length : Number(pool?.count || 0);
    subscriptionFallbackAbort = new AbortController();
    state.subscriptionFallbackTag = tag;
    state.subscriptionFallbackStartedAt = Date.now();
    state.subscriptionFallbackTotal = total;
    state.subscriptionFallbackChecked = 0;
    state.subscriptionFallbackCurrent = '';
    state.subscriptionFallbackMessage = total
      ? `Проверяю кандидатов по очереди: до ${total}`
      : 'Проверяю кандидатов подписки';
    render();
    subscriptionFallbackTimer = setInterval(() => {
      state.subscriptionFallbackTick += 1;
      request(`/api/subscriptions/fallback-progress?tag=${encodeURIComponent(tag)}`)
        .then((progress) => {
          if (!progress?.active || state.subscriptionFallbackTag !== tag) return;
          state.subscriptionFallbackChecked = Number(progress.checked || 0);
          state.subscriptionFallbackTotal = Number(progress.total || state.subscriptionFallbackTotal || 0);
          state.subscriptionFallbackCurrent = [progress.currentTag, progress.currentAddress, progress.currentPort ? `:${progress.currentPort}` : '']
            .filter(Boolean)
            .join(' ');
          render();
        })
        .catch(() => {});
      render();
    }, 1000);
    try {
      const result = await request('/api/subscriptions/fallback', {
        method: 'POST',
        signal: subscriptionFallbackAbort.signal,
        body: JSON.stringify({
          tag,
          mode: state.serverCheckMode,
          url: state.serverCheckUrl,
          timeoutMs: Math.max(5000, Number(state.serverCheckTimeout) || 5000),
          attempts: Math.max(3, Number(state.serverCheckAttempts) || 3),
          restart: true
        })
      });
      state.message = result.ok
        ? `Подписка ${tag}: выбран ${result.selected?.tag || result.selected?.address || 'новый сервер'}`
        : `Подписка ${tag}: ${result.error || 'доступный сервер не найден'}`;
      rememberSubscriptionCandidateChecks(tag, result.results || []);
      await persistPoolActiveCandidateMeta(result, tag);
      await refresh();
    } catch (error) {
      if (error?.name === 'AbortError') {
        state.message = `Поиск доступного сервера подписки ${tag} остановлен`;
        render();
        return;
      }
      throw error;
    } finally {
      clearSubscriptionFallbackState();
      render();
    }
  }

  function cancelSubscriptionFallback() {
    if (!subscriptionFallbackAbort) return;
    subscriptionFallbackAbort.abort();
  }

  async function selectSubscriptionCandidate(tag, index) {
    if (!tag) return;
    const result = await request('/api/subscriptions/select', {
      method: 'POST',
      body: JSON.stringify({ tag, index: Number(index), restart: true })
    });
    state.message = result.ok
      ? `Подписка ${tag}: выбран ${result.selected?.tag || result.selected?.address || 'сервер'}`
      : `Подписка ${tag}: ${result.error || 'не удалось выбрать сервер'}`;
    await persistPoolActiveCandidateMeta(result, tag);
    await refresh();
  }

  async function checkSubscriptionCandidate(tag, index) {
    if (!tag) return;
    const numericIndex = Number(index);
    if (!Number.isFinite(numericIndex) || numericIndex < 0) return;
    const key = `${tag}:${numericIndex}`;
    if (state.subscriptionCandidateChecking) return;
    state.subscriptionCandidateChecking = key;
    render();
    try {
      const result = await request('/api/subscriptions/check-candidate', {
        method: 'POST',
        body: JSON.stringify({
          tag,
          index: numericIndex,
          mode: state.serverCheckMode,
          url: state.serverCheckUrl,
          timeoutMs: Math.max(2500, Number(state.serverCheckTimeout) || 5000),
          attempts: 1
        })
      });
      if (result?.result) {
        rememberSubscriptionCandidateChecks(tag, [result.result]);
        state.message = result.result.ok
          ? `Сервер подписки доступен: ${result.result.tag || result.result.address || numericIndex + 1}`
          : `Сервер подписки не ответил: ${result.result.tag || result.result.address || numericIndex + 1}`;
      } else {
        state.message = `Не удалось проверить сервер подписки ${tag}`;
      }
    } finally {
      state.subscriptionCandidateChecking = '';
      render();
    }
  }

  async function refreshSubscriptionPool(tag) {
    if (!tag) return;
    const result = await request('/api/subscriptions/refresh', {
      method: 'POST',
      body: JSON.stringify({ tag })
    });
    state.message = result.ok
      ? `Подписка ${tag}: обновлено серверов ${result.before} → ${result.count}`
      : `Подписка ${tag}: ${result.error || 'не удалось обновить список серверов'}`;
    await persistPoolActiveCandidateMeta(result, tag);
    await refresh();
  }

  async function exportSubscriptionCandidates(tag, indexes = [], { all = false } = {}) {
    if (!tag) return;
    const result = await request('/api/subscriptions/export', {
      method: 'POST',
      body: JSON.stringify({ tag, indexes, all })
    });
    if (!result?.ok || !Array.isArray(result.outbounds) || !result.outbounds.length) {
      state.message = `Подписка ${tag}: ${result?.error || 'серверы не выбраны'}`;
      render();
      return;
    }
    syncConfig(mergeSubscriptionOutbounds(state.config, result.outbounds));
    const inferred = await persistInferredServerMeta(result.outbounds);
    state.message = `Подписка ${tag}: добавлено в черновик прокси-серверов: ${result.outbounds.length}`;
    if (inferred) state.message += `, флагов определено: ${inferred}`;
    render();
  }

  async function deleteSubscriptionPool(tag) {
    if (!tag) return;
    if (!confirm(`Удалить подписку ${tag}? Сервер в профиле и правила маршрутизации останутся на месте.`)) return;
    const result = await request('/api/subscriptions/delete', {
      method: 'POST',
      body: JSON.stringify({ tag })
    });
    state.message = result.ok
      ? `Подписка ${tag} удалена из списка. Сервер в профиле не удалялся.`
      : `Не удалось удалить подписку ${tag}`;
    await refresh();
  }

  return {
    removeOutbound,
    openServerEditor,
    closeServerEditor,
    setServerEditCountry,
    updateServerEditField,
    saveServerEdit,
    persistServerMeta,
    routeAllToOutbound,
    checkServers,
    saveServerCheckHistorySettings,
    fallbackSubscriptionPool,
    cancelSubscriptionFallback,
    selectSubscriptionCandidate,
    checkSubscriptionCandidate,
    refreshSubscriptionPool,
    exportSubscriptionCandidates,
    deleteSubscriptionPool
  };
}
