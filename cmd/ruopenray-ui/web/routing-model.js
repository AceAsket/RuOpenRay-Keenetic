import { countryFlagMarkup, flagForCountry, serverLocation } from './server-location.js';
import { isFragmentOutboundTag } from './outbound-tags.js';

const privateBypassValues = new Set([
  'geoip:private',
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '224.0.0.0/3',
  '::1/128',
  'fc00::/7',
  'fe80::/10'
]);

export function createRoutingModel({ state, managedRouteTags, routeBundles, routeKinds, routePresets, proxyOutbounds, checkForTag, checkLabel, outboundAddress, persistRouteNames }) {
  function routeRules() {
    if (!state.config.routing || typeof state.config.routing !== 'object') state.config.routing = {};
    if (!Array.isArray(state.config.routing.rules)) state.config.routing.rules = [];
    return state.config.routing.rules;
  }
  
  function routeBalancers() {
    if (!state.config.routing || typeof state.config.routing !== 'object') state.config.routing = {};
    if (!Array.isArray(state.config.routing.balancers)) state.config.routing.balancers = [];
    return state.config.routing.balancers;
  }
  
  function outboundOptions() {
    const names = new Set(['proxy', 'direct', 'block']);
    for (const outbound of Array.isArray(state.config.outbounds) ? state.config.outbounds : []) {
      if (outbound?.tag && !isFragmentOutboundTag(outbound.tag)) names.add(outbound.tag);
    }
    for (const pool of Array.isArray(state.subscriptionPools) ? state.subscriptionPools : []) {
      if (pool?.tag) names.add(pool.tag);
    }
    names.delete('dns-out');
    names.delete('ruopenray-api');
    return [...names];
  }
  
  function balancerOptions() {
    return routeBalancers().map((item) => item?.tag).filter(Boolean);
  }

  function outboundByTag(tag) {
    return (Array.isArray(state.config.outbounds) ? state.config.outbounds : [])
      .find((outbound) => outbound?.tag === tag) || null;
  }

  function subscriptionPoolByTag(tag) {
    return (Array.isArray(state.subscriptionPools) ? state.subscriptionPools : [])
      .find((pool) => pool?.tag === tag) || null;
  }

  function routeTargetOutbound(tag) {
    return outboundByTag(tag) || subscriptionPoolByTag(tag)?.activeCandidate || null;
  }

  function isProxyTargetTag(tag) {
    if (['proxy', 'direct', 'block', 'dns-out'].includes(tag) || isFragmentOutboundTag(tag)) return false;
    const outbound = routeTargetOutbound(tag);
    if (!outbound) return false;
    return !['freedom', 'blackhole', 'dns'].includes(outbound?.protocol);
  }

  function routeTargetOptionLabel(tag) {
    if (!isProxyTargetTag(tag)) return readableRouteTag(tag);
    const pool = subscriptionPoolByTag(tag);
    const location = serverLocation(routeTargetOutbound(tag), state.serverMeta?.[tag] || {});
    const flag = flagForCountry(location.code);
    const suffix = pool ? ` · подписка${pool.activeCandidate?.tag ? `: ${pool.activeCandidate.tag}` : ''}` : '';
    return `${flag ? `${flag} ` : ''}${readableRouteTag(tag)}${suffix}`;
  }
  
  function routeTargetOptions() {
    return [
      ...outboundOptions().map((tag) => ({ value: `outbound:${tag}`, label: routeTargetOptionLabel(tag) })),
      ...balancerOptions().map((tag) => ({ value: `balancer:${tag}`, label: `Балансировщик · ${tag}` }))
    ];
  }
  
  function routeTargetFlagMarkup(encodedTarget) {
    const [type, ...parts] = String(encodedTarget || '').split(':');
    if (type !== 'outbound') return '';
    const tag = parts.join(':');
    if (!isProxyTargetTag(tag)) return '';
    const location = serverLocation(routeTargetOutbound(tag), state.serverMeta?.[tag] || {});
    return countryFlagMarkup(location.code);
  }

  function routeTargetStatus(encodedTarget) {
    const [type, ...parts] = String(encodedTarget || '').split(':');
    if (type !== 'outbound') return null;
    const tag = parts.join(':');
    if (!isProxyTargetTag(tag)) return null;
    const check = checkForTag(tag);
    if (!check) return { tone: 'unknown', label: 'не проверялся' };
    if (check.ok) return { tone: 'ok', label: checkLabel(check) || 'работает' };
    return { tone: 'bad', label: checkLabel(check) || 'нет ответа' };
  }
  
  function encodedRouteTarget(rule) {
    if (rule?.balancerTag) return `balancer:${rule.balancerTag}`;
    return `outbound:${rule?.outboundTag || 'proxy'}`;
  }
  
  function splitRouteValues(value) {
    return String(value || '')
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function isDefaultRoute(rule) {
    if (!rule) return false;
    const hasTarget = Boolean(rule.outboundTag || rule.balancerTag);
    const network = String(rule.network || '').replace(/\s+/g, '').toLowerCase();
    const isAllNetwork = !rule.network || network === 'tcp,udp' || network === 'udp,tcp';
    const hasConditions = Boolean(
      (Array.isArray(rule.domain) && rule.domain.length) ||
      (Array.isArray(rule.ip) && rule.ip.length) ||
      (Array.isArray(rule.source) && rule.source.length) ||
      (Array.isArray(rule.inboundTag) && rule.inboundTag.length) ||
      !isAllNetwork ||
      (rule.port && String(rule.port) !== '0-65535')
    );
    return hasTarget && !hasConditions;
  }
  
  function routeTarget(rule) {
    if (isDefaultRoute(rule)) return { kind: 'default', values: ['все, что не совпало выше'] };
    if (Array.isArray(rule.domain) && rule.domain.length) return { kind: 'domain', values: rule.domain };
    if (Array.isArray(rule.ip) && rule.ip.length) return { kind: 'ip', values: rule.ip };
    if (Array.isArray(rule.source) && rule.source.length) return { kind: 'source', values: rule.source };
    if (Array.isArray(rule.inboundTag) && rule.inboundTag.length) return { kind: 'inboundTag', values: rule.inboundTag };
    if (rule.port) return { kind: 'port', values: [rule.port] };
    return { kind: 'other', values: ['особое правило'] };
  }
  
  function routeRuleKey(rule) {
    const target = routeTarget(rule || {});
    return JSON.stringify({
      type: rule?.type || 'field',
      outboundTag: rule?.outboundTag || '',
      balancerTag: rule?.balancerTag || '',
      network: rule?.network || '',
      kind: target.kind,
      values: target.values
    });
  }
  
  function saveRouteNames() {
    if (typeof persistRouteNames === 'function') persistRouteNames(state.routeNames);
  }
  
  function compactRouteValue(value) {
    return String(value || '')
      .replace(/^domain:/, '')
      .replace(/^regexp:/, '')
      .replace(/^full:/, '')
      .replace(/^geosite:/, 'geosite:')
      .replace(/^geoip:/, 'geoip:')
      .replace(/^ext:"?([^":]+).*$/i, '$1')
      .replace(/\\/g, '')
      .trim();
  }
  
  function readableRouteTag(tag) {
    if (isFragmentOutboundTag(tag)) return 'Фрагментация TLS (служебно)';
    return managedRouteTags[String(tag || '')] || String(tag || '');
  }
  
  function routeTagValue(value, kind = '') {
    const raw = String(value || '');
    const readable = readableRouteTag(raw);
    if (readable === raw) return raw;
    return kind === 'full' ? `${readable} (${raw})` : readable;
  }
  
  function routeHasInbound(rule, tag) {
    return Array.isArray(rule?.inboundTag) && rule.inboundTag.includes(tag);
  }

  function isPrivateBypassValue(value) {
    return privateBypassValues.has(String(value || '').trim().toLowerCase());
  }

  function isTransparentLocalBypassRoute(rule) {
    const ips = Array.isArray(rule?.ip) ? rule.ip : [];
    const hasUserTargets = Boolean(
      (Array.isArray(rule?.domain) && rule.domain.length) ||
      (Array.isArray(rule?.source) && rule.source.length) ||
      rule?.port ||
      rule?.balancerTag
    );
    return rule?.outboundTag === 'direct' &&
      routeHasInbound(rule, 'transparent_ipv4') &&
      ips.length > 0 &&
      !hasUserTargets &&
      ips.every(isPrivateBypassValue);
  }

  function isTransparentCatchAllRoute(rule) {
    if (!routeHasInbound(rule, 'transparent_ipv4')) return false;
    return !(
      (Array.isArray(rule?.domain) && rule.domain.length) ||
      (Array.isArray(rule?.ip) && rule.ip.length) ||
      (Array.isArray(rule?.source) && rule.source.length) ||
      rule?.network ||
      rule?.port ||
      rule?.balancerTag
    );
  }
  
  function isRuOpenRayManagedRoute(rule) {
    if (!rule) return false;
    if (rule.outboundTag === 'ruopenray-api' && routeHasInbound(rule, 'ruopenray-api')) return true;
    if (rule.outboundTag === 'dns-out' && routeHasInbound(rule, 'ruopenray_dns_in')) return true;
    if (rule.outboundTag === 'dns-out' && String(rule.port || '') === '53') return true;
    if (isTransparentLocalBypassRoute(rule)) return true;
    if (isTransparentCatchAllRoute(rule)) return true;
    return false;
  }
  
  function managedRouteName(rule) {
    if (rule.outboundTag === 'ruopenray-api' && routeHasInbound(rule, 'ruopenray-api')) return 'Статистика Xray';
    if (rule.outboundTag === 'dns-out' && routeHasInbound(rule, 'ruopenray_dns_in')) return 'DNS через RuOpenRay';
    if (rule.outboundTag === 'dns-out' && String(rule.port || '') === '53') return 'DNS-запросы на Xray';
    if (isTransparentLocalBypassRoute(rule)) return 'Локальная сеть и роутер напрямую';
    if (isTransparentCatchAllRoute(rule)) return 'Лишнее правило перехвата LAN';
    return '';
  }
  
  function managedRouteDetail(rule) {
    if (rule.outboundTag === 'ruopenray-api' && routeHasInbound(rule, 'ruopenray-api')) return 'Служебный маршрут для локального Xray StatsService API';
    if (rule.outboundTag === 'dns-out' && routeHasInbound(rule, 'ruopenray_dns_in')) return 'Служебный маршрут: DNS с 127.0.0.1:10535 отправляется в DNS-выход Xray';
    if (rule.outboundTag === 'dns-out' && String(rule.port || '') === '53') return 'Служебный маршрут для DNS-запросов';
    if (isTransparentLocalBypassRoute(rule)) return 'Когда firewall перехватил LAN-пакет и отправил его в transparent_ipv4, это правило пропускает локальные и приватные адреса напрямую, чтобы не ломать доступ к роутеру и домашней сети.';
    if (isTransparentCatchAllRoute(rule)) return 'Это старое или ручное правило отправляет весь LAN-трафик из transparent inbound сразу в один outbound и мешает обычным правилам Xray. Подготовка черновика перехвата удалит его.';
    return '';
  }
  
  function guessRouteRuleName(rule, info) {
    const target = routeTarget(rule || {});
    const raw = target.values.join(' ').toLowerCase();
    const first = compactRouteValue(target.values[0]);
    const managedName = managedRouteName(rule || {});
    if (managedName) return managedName;
    if (raw.includes('geoip:private') || raw.includes('10.0.0.0/8') || raw.includes('192.168.0.0/16') || raw.includes('172.16.0.0/12')) return 'Локальная сеть';
    if (raw.includes('antifilter')) return 'Antifilter community';
    if (raw.includes('discord')) return rule.network === 'udp' ? 'Discord UDP' : 'Discord';
    if (raw.includes('telegram') || raw.includes('91.108.') || raw.includes('149.154.')) return rule.network === 'udp' ? 'Telegram calls' : 'Telegram';
    if (raw.includes('nintendo')) return 'Nintendo eShop';
    if (raw.includes('openai') || raw.includes('chatgpt')) return 'ChatGPT / OpenAI';
    if (raw.includes('gemini') || raw.includes('ai.google')) return 'Google AI';
    if (raw.includes('youtube') || raw.includes('googlevideo') || raw.includes('ytimg')) return 'YouTube';
    if (raw.includes('cloudflare') || raw.includes('104.16.0.0/12') || raw.includes('188.114.96.0/20')) return 'Cloudflare UDP';
    if (raw.includes('66.22.192.0/18')) return 'Discord voice';
    if (target.kind === 'default') return 'Остальной трафик';
    if (target.kind === 'source') return `Устройство ${first}`;
    if (target.kind === 'port') return `Порты ${first}`;
    if (target.kind === 'inboundTag') return `Входящий поток ${routeTagValue(first)}`;
    if (first) return first.length > 42 ? `${first.slice(0, 42)}…` : first;
    return info?.kind || 'Правило маршрутизации';
  }
  
  function routeRuleName(rule, info) {
    const saved = state.routeNames[routeRuleKey(rule)];
    return saved || guessRouteRuleName(rule, info);
  }
  
  function setRouteRuleName(rule, name) {
    const key = routeRuleKey(rule);
    const cleanName = String(name || '').trim();
    if (cleanName) state.routeNames[key] = cleanName;
    else delete state.routeNames[key];
    saveRouteNames();
  }
  
  function copyRouteRuleName(fromRule, toRule) {
    const oldKey = routeRuleKey(fromRule);
    const name = state.routeNames[oldKey];
    if (!name) return;
    state.routeNames[routeRuleKey(toRule)] = name;
    delete state.routeNames[oldKey];
    saveRouteNames();
  }
  
  function describeRouteRule(rule) {
    const target = routeTarget(rule || {});
    const values = target.values.map((value) => target.kind === 'inboundTag' ? routeTagValue(value) : value).join(', ');
    const fullValues = target.values.map((value) => target.kind === 'inboundTag' ? routeTagValue(value, 'full') : value).join(', ');
    const network = rule.network ? ` · ${rule.network}` : '';
    const outbound = rule.balancerTag ? `Балансировщик · ${rule.balancerTag}` : readableRouteTag(rule.outboundTag || 'не задано');
    const managedDetail = managedRouteDetail(rule || {});
    if (target.kind === 'default') {
      return {
        kind: routeKinds.default || 'Остальной трафик',
        value: 'если правила выше не совпали',
        fullValue: 'catch-all правило Xray',
        outbound,
        detail: managedDetail || 'default / catch-all'
      };
    }
    return {
      kind: routeKinds[target.kind] || 'Другое',
      value: values.length > 96 ? `${values.slice(0, 96)}…` : values,
      fullValue: fullValues,
      outbound,
      detail: managedDetail || `${rule.type || 'field'}${network}`
    };
  }
  
  function routeStats() {
    const stats = { proxy: 0, direct: 0, block: 0, other: 0 };
    for (const rule of routeRules()) {
      const category = routeCategoryForRule(rule);
      stats[category] = (stats[category] || 0) + 1;
    }
    return stats;
  }
  
  function routeSectionDefinitions(stats = routeStats()) {
    return [
      { id: 'proxy', title: 'Через proxy', count: stats.proxy, detail: 'Сайты и устройства через сервер' },
      { id: 'direct', title: 'Напрямую', count: stats.direct, detail: 'Обход прокси и локальная сеть' },
      { id: 'block', title: 'Блокировка', count: stats.block, detail: 'Остановленные направления' },
      { id: 'other', title: 'Другое', count: stats.other, detail: 'DNS, API и особые маршруты' }
    ];
  }
  
  function routeCategoryForRule(rule) {
    if (isRuOpenRayManagedRoute(rule)) return 'other';
    if (rule?.balancerTag) return 'proxy';
    const outbound = rule?.outboundTag || '';
    const subscriptionTags = (state.subscriptionPools || []).map((pool) => pool?.tag).filter(Boolean);
    const proxyTags = new Set(['proxy', ...proxyOutbounds().map((item) => item?.tag).filter(Boolean), ...subscriptionTags]);
    if (proxyTags.has(outbound)) return 'proxy';
    if (outbound === 'direct') return 'direct';
    if (outbound === 'block') return 'block';
    return 'other';
  }

  function routeRuleSource(rule) {
    if (isRuOpenRayManagedRoute(rule)) return 'Служебное правило RuOpenRay';
    const encoded = JSON.stringify(rule || {});
    for (const [key, preset] of Object.entries(routePresets)) {
      if (JSON.stringify(preset.rule) === encoded) return `Подборка: ${preset.title}`;
    }
    for (const [key, bundle] of Object.entries(routeBundles)) {
      const match = (bundle.rules || []).some((item) => JSON.stringify(item) === encoded);
      if (match) return `Подборка: ${bundle.title}`;
    }
    if (Array.isArray(rule?.source) && rule.source.length) return 'Устройство LAN';
    if (state.routeNames[routeRuleKey(rule)]) return 'Пользовательское правило';
    return 'Из профиля';
  }
  
  function routeStatsFor(rules) {
    const stats = { proxy: 0, direct: 0, block: 0, other: 0 };
    for (const rule of rules || []) {
      const category = routeCategoryForRule(rule);
      stats[category] = (stats[category] || 0) + 1;
    }
    return stats;
  }

  return {
    routeRules,
    routeBalancers,
    outboundOptions,
    balancerOptions,
    routeTargetOptions,
    routeTargetFlagMarkup,
    routeTargetStatus,
    encodedRouteTarget,
    splitRouteValues,
    routeTarget,
    routeRuleKey,
    saveRouteNames,
    compactRouteValue,
    readableRouteTag,
    routeTagValue,
    routeHasInbound,
    isDefaultRoute,
    isRuOpenRayManagedRoute,
    managedRouteName,
    managedRouteDetail,
    guessRouteRuleName,
    routeRuleName,
    setRouteRuleName,
    copyRouteRuleName,
    describeRouteRule,
    routeStats,
    routeSectionDefinitions,
    routeCategoryForRule,
    routeRuleSource,
    routeStatsFor
  };
}
