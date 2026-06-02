import { countryFlagMarkup, serverLocation } from './server-location.js';
import { isServiceOutbound } from './outbound-tags.js';

export function createServerModel({
  state,
  configOutbounds,
  routeRules,
  routeBalancers,
  routeTarget,
  outboundAddress,
  outboundTransport,
  outboundMatchesSelectors,
  observatorySelectors,
  burstObservatorySelectors,
  strategyObserverType,
  observerLabel,
  checkForTag,
  checkLabel,
  ruleCountLabel,
  escapeHtml,
  splitRouteValues
}) {
  function explicitOutboundUsage(tag) {
    return routeRules().filter((rule) => rule.outboundTag === tag).length;
  }

  function outboundUsage(tag) {
    return routeRules().filter((rule) => rule.outboundTag === tag || (rule.outboundTag === 'proxy' && activeProxyTag() === tag)).length;
  }

  function serverStats() {
    const stats = { proxy: 0, system: 0, used: 0, unused: 0 };
    for (const outbound of configOutbounds()) {
      if (isSystemOutbound(outbound)) {
        stats.system += 1;
        continue;
      }
      stats.proxy += 1;
      if (outboundUsage(outbound?.tag || '')) stats.used += 1;
      else stats.unused += 1;
    }
    return stats;
  }

  function isSystemOutbound(outbound) {
    return isServiceOutbound(outbound);
  }

  function proxyOutbounds() {
    return configOutbounds().filter((outbound) => !isSystemOutbound(outbound));
  }

  function inferredActiveProxyTag() {
    const used = proxyOutbounds().find((outbound) => explicitOutboundUsage(outbound?.tag || '') > 0);
    return used?.tag || proxyOutbounds()[0]?.tag || '';
  }

  function activeProxyTag() {
    const explicit = state.activeServerTag;
    if (explicit && proxyOutbounds().some((outbound) => outbound?.tag === explicit)) return explicit;
    return inferredActiveProxyTag();
  }

  function activeProxyOutbound() {
    const tag = activeProxyTag();
    return proxyOutbounds().find((outbound) => outbound?.tag === tag) || proxyOutbounds()[0] || null;
  }

  function setActiveServerTag(tag) {
    state.activeServerTag = tag || '';
    if (state.activeServerTag) globalThis.sessionStorage?.setItem('ruopenray_active_server', state.activeServerTag);
    else globalThis.sessionStorage?.removeItem('ruopenray_active_server');
    globalThis.localStorage?.removeItem('ruopenray_active_server');
  }

  function proxyRuleStrategyStats(activeTag = activeProxyTag()) {
    const proxyTags = new Set(proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean));
    let primary = 0;
    let pinned = 0;
    let alias = 0;
    for (const rule of routeRules()) {
      const tag = rule?.outboundTag || '';
      if (tag === 'proxy') {
        alias += 1;
        primary += 1;
      } else if (activeTag && tag === activeTag) {
        primary += 1;
      } else if (proxyTags.has(tag)) {
        pinned += 1;
      }
    }
    return { primary, pinned, alias };
  }

  function proxyRuleSampleLabel(rule) {
    const target = routeTarget(rule || {});
    const value = Array.isArray(target.values) ? target.values[0] : '';
    return value || target.kind || 'правило';
  }

  function proxyDirectionSummary() {
    const proxyTags = new Set(proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean));
    const outbounds = new Map();
    const balancers = new Map();
    const add = (map, tag, rule) => {
      if (!tag) return;
      const current = map.get(tag) || { tag, rules: 0, samples: [] };
      current.rules += 1;
      if (current.samples.length < 3) current.samples.push(proxyRuleSampleLabel(rule));
      map.set(tag, current);
    };
    for (const rule of routeRules()) {
      if (rule?.balancerTag) {
        add(balancers, rule.balancerTag, rule);
        continue;
      }
      const rawTag = rule?.outboundTag || '';
      const tag = rawTag === 'proxy' ? activeProxyTag() : rawTag;
      if (proxyTags.has(tag)) add(outbounds, tag, rule);
    }
    const implicit = !outbounds.size && !balancers.size ? activeProxyTag() : '';
    if (implicit) outbounds.set(implicit, { tag: implicit, rules: 0, samples: [], implicit: true });
    const total = [...outbounds.values(), ...balancers.values()].reduce((sum, item) => sum + Number(item.rules || 0), 0);
    return { outbounds, balancers, total };
  }

  function proxyDirectionTitle(summary) {
    const count = summary.outbounds.size + summary.balancers.size;
    if (count === 1 && summary.balancers.size === 1) return 'Активная группа серверов';
    if (count === 1) return 'Активный сервер';
    return 'Proxy-направления';
  }

  function proxyDirectionDetail(summary) {
    const count = summary.outbounds.size + summary.balancers.size;
    if (!count) return 'Proxy-направления пока не настроены.';
    if (count === 1 && summary.balancers.size === 1) {
      const item = [...summary.balancers.values()][0];
      return `${item.tag} · ${item.rules || 0} правил ведут в балансировщик`;
    }
    if (count === 1) {
      const item = [...summary.outbounds.values()][0];
      return item.implicit ? 'Основное направление будет использовано для новых proxy-правил.' : `${item.rules || 0} proxy-правил ведут в этот сервер`;
    }
    return `${count} активных направлений · ${summary.total || 0} proxy-правил распределены по серверам и группам`;
  }

  function dashboardProxyDirectionCards(summary) {
    const cards = [
      ...[...summary.outbounds.values()].map((item) => ({ ...item, kind: 'server' })),
      ...[...summary.balancers.values()].map((item) => ({ ...item, kind: 'balancer' }))
    ];
    if (cards.length <= 1) return '';
    return `<div class="dashboard-proxy-directions">
      ${cards.map((item) => {
        const detail = item.kind === 'balancer'
          ? 'Балансировщик'
          : outboundAddress(proxyOutbounds().find((outbound) => outbound?.tag === item.tag)) || 'сервер';
        return `<article>
          <span>${item.kind === 'balancer' ? 'Группа' : 'Сервер'}</span>
          <strong>${escapeHtml(item.tag)}</strong>
          <small>${escapeHtml(`${item.rules || 0} правил · ${detail}`)}</small>
        </article>`;
      }).join('')}
    </div>`;
  }

  function balancerSelectorMatches(selectors) {
    const prefixes = splitRouteValues(selectors);
    if (!prefixes.length) return [];
    return proxyOutbounds()
      .map((item) => item?.tag)
      .filter(Boolean)
      .filter((tag) => prefixes.some((prefix) => tag.startsWith(prefix)));
  }

  function balancerTargetOptions() {
    const pools = new Map((state.subscriptionPools || []).map((pool) => [pool?.tag, pool]).filter(([tag]) => tag));
    const targets = [];
    const seen = new Set();
    proxyOutbounds().forEach((outbound) => {
      const tag = outbound?.tag || '';
      if (!tag || seen.has(tag)) return;
      seen.add(tag);
      const pool = pools.get(tag);
      targets.push({
        tag,
        kind: pool ? 'subscription' : 'server',
        title: tag,
        detail: pool
          ? `${pool.count || 0} кандидатов · активен ${pool.activeCandidate?.tag || 'сервер не выбран'}`
          : `${outboundAddress(outbound)} · ${outboundTransport(outbound)}`
      });
    });
    (state.subscriptionPools || []).forEach((pool) => {
      const tag = pool?.tag || '';
      if (!tag || seen.has(tag)) return;
      seen.add(tag);
      targets.push({
        tag,
        kind: 'subscription',
        title: tag,
        detail: `${pool.count || 0} кандидатов · stable outbound подписки`
      });
    });
    return targets;
  }

  function balancerMatchesTag(tag, balancer = {}) {
    const selectors = Array.isArray(balancer.selector) ? balancer.selector.filter(Boolean) : [];
    return selectors.some((selector) => String(tag || '').startsWith(String(selector || '').trim()));
  }

  function serverSubscriptionPool(tag) {
    return (state.subscriptionPools || []).find((pool) => pool?.tag === tag) || null;
  }

  function serverBalancerLinks(tag) {
    return routeBalancers().filter((balancer) => balancerMatchesTag(tag, balancer) || balancer?.fallbackTag === tag);
  }

  function serverObserverLabels(outbound) {
    const labels = [];
    if (outboundMatchesSelectors(outbound, observatorySelectors())) labels.push('наблюдение');
    if (outboundMatchesSelectors(outbound, burstObservatorySelectors())) labels.push('burst');
    return labels;
  }

  function serverMetaForTag(tag) {
    return state.serverMeta?.[tag] || {};
  }

  function serverLocationForOutbound(outbound) {
    return serverLocation(outbound, serverMetaForTag(outbound?.tag));
  }

  function serverLocationChip(outbound) {
    const location = serverLocationForOutbound(outbound);
    const tone = location.source === 'unknown' ? 'muted' : 'info';
    return `<span class="server-location-chip ${tone}" title="${escapeHtml(location.label)}">
      ${countryFlagMarkup(location.code)}
    </span>`;
  }

  function serverMetaChips(outbound, usage, check) {
    const tag = outbound?.tag || '';
    const pool = serverSubscriptionPool(tag);
    const balancers = serverBalancerLinks(tag);
    const observers = serverObserverLabels(outbound);
    const location = serverLocationForOutbound(outbound);
    const chips = [
      { label: usage ? `в правилах: ${usage}` : 'без правил', tone: usage ? 'ok' : 'muted' }
    ];
    if (location.source !== 'unknown') chips.push({ label: `${location.code} · ${location.label}`, tone: 'info' });
    if (pool) chips.push({ label: `подписка: ${pool.count || 0}`, tone: 'info' });
    if (balancers.length) chips.push({ label: `группа: ${balancers.map((item) => item.tag).filter(Boolean).slice(0, 2).join(', ')}${balancers.length > 2 ? ` +${balancers.length - 2}` : ''}`, tone: 'info' });
    if (observers.length) chips.push({ label: observers.join(' + '), tone: 'ok' });
    if (check) {
      const ping = check.pingOk ? `ping ${check.pingLatencyMs || 0} мс` : 'ping нет';
      const tcp = check.endpointOk ? 'порт открыт' : 'порт закрыт';
      const http = check.httpOk === true ? `HTTP ${check.httpLatencyMs || check.latencyMs || 0} мс` : check.method === 'http' ? 'HTTP нет' : '';
      chips.push({ label: [ping, tcp, http].filter(Boolean).join(' · '), tone: check.ok ? 'ok' : check.endpointOk ? 'warn' : 'bad' });
    } else {
      chips.push({ label: 'не проверен', tone: 'muted' });
    }
    return `<div class="server-meta-chips">${chips.map((chip) => `<span class="server-chip ${chip.tone}">${escapeHtml(chip.label)}</span>`).join('')}</div>`;
  }

  function balancerObserverSummary(balancer = {}) {
    const strategy = balancer?.strategy?.type || 'random';
    const type = strategyObserverType(strategy);
    if (!type) return { label: 'может работать без наблюдения', tone: 'ok' };
    const required = Array.isArray(balancer.selector) ? balancer.selector.filter(Boolean) : [];
    const configured = type === 'burstObservatory' ? burstObservatorySelectors() : observatorySelectors();
    const covered = required.length && required.every((selector) => configured.includes(selector));
    return {
      label: covered ? `${observerLabel(type)} · может работать` : `${observerLabel(type)} · нужно включить`,
      tone: covered ? 'ok' : 'warn'
    };
  }

  function balancerMembersView(tags = []) {
    if (!tags.length) return '<div class="balancer-members muted">серверы не выбраны</div>';
    return `<div class="balancer-members">
      ${tags.slice(0, 6).map((tag) => {
        const outbound = proxyOutbounds().find((item) => item?.tag === tag);
        const check = checkForTag(tag);
        return `<span class="${check?.ok ? 'ok' : check ? 'warn' : ''}" title="${escapeHtml(outboundAddress(outbound))}">
          ${escapeHtml(tag)}
        </span>`;
      }).join('')}
      ${tags.length > 6 ? `<span>+${tags.length - 6}</span>` : ''}
    </div>`;
  }

  return {
    outboundUsage,
    serverStats,
    isSystemOutbound,
    proxyOutbounds,
    inferredActiveProxyTag,
    activeProxyTag,
    activeProxyOutbound,
    setActiveServerTag,
    proxyRuleStrategyStats,
    proxyRuleSampleLabel,
    proxyDirectionSummary,
    proxyDirectionTitle,
    proxyDirectionDetail,
    dashboardProxyDirectionCards,
    balancerSelectorMatches,
    balancerTargetOptions,
    balancerMatchesTag,
    serverSubscriptionPool,
    serverBalancerLinks,
    serverObserverLabels,
    serverMetaForTag,
    serverLocationForOutbound,
    serverLocationChip,
    serverMetaChips,
    balancerObserverSummary,
    balancerMembersView
  };
}
