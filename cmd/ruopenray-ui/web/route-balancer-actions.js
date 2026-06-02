export function createRouteBalancerActions({
  state,
  render,
  routeBalancers,
  routeRules,
  splitRouteValues,
  setRouteBalancersDraft,
  syncConfig,
  strategyObserverType,
  applyObserverForStrategy,
  observerLabel
}) {
  function resetRouteBalancerForm() {
    state.routeBalancerEditingIndex = -1;
    state.routeBalancerTag = '';
    state.routeBalancerStrategy = 'random';
    state.routeBalancerSelectors = '';
    state.routeBalancerFallback = '';
  }

  function openRouteBalancerDialog(index = -1) {
    const balancer = routeBalancers()[index];
    if (balancer) {
      state.routeBalancerEditingIndex = index;
      state.routeBalancerTag = balancer.tag || '';
      state.routeBalancerStrategy = balancer.strategy?.type || 'random';
      state.routeBalancerSelectors = Array.isArray(balancer.selector) ? balancer.selector.join('\n') : '';
      state.routeBalancerFallback = balancer.fallbackTag || '';
    } else {
      resetRouteBalancerForm();
    }
    state.routeBalancerDialog = true;
    state.message = '';
    render();
  }

  function closeRouteBalancerDialog() {
    state.routeBalancerDialog = false;
    resetRouteBalancerForm();
    render();
  }

  function setRouteBalancerSelector(tag, enabled) {
    const selectors = splitRouteValues(state.routeBalancerSelectors);
    const next = enabled
      ? [...selectors, tag]
      : selectors.filter((item) => item !== tag);
    state.routeBalancerSelectors = [...new Set(next)].join('\n');
  }

  function moveRouteBalancerSelector(tag, direction) {
    const selectors = splitRouteValues(state.routeBalancerSelectors);
    const index = selectors.indexOf(tag);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= selectors.length) return;
    [selectors[index], selectors[nextIndex]] = [selectors[nextIndex], selectors[index]];
    state.routeBalancerSelectors = selectors.join('\n');
  }

  function saveRouteBalancer() {
    const tag = state.routeBalancerTag.trim();
    const selectors = splitRouteValues(state.routeBalancerSelectors);
    if (!tag) {
      state.message = 'Укажите имя балансировщика';
      render();
      return;
    }
    if (!selectors.length) {
      state.message = 'Выберите хотя бы один сервер или подписку для балансировщика';
      render();
      return;
    }
    const editing = state.routeBalancerEditingIndex;
    const exists = routeBalancers().some((item, index) => item?.tag === tag && index !== editing);
    if (exists) {
      state.message = `Балансировщик ${tag} уже есть`;
      render();
      return;
    }
    const balancer = {
      tag,
      selector: selectors,
      strategy: { type: state.routeBalancerStrategy || 'random' }
    };
    if (state.routeBalancerFallback.trim()) balancer.fallbackTag = state.routeBalancerFallback.trim();
    const balancers = [...routeBalancers()];
    if (editing >= 0 && balancers[editing]) balancers[editing] = balancer;
    else balancers.unshift(balancer);
    setRouteBalancersDraft(balancers);
    const observerType = strategyObserverType(balancer.strategy.type);
    if (observerType) syncConfig(applyObserverForStrategy(state.config, balancer.strategy.type, selectors));
    state.routeBalancer = tag;
    state.routeTargetType = 'balancer';
    state.routeBalancerDialog = false;
    resetRouteBalancerForm();
    state.message = `Группа серверов ${tag} сохранена в черновик${observerType ? `, ${observerLabel(observerType)} включен для Xray` : ''}`;
    render();
  }

  function removeRouteBalancer(index) {
    const balancer = routeBalancers()[index];
    if (!balancer) return;
    const used = routeRules().some((rule) => rule.balancerTag === balancer.tag);
    if (used) {
      state.message = `Балансировщик ${balancer.tag} используется в правилах. Сначала переназначьте эти правила.`;
      render();
      return;
    }
    setRouteBalancersDraft(routeBalancers().filter((_, itemIndex) => itemIndex !== index));
    if (state.routeBalancer === balancer.tag) state.routeBalancer = '';
    state.message = `Балансировщик ${balancer.tag} удален из черновика`;
    render();
  }

  return {
    resetRouteBalancerForm,
    openRouteBalancerDialog,
    closeRouteBalancerDialog,
    setRouteBalancerSelector,
    moveRouteBalancerSelector,
    saveRouteBalancer,
    removeRouteBalancer
  };
}
