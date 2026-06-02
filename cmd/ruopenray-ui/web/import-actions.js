import { inferredCountryForOutbound } from './server-location.js';

export function createImportActions({
  state,
  request,
  render,
  refresh,
  syncConfig,
  applyConfig,
  isSystemOutbound,
  cloneOutboundWithTag,
  routeRules,
  activeProxyTag,
  setRoutingDraft,
  setActiveServerTag,
  persistServerMeta
}) {
  async function importLink() {
    const result = await request('/api/import', {
      method: 'POST',
      body: JSON.stringify({ link: state.importLink, profileName: state.profileName, outboundTag: state.importOutboundTag })
    });
    await persistInferredServerMeta([result.outbound], { forcedCountry: state.importCountry });
    state.message = `Импортирован ${result.outbound.protocol} в профиль ${result.profile}`;
    state.importLink = '';
    state.importOutboundTag = '';
    state.importCountry = '';
    state.importCountrySearch = '';
    state.importPreview = null;
    state.importDialog = '';
    await refresh();
  }

  function serverImportOutbound() {
    if (!state.importPreview?.outbound) return null;
    const outbound = JSON.parse(JSON.stringify(state.importPreview.outbound));
    const tag = String(state.importOutboundTag || '').trim();
    if (tag) outbound.tag = tag;
    return outbound;
  }

  function serverImportPreviewItem() {
    if (!state.importPreview?.items?.length) return null;
    const item = { ...state.importPreview.items[0] };
    const tag = String(state.importOutboundTag || '').trim();
    if (tag) item.tag = tag;
    return item;
  }

  function activeProfileName() {
    return (Array.isArray(state.profiles) ? state.profiles : []).find((profile) => profile.active)?.name || 'default';
  }

  function mergeOutboundsIntoConfig(config, outbounds) {
    const next = JSON.parse(JSON.stringify(config || {}));
    const imported = outbounds.filter(Boolean).map((outbound) => JSON.parse(JSON.stringify(outbound)));
    const tags = new Set(imported.map((outbound) => outbound?.tag).filter(Boolean));
    const existing = Array.isArray(next.outbounds) ? next.outbounds.filter((outbound) => !tags.has(outbound?.tag)) : [];
    const regular = existing.filter((outbound) => !isSystemOutbound(outbound));
    const system = existing.filter((outbound) => isSystemOutbound(outbound));
    next.outbounds = [...imported, ...regular, ...system];
    return next;
  }

  function slugTag(value, fallback = 'subscription-auto') {
    const clean = String(value || '')
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    return clean || fallback;
  }

  function suggestedSubscriptionBalancerTag() {
    return slugTag(state.subscriptionBalancerTag || state.profileName || state.subscriptionPreview?.items?.[0]?.tag || state.subscriptionUrl, 'subscription-auto');
  }

  function subscriptionUrlWithAuth() {
    const raw = String(state.subscriptionUrl || '').trim();
    if (!raw || !state.subscriptionAuthEnabled) return raw;
    const user = String(state.subscriptionAuthUser || '');
    const password = String(state.subscriptionAuthPassword || '');
    if (!user && !password) return raw;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return raw;
      parsed.username = user;
      parsed.password = password;
      return parsed.toString();
    } catch {
      return raw;
    }
  }

  function isCatchAllRoute(rule) {
    if (!rule) return false;
    const hasTarget = Boolean(rule.outboundTag || rule.balancerTag);
    const hasConditions = Boolean(rule.domain?.length || rule.ip?.length || rule.source?.length || rule.inboundTag?.length || rule.network || (rule.port && rule.port !== '0-65535'));
    return hasTarget && !hasConditions;
  }

  function isTransparentMainProxyRoute(rule) {
    if (!rule || !rule.outboundTag || rule.balancerTag) return false;
    const inbound = Array.isArray(rule.inboundTag) ? rule.inboundTag : (rule.inboundTag ? [rule.inboundTag] : []);
    if (!inbound.includes('transparent_ipv4')) return false;
    return !rule.domain?.length
      && !rule.ip?.length
      && !rule.source?.length
      && !rule.network
      && !(rule.port && rule.port !== '0-65535');
  }

  function setActiveProxyDraft(tag) {
    const defaultRule = { type: 'field', outboundTag: tag };
    const rules = routeRules();
    if (!rules.length) {
      setRoutingDraft([defaultRule]);
    } else {
      let changed = 0;
      const nextRules = rules.map((rule) => {
        if (isCatchAllRoute(rule)) {
          changed += 1;
          return defaultRule;
        }
        if (isTransparentMainProxyRoute(rule)) {
          changed += 1;
          return { ...rule, outboundTag: tag };
        }
        if (rule?.outboundTag === 'proxy') {
          changed += 1;
          return { ...rule, outboundTag: tag };
        }
        return rule;
      });
      setRoutingDraft(changed ? nextRules : [...rules, defaultRule]);
    }
    setActiveServerTag(tag);
  }

  function setActiveProxyBalancerDraft(tag) {
    const defaultRule = { type: 'field', balancerTag: tag };
    const rules = routeRules();
    const currentTag = activeProxyTag();
    const switchable = new Set(['proxy', currentTag].filter(Boolean));
    if (!rules.length) {
      setRoutingDraft([defaultRule]);
    } else {
      let changed = 0;
      const nextRules = rules.map((rule) => {
        if (isCatchAllRoute(rule)) {
          changed += 1;
          return defaultRule;
        }
        if (rule?.balancerTag === tag) return rule;
        if (rule?.outboundTag && switchable.has(rule.outboundTag)) {
          changed += 1;
          const next = { ...rule, balancerTag: tag };
          delete next.outboundTag;
          return next;
        }
        return rule;
      });
      setRoutingDraft(changed ? nextRules : [...rules, defaultRule]);
    }
    setActiveServerTag('');
  }

  async function saveCurrentProfileConfig() {
    const name = activeProfileName();
    await request('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ name, config: state.config })
    });
    await request('/api/profiles/activate', { method: 'POST', body: JSON.stringify({ name }) });
  }

  async function persistInferredServerMeta(outbounds = [], { tagMap = {}, forcedCountry = '' } = {}) {
    if (typeof persistServerMeta !== 'function') return 0;
    const nextMeta = { ...(state.serverMeta || {}) };
    let changed = 0;
    for (const outbound of outbounds || []) {
      if (!outbound?.tag) continue;
      const targetTag = tagMap[outbound.tag] || outbound.tag;
      const current = nextMeta[targetTag] || {};
      if (current.country && !forcedCountry) continue;
      const country = forcedCountry || inferredCountryForOutbound(outbound, current);
      if (!country) continue;
      nextMeta[targetTag] = { ...current, country };
      changed += 1;
    }
    if (!changed) return 0;
    state.serverMeta = nextMeta;
    await persistServerMeta(nextMeta);
    return changed;
  }

  async function importToCurrent(makeActive = false) {
    if (!state.importPreview?.outbound) await previewImport();
    const outbound = serverImportOutbound();
    if (!outbound) return;
    syncConfig(mergeOutboundsIntoConfig(state.config, [outbound]));
    await persistInferredServerMeta([outbound], { forcedCountry: state.importCountry });
    if (makeActive) setActiveProxyDraft(outbound.tag);
    await saveCurrentProfileConfig();
    state.importLink = '';
    state.importOutboundTag = '';
    state.importCountry = '';
    state.importCountrySearch = '';
    state.importPreview = null;
    state.importDialog = '';
    state.message = makeActive
      ? `Сервер ${outbound.tag} добавлен в текущий профиль и выбран активным`
      : `Сервер ${outbound.tag} добавлен в текущий профиль`;
    if (makeActive) await applyConfig();
    else await refresh();
  }

  async function importSubscriptionToCurrent(makeActive = false) {
    if (!state.subscriptionPreview?.outbounds?.length) await previewSubscription();
    const outbounds = state.subscriptionPreview?.outbounds || [];
    if (!outbounds.length) return;
    const subscriptionUrl = subscriptionUrlWithAuth();
    let stableTag = '';
    if (state.subscriptionAutoBalancer) {
      stableTag = suggestedSubscriptionBalancerTag();
      const stableOutbound = cloneOutboundWithTag(outbounds[0], stableTag);
      syncConfig(mergeOutboundsIntoConfig(state.config, [stableOutbound]));
      await request('/api/subscriptions/pool', {
        method: 'POST',
        body: JSON.stringify({ tag: stableTag, url: subscriptionUrl, outbounds, active: 0 })
      });
      await persistInferredServerMeta([stableOutbound]);
    } else {
      syncConfig(mergeOutboundsIntoConfig(state.config, outbounds));
      await persistInferredServerMeta(outbounds);
    }
    if (makeActive && stableTag) setActiveProxyDraft(stableTag);
    else if (makeActive && outbounds[0]?.tag) setActiveProxyDraft(outbounds[0].tag);
    await saveCurrentProfileConfig();
    state.subscriptionUrl = '';
    state.subscriptionAuthPassword = '';
    state.subscriptionPreview = null;
    state.subscriptionBalancerTag = '';
    state.importDialog = '';
    state.message = makeActive
      ? `Подписка добавлена в текущий профиль, активная цель ${stableTag || outbounds[0].tag}`
      : `Подписка добавлена в текущий профиль: ${outbounds.length} серверов${stableTag ? `, стабильная цель ${stableTag}` : ''}`;
    if (makeActive) await applyConfig();
    else await refresh();
  }

  async function previewImport() {
    const result = await request('/api/import/preview', {
      method: 'POST',
      body: JSON.stringify({ link: state.importLink, outboundTag: state.importOutboundTag })
    });
    state.importPreview = result;
    state.message = `Распознано: ${result.items[0]?.protocol || 'сервер'} ${result.items[0]?.address || ''}`;
    render();
  }

  async function previewSubscription() {
    const result = await request('/api/import/preview', {
      method: 'POST',
      body: JSON.stringify({ url: subscriptionUrlWithAuth() })
    });
    state.subscriptionPreview = result;
    state.message = `В подписке найдено серверов: ${result.links}`;
    render();
  }

  async function importSubscription() {
    const result = await request('/api/import/subscription', {
      method: 'POST',
      body: JSON.stringify({ url: subscriptionUrlWithAuth(), profileName: state.profileName })
    });
    state.subscriptionUrl = '';
    state.subscriptionAuthPassword = '';
    state.subscriptionPreview = null;
    state.importDialog = '';
    state.message = `Импортировано серверов: ${result.imported.length}. Профиль: ${result.profile}`;
    await refresh();
  }

  return {
    importLink,
    serverImportOutbound,
    serverImportPreviewItem,
    activeProfileName,
    mergeOutboundsIntoConfig,
    slugTag,
    suggestedSubscriptionBalancerTag,
    subscriptionUrlWithAuth,
    setActiveProxyDraft,
    setActiveProxyBalancerDraft,
    saveCurrentProfileConfig,
    importToCurrent,
    importSubscriptionToCurrent,
    previewImport,
    previewSubscription,
    importSubscription
  };
}
