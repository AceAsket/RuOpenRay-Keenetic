export function createObservatoryActions({
  state,
  syncConfig,
  render,
  routeBalancers,
  proxyOutbounds,
  checkServers
}) {
  function mergeObservatoryIntoConfig(config, selectors) {
    const next = JSON.parse(JSON.stringify(config || {}));
    const current = next.observatory && typeof next.observatory === 'object' ? next.observatory : {};
    const existing = Array.isArray(current.subjectSelector) ? current.subjectSelector : [];
    const subjectSelector = [...new Set([...existing, ...selectors.filter(Boolean)])];
    const probeURL = String(state.serverCheckUrl || current.probeURL || 'https://www.gstatic.com/generate_204').trim() || 'https://www.gstatic.com/generate_204';
    const probeInterval = normalizeObservatoryInterval(state.observatoryInterval || current.probeInterval || '10s');
    next.observatory = {
      ...current,
      subjectSelector,
      probeURL,
      probeInterval
    };
    return next;
  }

  function mergeBurstObservatoryIntoConfig(config, selectors) {
    const next = JSON.parse(JSON.stringify(config || {}));
    const current = next.burstObservatory && typeof next.burstObservatory === 'object' ? next.burstObservatory : {};
    const existing = Array.isArray(current.subjectSelector) ? current.subjectSelector : [];
    const subjectSelector = [...new Set([...existing, ...selectors.filter(Boolean)])];
    const currentPing = current.pingConfig && typeof current.pingConfig === 'object' ? current.pingConfig : {};
    const destination = String(state.serverCheckUrl || currentPing.destination || 'https://connectivitycheck.gstatic.com/generate_204').trim() || 'https://connectivitycheck.gstatic.com/generate_204';
    const interval = normalizeObservatoryInterval(state.observatoryInterval || currentPing.interval || '1m');
    next.burstObservatory = {
      ...current,
      subjectSelector,
      pingConfig: {
        ...currentPing,
        destination,
        interval,
        sampling: Number(currentPing.sampling || 10),
        timeout: currentPing.timeout || '5s',
        httpMethod: currentPing.httpMethod || 'HEAD'
      }
    };
    return next;
  }

  function normalizeObservatoryInterval(value) {
    const text = String(value || '').trim();
    if (!text) return '10s';
    if (/^\d+$/.test(text)) return `${text}s`;
    return /^(?:\d+(?:ns|us|ms|s|m|h))+$/.test(text) ? text : '10s';
  }

  function strategyObserverType(strategy) {
    if (strategy === 'leastPing') return 'observatory';
    if (strategy === 'leastLoad') return 'burstObservatory';
    return '';
  }

  function strategyNeedsObservatory(strategy) {
    return Boolean(strategyObserverType(strategy));
  }

  function observatoryConfig() {
    return state.config?.observatory && typeof state.config.observatory === 'object' ? state.config.observatory : {};
  }

  function burstObservatoryConfig() {
    return state.config?.burstObservatory && typeof state.config.burstObservatory === 'object' ? state.config.burstObservatory : {};
  }

  function observatorySelectors() {
    return Array.isArray(observatoryConfig().subjectSelector) ? observatoryConfig().subjectSelector.filter(Boolean) : [];
  }

  function burstObservatorySelectors() {
    return Array.isArray(burstObservatoryConfig().subjectSelector) ? burstObservatoryConfig().subjectSelector.filter(Boolean) : [];
  }

  function outboundMatchesSelectors(outbound, selectors = observatorySelectors()) {
    const tag = String(outbound?.tag || '');
    return selectors.some((selector) => tag.includes(String(selector || '').trim()));
  }

  function observatoryMatchedOutbounds() {
    const selectors = observatorySelectors();
    if (!selectors.length) return [];
    return proxyOutbounds().filter((outbound) => outboundMatchesSelectors(outbound, selectors));
  }

  function observatoryRequiredBalancers() {
    return routeBalancers().filter((balancer) => strategyNeedsObservatory(balancer?.strategy?.type));
  }

  function applyObserverForStrategy(config, strategy, selectors) {
    if (strategy === 'leastLoad') return mergeBurstObservatoryIntoConfig(config, selectors);
    if (strategy === 'leastPing') return mergeObservatoryIntoConfig(config, selectors);
    return config;
  }

  function observerLabel(type) {
    if (type === 'burstObservatory') return 'проверка нагрузки';
    if (type === 'observatory') return 'проверка задержки';
    return 'не требуется';
  }

  function balancerStrategyLabel(strategy) {
    return {
      random: 'случайно',
      roundRobin: 'по очереди',
      leastPing: 'меньший ping',
      leastLoad: 'меньшая нагрузка'
    }[strategy] || strategy || 'случайно';
  }

  function enableObservatoryForProxy() {
    const tags = proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean);
    if (!tags.length) {
      state.message = 'Сначала добавьте хотя бы один прокси-сервер';
      render();
      return;
    }
    const required = observatoryRequiredBalancers();
    const leastPingSelectors = [];
    const leastLoadSelectors = [];
    required.forEach((balancer) => {
      const selectors = Array.isArray(balancer.selector) ? balancer.selector.filter(Boolean) : [];
      if (strategyObserverType(balancer?.strategy?.type) === 'burstObservatory') leastLoadSelectors.push(...selectors);
      if (strategyObserverType(balancer?.strategy?.type) === 'observatory') leastPingSelectors.push(...selectors);
    });
    let nextConfig = state.config;
    if (leastPingSelectors.length || (!leastLoadSelectors.length && !required.length)) {
      nextConfig = mergeObservatoryIntoConfig(nextConfig, leastPingSelectors.length ? leastPingSelectors : tags);
    }
    if (leastLoadSelectors.length) {
      nextConfig = mergeBurstObservatoryIntoConfig(nextConfig, leastLoadSelectors);
    }
    syncConfig(nextConfig);
    const parts = [
      leastPingSelectors.length || (!leastLoadSelectors.length && !required.length) ? 'проверка задержки' : '',
      leastLoadSelectors.length ? 'проверка нагрузки' : ''
    ].filter(Boolean).join(' и ');
    state.message = `${parts || 'Автопроверка'} включена для прокси-серверов. Проверьте конфигурацию и примените.`;
    render();
  }

  async function checkObservatoryTargets() {
    const selectors = [...new Set([...observatorySelectors(), ...burstObservatorySelectors()])];
    const tags = selectors.length ? proxyOutbounds().filter((outbound) => outboundMatchesSelectors(outbound, selectors)).map((outbound) => outbound.tag).filter(Boolean) : [];
    const fallbackTags = proxyOutbounds().map((outbound) => outbound?.tag).filter(Boolean);
    await checkServers(tags.length ? tags : fallbackTags);
  }

  return {
    mergeObservatoryIntoConfig,
    mergeBurstObservatoryIntoConfig,
    normalizeObservatoryInterval,
    strategyObserverType,
    strategyNeedsObservatory,
    observatoryConfig,
    burstObservatoryConfig,
    observatorySelectors,
    burstObservatorySelectors,
    outboundMatchesSelectors,
    observatoryMatchedOutbounds,
    observatoryRequiredBalancers,
    applyObserverForStrategy,
    observerLabel,
    balancerStrategyLabel,
    enableObservatoryForProxy,
    checkObservatoryTargets
  };
}
