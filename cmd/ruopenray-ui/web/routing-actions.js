import { routePresetExportIcon, routePresetIconView } from './route-visuals.js';
import {
  expandRoutePresetRules,
  routeRuleConditionKey
} from './routing-rule-helpers.js';
import {
  routePresetInstallSummaryFor,
  routePresetSequenceAt as findRoutePresetSequenceAt,
  routeRulePresetMatchesFor
} from './routing-groups.js';

export function createRoutingActions({
  state,
  render,
  request = async () => { throw new Error('API request is not configured'); },
  escapeHtml,
  routeKinds,
  routePresets,
  routeBundles,
  hiddenBuiltinRoutePresetKeys,
  parseRoutingDsl,
  isDslDefaultRule,
  dslPreviewStats,
  dslPreviewView,
  routeRules,
  setRoutingDraft,
  activeProxyTag,
  balancerOptions,
  splitRouteValues,
  routeTarget,
  routeRuleKey,
  readableRouteTag,
  encodedRouteTarget,
  isRuOpenRayManagedRoute,
  routeRuleName,
  setRouteRuleName,
  copyRouteRuleName,
  describeRouteRule,
  routeTargetFlagMarkup,
  routeTargetStatus,
  routeSectionDefinitions,
  routeCategoryForRule,
  routeRuleSource,
  routeTargetOptions,
  saveRouteNames,
  saveDisabledRouteRules
}) {
  function previewRoutingDsl() {
    state.routeDslPreview = parseRoutingDsl(state.routeDsl);
    const parsed = state.routeDslPreview;
    state.message = `Распознано правил: ${parsed.rules.length}${parsed.warnings.length ? `, предупреждений: ${parsed.warnings.length}` : ''}`;
    render();
  }

  function configAnalysisView() {
    const analysis = state.configAnalysis;
    if (!analysis) return '';
    const counts = analysis.counts || {};
    const lines = [
      ...(analysis.errors || []).map((text) => ['error', text]),
      ...(analysis.warnings || []).map((text) => ['warn', text]),
      ...(analysis.info || []).map((text) => ['info', text])
    ];
    return `
      <div class="config-analysis ${analysis.ok ? 'ok' : 'bad'}">
        <div class="analysis-head">
          <strong>${analysis.ok ? 'Правила выглядят согласованно' : 'Есть ошибки в правилах'}</strong>
          <span>${counts.total || 0} правил · proxy ${counts.proxy || 0} · direct ${counts.direct || 0} · block ${counts.block || 0} · другое ${counts.other || 0}</span>
        </div>
        ${lines.length ? `<ul>${lines.slice(0, 8).map(([kind, text]) => `<li class="${kind}">${escapeHtml(text)}</li>`).join('')}${lines.length > 8 ? `<li class="info">Еще ${lines.length - 8} сообщений...</li>` : ''}</ul>` : '<p class="muted">Отсутствующие geo-файлы и несуществующие outboundTag не найдены.</p>'}
      </div>
    `;
  }

  function applyRoutingDsl(mode, closeDialog = false) {
    const parsed = parseRoutingDsl(state.routeDsl);
    state.routeDslPreview = parsed;
    if (!parsed.rules.length) {
      state.message = 'Не нашёл правил для импорта';
      render();
      return;
    }
    const nextRules = mode === 'append' ? [...routeRules(), ...parsed.rules] : parsed.rules;
    setRoutingDraft(nextRules);
    const listName = state.routeDslName.trim();
    if (listName) {
      parsed.rules
        .filter((rule) => !isDslDefaultRule(rule, parsed))
        .forEach((rule) => setRouteRuleName(rule, listName));
    }
    state.message = mode === 'append'
      ? `Добавлено правил: ${parsed.rules.length}${listName ? ` · список «${listName}»` : ''}. Проверьте конфигурацию и примените изменения.`
      : `Черновик маршрутизации заменен: ${parsed.rules.length}${listName ? ` · список «${listName}»` : ''}. Проверьте конфигурацию и примените изменения.`;
    if (closeDialog) {
      state.routeRuleDialog = false;
      state.routeRuleMode = 'single';
    }
    render();
  }

  function addRoutingRule() {
    const values = splitRouteValues(state.routeValue);
    if (state.routeKind !== 'default' && !values.length) {
      state.message = 'Укажите сайт, IP, устройство или порт для правила';
      render();
      return;
    }
    const rule = { type: 'field' };
    if (state.routeTargetType === 'balancer') {
      if (!state.routeBalancer) {
        state.message = 'Выберите балансировщик или создайте его в маршрутизации';
        render();
        return;
      }
      rule.balancerTag = state.routeBalancer;
    } else {
      rule.outboundTag = state.routeOutbound;
    }
    if (state.routeKind === 'default') {
      rule.network = 'tcp,udp';
      setRouteRuleName(rule, state.routeName);
      setRoutingDraft([...routeRules(), rule]);
      state.routeName = '';
      state.routeValue = '';
      state.routeRuleDialog = false;
      state.message = 'Default-правило добавлено в конец черновика. Оно сработает только если правила выше не совпали.';
      render();
      return;
    }
    if (state.routeKind === 'port') {
      rule.port = values.join(',');
    } else {
      rule[state.routeKind] = values;
    }
    setRouteRuleName(rule, state.routeName);
    setRoutingDraft([rule, ...routeRules()]);
    state.routeName = '';
    state.routeValue = '';
    state.routeRuleDialog = false;
    state.message = 'Правило добавлено в черновик маршрутизации. Проверьте конфигурацию и примените изменения.';
    render();
  }

  function resetRouteRuleForm() {
    state.routeName = '';
    state.routeKind = 'domain';
    state.routeValue = '';
    state.routeOutbound = activeProxyTag() || 'proxy';
    state.routeTargetType = 'outbound';
    state.routeBalancer = balancerOptions()[0] || '';
    state.routeRuleMode = 'single';
    state.routeRuleEditingIndex = -1;
    state.routeRuleTestResult = null;
    state.routeValueMultiline = false;
  }

  function routeProbeHostsFromForm() {
    const values = splitRouteValues(state.routeValue);
    if (!values.length || state.routeKind === 'default' || state.routeKind === 'port' || state.routeKind === 'source' || state.routeKind === 'inboundTag') return [];
    const hosts = [];
    const push = (value) => {
      if (!value) return;
      if (state.routeKind === 'domain') {
        const clean = value
          .replace(/^(domain|full):/i, '')
          .replace(/^\*\./, '')
          .trim();
        if (!clean || /^(regexp|keyword|geosite):/i.test(value) || /[*()[\]\\]/.test(clean)) return;
        hosts.push(clean);
        return;
      }
      if (state.routeKind === 'ip' && !value.includes('/') && !value.includes(',')) hosts.push(value.trim());
    };
    values.forEach(push);
    return [...new Set(hosts)].slice(0, 8);
  }

  function latencyText(value) {
    const latency = Number(value);
    return Number.isFinite(latency) && latency > 0 ? `${Math.round(latency)} ms` : '';
  }

  function routeRuleTestDetail(tag, result) {
    const proxy = result?.proxy || {};
    const tcpProxy = result?.checks?.tcpProxy || {};
    if (proxy.ok) return `Через ${tag}: HTTP ${latencyText(proxy.latencyMs) || 'ok'}`;
    if (tcpProxy.ok) return `Через ${tag}: TCP ${latencyText(tcpProxy.latencyMs) || 'ok'}, HTTP не ответил`;
    return `Через ${tag}: ${proxy.error || tcpProxy.error || result?.stderr || 'нет ответа'}`;
  }

  async function testRouteRuleTarget() {
    state.routeRuleTestResult = null;
    const tag = state.routeTargetType === 'balancer' ? '' : String(state.routeOutbound || '').trim();
    if (!tag) {
      state.routeRuleTestResult = {
        ok: false,
        tone: 'pending',
        title: 'Выберите конкретный сервер',
        detail: 'Тест работает для outbound-сервера. Для балансировщика сначала выберите один сервер.'
      };
      render();
      return;
    }
    const hosts = routeProbeHostsFromForm();
    const host = hosts[0] || '';
    state.message = hosts.length
      ? `Проверяю ${hosts.length === 1 ? host : `${hosts.length} знач.`} через ${tag}...`
      : `Проверяю доступность ${tag}...`;
    render();
    try {
      if (hosts.length) {
        const results = [];
        for (const probeHost of hosts) {
          const result = await request('/api/diagnostics/domain-probe', {
            method: 'POST',
            body: JSON.stringify({
              host: probeHost,
              tag,
              timeoutMs: Math.max(1500, Number(state.serverCheckTimeout || 5000))
            })
          });
          results.push({ host: probeHost, ...result });
        }
        const passed = results.filter((result) => Boolean(result?.proxy?.ok || result?.checks?.tcpProxy?.ok));
        const proxyOk = passed.length === results.length;
        const firstFailed = results.find((result) => !Boolean(result?.proxy?.ok || result?.checks?.tcpProxy?.ok));
        state.routeRuleTestResult = {
          ok: proxyOk,
          tone: proxyOk ? 'both-ok' : 'bad',
          title: hosts.length === 1
            ? `${host}: ${results[0]?.verdict?.label || (proxyOk ? 'работает через сервер' : 'нет ответа через сервер')}`
            : `Список: ${passed.length}/${results.length} работает через ${tag}`,
          detail: hosts.length === 1
            ? routeRuleTestDetail(tag, results[0])
            : (firstFailed ? `${firstFailed.host || 'значение'}: ${routeRuleTestDetail(tag, firstFailed)}` : `Проверено значений: ${results.length}`)
        };
        state.message = state.routeRuleTestResult.title;
      } else {
        const result = await request('/api/outbounds/check', {
          method: 'POST',
          body: JSON.stringify({
            tags: [tag],
            timeoutMs: Math.max(5000, Number(state.serverCheckTimeout) || 5000),
            attempts: Math.max(3, Number(state.serverCheckAttempts) || 3),
            mode: state.serverCheckMode || 'http',
            url: state.serverCheckUrl || 'https://www.gstatic.com/generate_204'
          })
        });
        const item = (result.results || [])[0] || {};
        const ok = Boolean(item.ok || item.endpointOk);
        state.routeRuleTestResult = {
          ok,
          tone: ok ? 'both-ok' : 'bad',
          title: `${tag}: ${ok ? 'сервер отвечает' : 'сервер не ответил'}`,
          detail: ok
            ? `Проверка ${item.method || result.mode || 'http'} ${latencyText(item.latencyMs || item.endpointLatencyMs) || 'ok'}`
            : (item.error || 'У этого типа правила нет одного домена для HTTP-теста')
        };
        state.message = state.routeRuleTestResult.title;
      }
    } catch (error) {
      state.routeRuleTestResult = {
        ok: false,
        tone: 'bad',
        title: 'Тест не завершился',
        detail: error.message || String(error)
      };
      state.message = state.routeRuleTestResult.detail;
    } finally {
      render();
    }
  }

  function routeRuleFromForm(baseRule = {}) {
    const values = splitRouteValues(state.routeValue);
    if (state.routeKind !== 'default' && !values.length) return null;
    const rule = { ...baseRule, type: baseRule.type || 'field' };
    delete rule.domain;
    delete rule.ip;
    delete rule.source;
    delete rule.port;
    delete rule.inboundTag;
    delete rule.network;
    delete rule.outboundTag;
    delete rule.balancerTag;
    if (state.routeTargetType === 'balancer') {
      if (!state.routeBalancer) return null;
      rule.balancerTag = state.routeBalancer;
    } else {
      rule.outboundTag = state.routeOutbound || 'proxy';
    }
    if (state.routeKind === 'default') {
      rule.network = 'tcp,udp';
      return rule;
    }
    if (state.routeKind === 'port') rule.port = values.join(',');
    else rule[state.routeKind] = values;
    return rule;
  }

  function openRoutingRuleEditor(index) {
    const rule = routeRules()[index];
    if (!rule) return;
    if (isRuOpenRayManagedRoute(rule)) {
      state.message = 'Это служебное правило RuOpenRay. Меняйте его через раздел DNS, Перехват, Защита от утечек или Статистика Xray, чтобы не сломать системную часть конфигурации.';
      render();
      return;
    }
    const target = routeTarget(rule);
    if (!routeKinds[target.kind]) {
      state.message = 'Это особое правило пока нельзя редактировать в форме. Его можно изменить в активной конфигурации.';
      render();
      return;
    }
    const info = describeRouteRule(rule);
    state.routeRuleEditingIndex = index;
    state.routeRuleDialog = true;
    state.routeRuleMode = 'single';
    state.routeName = routeRuleName(rule, info);
    state.routeKind = target.kind;
    state.routeValue = target.values.join(', ');
    state.routeValueMultiline = target.values.length > 1;
    state.routeTargetType = rule.balancerTag ? 'balancer' : 'outbound';
    state.routeBalancer = rule.balancerTag || balancerOptions()[0] || '';
    state.routeOutbound = rule.outboundTag || 'proxy';
    state.message = '';
    state.routeRuleTestResult = null;
    render();
  }

  function saveRoutingRuleEdit() {
    const index = state.routeRuleEditingIndex;
    const current = routeRules();
    const oldRule = current[index];
    if (!oldRule) {
      resetRouteRuleForm();
      state.routeRuleDialog = false;
      render();
      return;
    }
    const nextRule = routeRuleFromForm(oldRule);
    if (!nextRule) {
      state.message = state.routeKind === 'default'
        ? 'Выберите, куда отправлять остальной трафик'
        : state.routeTargetType === 'balancer' && !state.routeBalancer
        ? 'Выберите балансировщик или переключите цель на сервер'
        : 'Укажите значение правила';
      render();
      return;
    }
    const nextRules = current.map((rule, ruleIndex) => (ruleIndex === index ? nextRule : rule));
    delete state.routeNames[routeRuleKey(oldRule)];
    setRouteRuleName(nextRule, state.routeName);
    setRoutingDraft(nextRules);
    resetRouteRuleForm();
    state.routeRuleDialog = false;
    state.message = 'Правило обновлено в черновике маршрутизации. Проверьте конфигурацию и примените изменения.';
    render();
  }

  function addRoutingPreset(name) {
    const rules = routePresetRules(name);
    if (!rules.length) return;
    setRoutingDraft([...rules.map(normalizePresetRule), ...routeRules()]);
    state.message = `Подборка добавлена: ${routePresetTitle(name)}`;
    render();
  }

  function normalizePresetRule(rule) {
    const next = JSON.parse(JSON.stringify(rule));
    if (next.outboundTag === 'proxy') next.outboundTag = activeProxyTag() || 'proxy';
    return next;
  }

  function allRoutePresetEntries() {
    return [
      ...customRoutePresetEntries(),
      ...builtinRoutePresetEntries({ includeHidden: true })
    ];
  }

  function routeRulePresetMatches(rule) {
    return routeRulePresetMatchesFor(rule, allRoutePresetEntries(), routePresetRules, normalizePresetRule, routePresetTitle);
  }

  function routePresetSequenceAt(rules, startIndex) {
    return findRoutePresetSequenceAt(rules, startIndex, allRoutePresetEntries(), routePresetRules, normalizePresetRule, routePresetTitle);
  }

  function routeRuleSourceWithPresets(rule) {
    if (isRuOpenRayManagedRoute(rule)) return routeRuleSource(rule);
    const matches = routeRulePresetMatches(rule);
    if (matches.length) {
      const titles = matches.map((item) => item.title);
      return `Подборка: ${titles.slice(0, 2).join(', ')}${titles.length > 2 ? ` +${titles.length - 2}` : ''}`;
    }
    return routeRuleSource(rule);
  }

  function routePresetInstallSummary(key) {
    return routePresetInstallSummaryFor(key, routeRules(), routePresetRules, normalizePresetRule);
  }

  function routePresetInstallLabel(key) {
    const summary = routePresetInstallSummary(key);
    if (!summary.total) return '';
    if (summary.installed) return 'установлено';
    if (summary.partial) return `добавлено ${summary.matched}/${summary.total}`;
    return '';
  }

  function applySelectedRoutingPresets() {
    const selectedPresets = state.selectedRoutePresets.filter((key) => externalRoutePreset(key) || routePresets[key] || routeBundles[key]);
    const selectedCustom = state.selectedRoutePresets.filter((key) => customRoutePreset(key));
    const selected = [...selectedPresets, ...selectedCustom];
    if (!selected.length) {
      state.message = 'Отметьте хотя бы одну подборку';
      render();
      return;
    }
    const requestedRules = [
      ...selectedPresets.flatMap((key) => routePresetRules(key).map(normalizePresetRule)),
      ...selectedCustom.flatMap((key) => routePresetRules(key).map(normalizePresetRule))
    ];
    const currentRules = routeRules();
    const seen = new Set(currentRules.map(routeRuleConditionKey));
    const rules = [];
    for (const rule of requestedRules) {
      const key = routeRuleConditionKey(rule);
      if (seen.has(key)) continue;
      seen.add(key);
      rules.push(rule);
    }
    if (!rules.length) {
      state.routePresetDialog = false;
      state.routeRuleDialog = false;
      state.routeRuleMode = 'single';
      state.selectedRoutePresets = [];
      state.message = 'Выбранные подборки уже есть в правилах';
      render();
      return;
    }
    setRoutingDraft([...rules, ...currentRules]);
    state.routePresetDialog = false;
    state.routeRuleDialog = false;
    state.routeRuleMode = 'single';
    state.selectedRoutePresets = [];
    const skipped = requestedRules.length - rules.length;
    state.message = `Добавлено подборок: ${selected.length}, новых правил: ${rules.length}${skipped ? `, уже были: ${skipped}` : ''}`;
    render();
  }

  function routePresetRules(key) {
    const custom = customRoutePreset(key);
    if (custom) return expandRoutePresetRules(custom.rules || [], Boolean(custom.preserveMixed));
    const external = externalRoutePreset(key);
    if (external) return expandRoutePresetRules(external.rules || [], Boolean(external.preserveMixed));
    if (routeBundles[key]) return expandRoutePresetRules(routeBundles[key].rules || [], Boolean(routeBundles[key].preserveMixed));
    if (routePresets[key]) return expandRoutePresetRules([routePresets[key].rule], Boolean(routePresets[key].preserveMixed));
    return [];
  }

  function routePresetTitle(key) {
    const custom = customRoutePreset(key);
    if (custom) return custom.title || key;
    const external = externalRoutePreset(key);
    if (external) return external.title || key;
    return routeBundles[key]?.title || routePresets[key]?.title || key;
  }

  function routePresetDetail(key) {
    const custom = customRoutePreset(key);
    if (custom) return custom.detail || ruleCountLabel((custom.rules || []).reduce((sum, rule) => sum + routeRuleConditionCount(rule), 0));
    const external = externalRoutePreset(key);
    if (external) return external.detail || ruleCountLabel((external.rules || []).reduce((sum, rule) => sum + routeRuleConditionCount(rule), 0));
    const preset = routeBundles[key] || routePresets[key];
    if (!preset) return '';
    if (preset.detail) return preset.detail;
    if (preset.rule) return describeRouteRule(preset.rule).fullValue;
    return '';
  }

  function routeRuleConditionCount(rule) {
    if (!rule) return 0;
    let count = 0;
    for (const key of ['domain', 'ip', 'source', 'inboundTag']) {
      if (Array.isArray(rule[key])) count += rule[key].length;
      else if (rule[key]) count += 1;
    }
    if (rule.port) count += 1;
    if (!count && rule.network) count += 1;
    return Math.max(1, count);
  }

  function routePresetConditionCount(key) {
    return routePresetRules(key).reduce((sum, rule) => sum + routeRuleConditionCount(rule), 0);
  }

  function builtinRoutePresetEntries({ includeHidden = false } = {}) {
    const externalKeys = new Set(Object.keys(state.externalRoutePresets || {}));
    const externalEntries = Object.entries(state.externalRoutePresets || {})
      .map(([key, preset]) => [key, { ...preset, source: preset.source || 'github' }]);
    return [
      ...externalEntries,
      ...Object.entries(routeBundles)
        .filter(([key]) => !externalKeys.has(key))
        .map(([key, preset]) => [key, { ...preset, source: 'builtin' }]),
      ...Object.entries(routePresets)
        .filter(([key]) => !externalKeys.has(key))
        .map(([key, preset]) => [key, { ...preset, source: 'builtin' }])
    ].filter(([key]) => includeHidden || !hiddenBuiltinRoutePresetKeys.has(key));
  }

  function ruleCountLabel(count) {
    const n = Math.abs(Number(count || 0));
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? 'правило'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'правила'
        : 'правил';
    return `${count || 0} ${word}`;
  }

  function customRoutePreset(key) {
    const id = String(key || '').startsWith('custom:') ? String(key).slice(7) : '';
    return id ? state.customRoutePresets[id] : null;
  }

  function externalRoutePreset(key) {
    const id = String(key || '').replace(/^external:/, '');
    return id ? state.externalRoutePresets?.[id] : null;
  }

  function routePresetData(key) {
    const custom = customRoutePreset(key);
    if (custom) return custom;
    const external = externalRoutePreset(key);
    if (external) return external;
    return routeBundles[key] || routePresets[key] || null;
  }

  function routePresetExportKey(key) {
    return String(key || '').replace(/^(custom|external):/, '');
  }

  function routePresetIconFieldValue(key, preset = {}) {
    if (typeof preset.icon === 'string') return preset.icon;
    const exportedIcon = routePresetExportIcon(routePresetExportKey(key), preset);
    return typeof exportedIcon === 'string' ? exportedIcon : '';
  }

  function routePresetIconForSave(key) {
    const typedIcon = state.routePresetEditIcon.trim();
    if (typedIcon) return typedIcon;
    return routePresetExportIcon(routePresetExportKey(key), routePresetData(key) || {});
  }

  function customRoutePresetEntries() {
    return Object.entries(state.customRoutePresets)
      .sort(([, left], [, right]) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
      .map(([id, preset]) => [`custom:${id}`, preset]);
  }

  function applyRoutePresetSourceResult(result) {
    if (!result) return;
    if (result.externalPresets && typeof result.externalPresets === 'object' && !Array.isArray(result.externalPresets)) {
      state.externalRoutePresets = result.externalPresets;
    }
    if (Array.isArray(result.sources)) state.routePresetSources = result.sources;
  }

  async function checkRoutePresetSource() {
    const url = String(state.routePresetSourceUrl || '').trim();
    if (!url) {
      state.message = 'Укажите URL JSON-каталога сценариев';
      render();
      return;
    }
    state.busyAction = 'checkRoutePresetSource';
    state.message = 'Проверяю источник сценариев...';
    render();
    try {
      const result = await request('/api/routing/preset-sources/check', {
        method: 'POST',
        body: JSON.stringify({ url })
      });
      state.routePresetSourceCheck = result;
      if (result.ok) {
        state.routePresetSourceUrl = result.url || url;
        state.routePresetSourceName = state.routePresetSourceName || result.name || '';
        state.message = `Источник проверен: ${result.count || 0} сценариев, ${result.rules || 0} правил`;
      } else {
        state.message = result.error || 'Источник сценариев не прошел проверку';
      }
    } catch (error) {
      state.routePresetSourceCheck = { ok: false, error: error.message || String(error) };
      state.message = error.message || 'Не удалось проверить источник сценариев';
    } finally {
      state.busyAction = '';
      render();
    }
  }

  async function saveRoutePresetSource() {
    const url = String(state.routePresetSourceUrl || '').trim();
    if (!url) {
      state.message = 'Укажите URL JSON-каталога сценариев';
      render();
      return;
    }
    state.busyAction = 'saveRoutePresetSource';
    state.message = 'Сохраняю источник сценариев...';
    render();
    try {
      const result = await request('/api/routing/preset-sources', {
        method: 'POST',
        body: JSON.stringify({
          url,
          name: state.routePresetSourceName,
          enabled: true,
          autoUpdate: Boolean(state.routePresetSourceAutoUpdate)
        })
      });
      applyRoutePresetSourceResult(result);
      state.routePresetSourceCheck = result.ok ? { ...result, ok: true } : result;
      state.message = result.ok ? 'Источник сценариев сохранен и подключен' : (result.error || 'Не удалось сохранить источник');
    } catch (error) {
      state.message = error.message || 'Не удалось сохранить источник сценариев';
    } finally {
      state.busyAction = '';
      render();
    }
  }

  async function updateRoutePresetSources(id = '') {
    state.routePresetSourcesUpdating = true;
    state.busyAction = id ? `updateRoutePresetSource:${id}` : 'updateRoutePresetSources';
    state.message = id ? 'Обновляю источник сценариев...' : 'Обновляю все источники сценариев...';
    render();
    try {
      const result = await request('/api/routing/preset-sources/update', {
        method: 'POST',
        body: JSON.stringify({ id })
      });
      applyRoutePresetSourceResult(result);
      state.message = result.ok ? 'Источники сценариев обновлены' : (result.error || 'Не удалось обновить источники');
    } catch (error) {
      state.message = error.message || 'Не удалось обновить источники сценариев';
    } finally {
      state.routePresetSourcesUpdating = false;
      state.busyAction = '';
      render();
    }
  }

  async function deleteRoutePresetSource(id) {
    if (!id) return;
    state.busyAction = `deleteRoutePresetSource:${id}`;
    render();
    try {
      const result = await request('/api/routing/preset-sources/delete', {
        method: 'POST',
        body: JSON.stringify({ id })
      });
      applyRoutePresetSourceResult(result);
      state.message = result.ok ? 'Источник сценариев удален' : (result.error || 'Не удалось удалить источник');
    } catch (error) {
      state.message = error.message || 'Не удалось удалить источник сценариев';
    } finally {
      state.busyAction = '';
      render();
    }
  }

  async function toggleRoutePresetSource(id, enabled) {
    if (!id) return;
    try {
      const result = await request('/api/routing/preset-sources/toggle', {
        method: 'POST',
        body: JSON.stringify({ id, enabled })
      });
      applyRoutePresetSourceResult(result);
      state.message = enabled ? 'Источник сценариев включен' : 'Источник сценариев выключен';
    } catch (error) {
      state.message = error.message || 'Не удалось изменить источник сценариев';
    } finally {
      render();
    }
  }

  function saveCustomRoutePresets() {
    if (!state.token) return;
    request('/api/routing/presets', {
      method: 'POST',
      body: JSON.stringify({ presets: state.customRoutePresets })
    }).catch((error) => {
      state.message = error.message || 'Не удалось сохранить подборки правил на роутере';
      render();
    });
  }

  function scenarioIdFromTitle(title) {
    const base = String(title || 'scenario')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 42) || 'scenario';
    let id = base;
    let counter = 2;
    while (state.customRoutePresets[id]) {
      id = `${base}-${counter}`;
      counter += 1;
    }
    return id;
  }

  function routeRuleToDslLines(rule) {
    const outbound = rule.balancerTag ? `balancer:${rule.balancerTag}` : (rule.outboundTag || 'proxy');
    const prefix = rule.network ? [`network(${rule.network})`] : [];
    const lines = [];
    const addMany = (kind, values) => {
      for (const value of values || []) {
        lines.push([...prefix, `${kind}(${value})`].join(' && ') + ` -> ${outbound}`);
      }
    };
    addMany('domain', rule.domain);
    addMany('ip', rule.ip);
    addMany('source', rule.source);
    addMany('inboundTag', rule.inboundTag);
    if (rule.port) lines.push([...prefix, `port(${rule.port})`].join(' && ') + ` -> ${outbound}`);
    if (!lines.length && prefix.length) lines.push(`${prefix.join(' && ')} -> ${outbound}`);
    return lines;
  }

  function clearRoutePresetEditor() {
    state.routePresetEditor = '';
    state.routePresetEditTitle = '';
    state.routePresetEditDetail = '';
    state.routePresetEditIcon = '';
    state.routePresetEditDsl = '';
    state.routePresetEditPreview = null;
    state.routePresetEditChecked = false;
  }

  function newRoutingPreset() {
    state.routeRuleDialog = false;
    state.routePresetDialog = true;
    state.routePresetEditor = 'custom:new';
    state.routePresetEditTitle = '';
    state.routePresetEditDetail = '';
    state.routePresetEditIcon = '';
    state.routePresetEditDsl = '';
    state.routePresetEditPreview = null;
    state.routePresetEditChecked = false;
    state.message = '';
    render();
  }

  function editRoutingPreset(key) {
    const rules = routePresetRules(key);
    if (!rules.length) return;
    const title = routePresetTitle(key);
    state.routeRuleDialog = false;
    state.routePresetDialog = true;
    state.routePresetEditor = key;
    state.routePresetEditTitle = title;
    state.routePresetEditDetail = routePresetDetail(key);
    state.routePresetEditIcon = routePresetIconFieldValue(key, routePresetData(key) || {});
    state.routePresetEditDsl = [`# ${title}`, ...rules.flatMap(routeRuleToDslLines)].join('\n');
    state.routePresetEditPreview = parseRoutingDsl(state.routePresetEditDsl);
    state.routePresetEditChecked = false;
    state.message = '';
    render();
  }

  function previewRoutePresetEdit() {
    state.routePresetEditPreview = parseRoutingDsl(state.routePresetEditDsl);
    state.routePresetEditChecked = true;
    state.message = '';
    render();
  }

  function routePresetCheckResultView(preview) {
    const stats = dslPreviewStats(preview);
    const tone = stats.total ? 'ok' : 'bad';
    const text = stats.total
      ? `Распознано правил: ${stats.total}. Через proxy: ${stats.proxy}, напрямую: ${stats.direct}, блокировка: ${stats.block}, другое: ${stats.other}.`
      : 'Правила пока не распознаны. Вставьте строки маршрутизации и нажмите “Проверить” еще раз.';
    return `
      <div class="preset-check-result ${tone}">
        <strong>Результат проверки</strong>
        <span>${escapeHtml(text)}</span>
        ${(preview.warnings || []).length ? `<ul>${preview.warnings.slice(0, 6).map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
      </div>
      ${dslPreviewView(preview)}
    `;
  }

  function applyRoutePresetEdit() {
    const parsed = parseRoutingDsl(state.routePresetEditDsl);
    state.routePresetEditPreview = parsed;
    state.routePresetEditChecked = true;
    if (!parsed.rules.length) {
      state.message = 'Не нашёл правил в изменённом сценарии';
      render();
      return;
    }
    const currentRules = routeRules();
    const seen = new Set(currentRules.map(routeRuleConditionKey));
    const rules = [];
    for (const rule of parsed.rules.map(normalizePresetRule)) {
      const key = routeRuleConditionKey(rule);
      if (seen.has(key)) continue;
      seen.add(key);
      rules.push(rule);
    }
    if (!rules.length) {
      state.message = 'Все правила этой подборки уже есть в маршрутизации';
      render();
      return;
    }
    setRoutingDraft([...rules, ...currentRules]);
    const title = state.routePresetEditTitle.trim() || routePresetTitle(state.routePresetEditor);
    clearRoutePresetEditor();
    state.routePresetDialog = false;
    state.selectedRoutePresets = [];
    state.message = `Добавлена подборка после правки: ${title}. Новых правил: ${rules.length}`;
    render();
  }

  function saveRoutePresetEdit() {
    const parsed = parseRoutingDsl(state.routePresetEditDsl);
    state.routePresetEditPreview = parsed;
    state.routePresetEditChecked = true;
    if (!parsed.rules.length) {
      state.message = 'Не нашёл правил в сценарии';
      render();
      return;
    }
    const title = state.routePresetEditTitle.trim() || 'Новая подборка';
    const key = state.routePresetEditor || 'custom:new';
    const existingId = key.startsWith('custom:') && key !== 'custom:new' ? key.slice(7) : '';
    const id = existingId || scenarioIdFromTitle(title);
    const icon = routePresetIconForSave(key);
    state.customRoutePresets[id] = {
      title,
      detail: state.routePresetEditDetail.trim(),
      rules: parsed.rules.map((rule) => JSON.parse(JSON.stringify(rule))),
      updatedAt: new Date().toISOString()
    };
    if (icon) state.customRoutePresets[id].icon = icon;
    saveCustomRoutePresets();
    state.routePresetEditor = '';
    state.routePresetDialog = false;
    state.selectedRoutePresets = [`custom:${id}`];
    state.message = `Подборка сохранена: ${title}`;
    render();
  }

  function deleteCustomRoutePreset(key) {
    const id = String(key || '').startsWith('custom:') ? String(key).slice(7) : '';
    if (!id || !state.customRoutePresets[id]) return;
    const title = state.customRoutePresets[id].title || id;
    delete state.customRoutePresets[id];
    state.selectedRoutePresets = state.selectedRoutePresets.filter((item) => item !== key);
    saveCustomRoutePresets();
    state.message = `Подборка удалена: ${title}`;
    render();
  }

  function removeRoutingRule(index) {
    const current = routeRules();
    if (current[index]) {
      delete state.routeNames[routeRuleKey(current[index])];
      saveRouteNames();
    }
    const rules = current.filter((_, ruleIndex) => ruleIndex !== index);
    setRoutingDraft(rules);
    state.message = 'Правило удалено из черновика';
    render();
  }

  function removeRoutingRuleRange(fromStart, fromEnd, title = '') {
    const current = routeRules();
    const length = fromEnd - fromStart;
    if (fromStart < 0 || fromEnd > current.length || length <= 0) return;
    current.slice(fromStart, fromEnd).forEach((rule) => {
      delete state.routeNames[routeRuleKey(rule)];
    });
    saveRouteNames();
    setRoutingDraft(current.filter((_, ruleIndex) => ruleIndex < fromStart || ruleIndex >= fromEnd));
    state.message = title
      ? `Подборка удалена из черновика: ${title}`
      : `Удалено правил из черновика: ${length}`;
    render();
  }

  function disableRoutingRule(index) {
    const current = routeRules();
    const rule = current[index];
    if (!rule) return;
    const info = describeRouteRule(rule);
    const name = routeRuleName(rule, info);
    state.disabledRouteRules = [
      { id: `disabled-${Date.now()}-${index}`, rule: JSON.parse(JSON.stringify(rule)), name, disabledAt: new Date().toISOString() },
      ...state.disabledRouteRules
    ].slice(0, 120);
    saveDisabledRouteRules();
    setRoutingDraft(current.filter((_, ruleIndex) => ruleIndex !== index));
    state.message = `Правило отключено без удаления: ${name}`;
    render();
  }

  function disableRoutingRuleRange(fromStart, fromEnd, title = '') {
    const current = routeRules();
    const length = fromEnd - fromStart;
    if (fromStart < 0 || fromEnd > current.length || length <= 0) return;
    const disabled = current.slice(fromStart, fromEnd).map((rule, offset) => {
      const info = describeRouteRule(rule);
      return {
        id: `disabled-${Date.now()}-${fromStart + offset}`,
        rule: JSON.parse(JSON.stringify(rule)),
        name: routeRuleName(rule, info),
        disabledAt: new Date().toISOString()
      };
    });
    state.disabledRouteRules = [...disabled, ...state.disabledRouteRules].slice(0, 160);
    saveDisabledRouteRules();
    setRoutingDraft(current.filter((_, ruleIndex) => ruleIndex < fromStart || ruleIndex >= fromEnd));
    state.message = title
      ? `Подборка отключена без удаления: ${title}`
      : `Отключено правил без удаления: ${length}`;
    render();
  }

  function removeSelectedRoutingRules() {
    const indexes = selectedRouteRuleIndexes();
    if (!indexes.length) {
      state.message = 'Отметьте хотя бы одно правило для удаления';
      render();
      return;
    }
    const selected = new Set(indexes);
    const current = routeRules();
    indexes.forEach((index) => {
      if (current[index]) delete state.routeNames[routeRuleKey(current[index])];
    });
    saveRouteNames();
    setRoutingDraft(current.filter((_, ruleIndex) => !selected.has(ruleIndex)));
    state.selectedRouteRuleIndexes = [];
    state.routeGroupDialog = false;
    state.message = `Удалено выбранных правил из черновика: ${indexes.length}`;
    render();
  }

  function disableSelectedRoutingRules() {
    const indexes = selectedRouteRuleIndexes();
    if (!indexes.length) {
      state.message = 'Отметьте хотя бы одно правило для отключения';
      render();
      return;
    }
    const selected = new Set(indexes);
    const current = routeRules();
    const disabled = indexes.map((index) => {
      const rule = current[index];
      if (!rule) return null;
      const info = describeRouteRule(rule);
      return {
        id: `disabled-${Date.now()}-${index}`,
        rule: JSON.parse(JSON.stringify(rule)),
        name: routeRuleName(rule, info),
        disabledAt: new Date().toISOString()
      };
    }).filter(Boolean);
    if (!disabled.length) return;
    state.disabledRouteRules = [...disabled, ...state.disabledRouteRules].slice(0, 160);
    saveDisabledRouteRules();
    setRoutingDraft(current.filter((_, ruleIndex) => !selected.has(ruleIndex)));
    state.selectedRouteRuleIndexes = [];
    state.routeGroupDialog = false;
    state.message = `Отключено выбранных правил без удаления: ${disabled.length}`;
    render();
  }

  function restoreDisabledRouteRule(id) {
    const item = state.disabledRouteRules.find((entry) => entry.id === id);
    if (!item?.rule) return;
    state.disabledRouteRules = state.disabledRouteRules.filter((entry) => entry.id !== id);
    saveDisabledRouteRules();
    setRoutingDraft([item.rule, ...routeRules()]);
    if (item.name) setRouteRuleName(item.rule, item.name);
    state.message = `Правило возвращено наверх списка: ${item.name || 'без названия'}`;
    render();
  }

  function deleteDisabledRouteRule(id) {
    state.disabledRouteRules = state.disabledRouteRules.filter((entry) => entry.id !== id);
    saveDisabledRouteRules();
    state.message = 'Отключенное правило удалено из панели';
    render();
  }

  function routeRuleListItem(rule, index) {
    const info = describeRouteRule(rule);
    return { kind: 'rule', rule, index, info, name: routeRuleName(rule, info), source: routeRuleSourceWithPresets(rule), presets: routeRulePresetMatches(rule) };
  }

  function routeItemMatchesSearch(item, search) {
    if (!search) return true;
    if (item.kind === 'presetGroup' || item.kind === 'customGroup') {
      const childText = item.items
        .map(({ info, name, source }) => `${name} ${source} ${info.kind} ${info.value} ${info.outbound} ${info.detail}`)
        .join(' ');
      return `${item.title} ${item.preset?.detail || routePresetDetail(item.key)} ${childText}`.toLowerCase().includes(search);
    }
    const { info, name, source } = item;
    return `${name} ${source} ${info.kind} ${info.value} ${info.outbound} ${info.detail}`.toLowerCase().includes(search);
  }

  function visibleRoutingRuleItems(limit = 80) {
    const search = state.routeSearch.trim().toLowerCase();
    const rules = routeRules();
    const items = [];
    for (let index = 0; index < rules.length;) {
      const sequence = routePresetSequenceAt(rules, index);
      if (sequence) {
        if (sequence.rules.every((rule) => isRuOpenRayManagedRoute(rule))) {
          index += sequence.rules.length;
          continue;
        }
        const group = {
          kind: 'presetGroup',
          key: sequence.key,
          preset: sequence.preset,
          title: sequence.title,
          index,
          items: sequence.rules.map((_, offset) => routeRuleListItem(rules[index + offset], index + offset))
        };
        if (routeItemMatchesSearch(group, search)) items.push(group);
        index += sequence.rules.length;
        continue;
      }
      if (isRuOpenRayManagedRoute(rules[index])) {
        index += 1;
        continue;
      }
      const customName = state.routeNames?.[routeRuleKey(rules[index])] || '';
      if (customName) {
        let end = index + 1;
        while (
          end < rules.length &&
          !isRuOpenRayManagedRoute(rules[end]) &&
          state.routeNames?.[routeRuleKey(rules[end])] === customName
        ) {
          end += 1;
        }
        if (end - index > 1) {
          const group = {
            kind: 'customGroup',
            key: `custom:${customName}`,
            preset: { title: customName, detail: 'Пользовательская группа правил' },
            title: customName,
            index,
            items: rules.slice(index, end).map((rule, offset) => routeRuleListItem(rule, index + offset))
          };
          if (routeItemMatchesSearch(group, search)) items.push(group);
          index = end;
          continue;
        }
      }
      const item = routeRuleListItem(rules[index], index);
      if (routeItemMatchesSearch(item, search)) items.push(item);
      index += 1;
    }
    return items.slice(0, limit);
  }

  function managedRoutingRuleItems() {
    return routeRules()
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => isRuOpenRayManagedRoute(rule))
      .map(({ rule, index }) => routeRuleListItem(rule, index));
  }

  function managedRouteSettingsJump(rule) {
    if (rule?.outboundTag === 'ruopenray-api') return { tab: 'diagnostics', label: 'Открыть диагностику' };
    if (rule?.outboundTag === 'dns-out') return { tab: 'dns', label: 'Открыть DNS' };
    if (Array.isArray(rule?.inboundTag) && rule.inboundTag.includes('transparent_ipv4')) {
      return { tab: 'routing', routingView: 'intercept', label: 'Открыть перехват' };
    }
    return { tab: 'routing', routingView: 'rules', label: 'Настроить' };
  }

  function managedRoutesPanel(items) {
    if (!items.length) return '';
    return `<details class="route-system-panel">
      <summary>
        <span>Служебные правила RuOpenRay</span>
        <small>${ruleCountLabel(items.length)} · управляются через DNS, Перехват и Диагностику</small>
      </summary>
      <div class="route-system-explainer">
        <strong>Как работает перехват LAN-трафика</strong>
        <p>Firewall OpenWrt через nftables выбирает пакеты LAN-клиентов и отправляет их во входящий поток Xray <code>transparent_ipv4</code>. После этого обычные правила Xray сверху вниз решают, куда пойдет трафик: через proxy, напрямую или в блокировку.</p>
        <p>Служебное правило для <code>transparent_ipv4</code> оставляет локальные и приватные адреса напрямую. Это защита от ситуации, когда перехват случайно ломает доступ к роутеру, DHCP, DNS или устройствам в домашней сети.</p>
      </div>
      <div class="route-system-list">
        ${items.map((item) => {
          const jump = managedRouteSettingsJump(item.rule);
          return `<article class="route-system-row">
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(item.info.detail || item.info.value)}</span>
              <small>${escapeHtml(item.info.value)} → ${escapeHtml(item.info.outbound)}</small>
            </div>
            <button class="btn secondary" type="button" data-tab-jump="${escapeHtml(jump.tab)}" ${jump.routingView ? `data-routing-view-jump="${escapeHtml(jump.routingView)}"` : ''}>${escapeHtml(jump.label)}</button>
          </article>`;
        }).join('')}
      </div>
    </details>`;
  }

  function routePreviewValue(value) {
    return String(value || '')
      .replace(/^domain:/, '')
      .replace(/^regexp:/, '')
      .replace(/^full:/, '')
      .replace(/\\/g, '')
      .trim();
  }

  function routeConditionGroups(rule) {
    const groups = [];
    const add = (kind, values) => {
      const list = Array.isArray(values) ? values.filter(Boolean) : (values ? [values] : []);
      if (!list.length) return;
      const label = routeKinds[kind] || kind;
      const readableValues = kind === 'inboundTag'
        ? list.map((value) => readableRouteTag(value))
        : list;
      groups.push({ kind, label, values: readableValues, rawValues: list });
    };
    add('domain', rule?.domain);
    add('ip', rule?.ip);
    add('source', rule?.source);
    add('inboundTag', rule?.inboundTag);
    add('port', rule?.port);
    if (!groups.length) {
      const target = routeTarget(rule || {});
      add(target.kind, target.values);
    }
    return groups;
  }

  function routeConditionMeta(groups, network) {
    const parts = [];
    for (const group of groups) {
      parts.push(`${group.label} · ${group.values.length} знач.`);
    }
    if (network) parts.push(network);
    return parts;
  }

  function routeValuesPreviewHtml(rule, info, index) {
    const groups = routeConditionGroups(rule || {});
    const network = rule?.network || '';
    const meta = routeConditionMeta(groups, network);
    const total = groups.reduce((sum, group) => sum + group.values.length, 0);
    const chips = groups
      .flatMap((group) => group.values.map((value) => ({ group, value: routePreviewValue(value) })))
      .filter(({ value }) => Boolean(value))
      .slice(0, 3);
    const title = groups
      .map((group) => `${group.label}: ${group.rawValues.join(', ')}`)
      .join('\n');
    return `<div class="route-main route-main-preview">
      <div class="route-meta-line">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>
      <div class="route-value-chips" title="${escapeHtml(title || info.fullValue)}">
        ${chips.length ? chips.map(({ value }) => `<code>${escapeHtml(value)}</code>`).join('') : `<code>${escapeHtml(info.value)}</code>`}
        ${total > chips.length ? `<button type="button" data-route-values-panel="${index}">+${total - chips.length}</button>` : ''}
      </div>
    </div>`;
  }

  function routeValuesDrawer() {
    if (state.routeValuesDrawerIndex === null || state.routeValuesDrawerIndex === undefined || state.routeValuesDrawerIndex === '') return '';
    const index = Number(state.routeValuesDrawerIndex);
    if (!Number.isInteger(index) || index < 0) return '';
    const rule = routeRules()[index];
    if (!rule) return '';
    const info = describeRouteRule(rule);
    const groups = routeConditionGroups(rule || {});
    const values = groups.flatMap((group) => group.rawValues.map((value) => ({ group, value })));
    const anchor = state.routeValuesDrawerAnchor && typeof state.routeValuesDrawerAnchor === 'object' ? state.routeValuesDrawerAnchor : null;
    const anchorStyle = anchor && Number.isFinite(Number(anchor.top)) && Number.isFinite(Number(anchor.left))
      ? ` style="--route-values-drawer-top:${Math.max(12, Number(anchor.top))}px;--route-values-drawer-left:${Math.max(12, Number(anchor.left))}px;--route-values-drawer-right:auto;--route-values-drawer-max-height:${Math.max(220, Number(anchor.maxHeight) || 420)}px"`
      : '';
    return `<aside class="route-values-drawer" aria-label="Значения правила"${anchorStyle}>
      <header>
        <div>
          <strong>${escapeHtml(routeRuleName(rule, info))}</strong>
          <span>${escapeHtml(routeConditionMeta(groups, rule.network).join(' · '))}</span>
        </div>
        <button class="icon-btn" type="button" data-route-values-panel-close aria-label="Закрыть">×</button>
      </header>
      <div class="route-values-list">
        ${values.map(({ group, value }) => `<code><span>${escapeHtml(group.label)}</span>${escapeHtml(value)}</code>`).join('')}
      </div>
    </aside>`;
  }

  function routeRowHtml(item, options, rulesLength) {
    const { index, info, name, source, presets = [] } = item;
    const nested = Boolean(item.nested);
    const displayOrder = Number.isFinite(Number(item.displayOrderStart)) ? Number(item.displayOrderStart) : index + 1;
    const groupStart = Number.isFinite(Number(item.groupStart)) ? Number(item.groupStart) : -1;
    const groupEnd = Number.isFinite(Number(item.groupEnd)) ? Number(item.groupEnd) : -1;
    const canMoveNestedUp = nested && groupStart >= 0 && index > groupStart;
    const canMoveNestedDown = nested && groupEnd > groupStart && index < groupEnd - 1;
    const selectedTarget = encodedRouteTarget(item.rule);
    const category = routeCategoryForRule(item.rule);
    const managed = isRuOpenRayManagedRoute(item.rule);
    const dragLocked = managed;
    const targetLocked = managed || nested;
    const editLocked = managed;
    const actionLocked = managed || nested;
    const selectableForGroup = !managed && !nested;
    const selectedForGroup = selectableForGroup && (state.selectedRouteRuleIndexes || []).includes(index);
    const moveUpAttrs = nested
      ? `data-route-group-child-move="${index}" data-route-group-child-start="${groupStart}" data-route-group-child-end="${groupEnd}" data-direction="-1"`
      : `data-route-move="${index}" data-direction="-1"`;
    const moveDownAttrs = nested
      ? `data-route-group-child-move="${index}" data-route-group-child-start="${groupStart}" data-route-group-child-end="${groupEnd}" data-direction="1"`
      : `data-route-move="${index}" data-direction="1"`;
    const moveUpDisabled = managed || (nested ? !canMoveNestedUp : index === 0);
    const moveDownDisabled = managed || (nested ? !canMoveNestedDown : index === rulesLength - 1);
    const targetOptions = options.some((option) => option.value === selectedTarget)
      ? options
      : [{ value: selectedTarget, label: item.rule.balancerTag ? `Балансировщик · ${item.rule.balancerTag}` : readableRouteTag(item.rule.outboundTag || 'не задано') }, ...options];
    const section = routeSectionDefinitions().find((entry) => entry.id === category) || routeSectionDefinitions().find((entry) => entry.id === 'other');
    const dragAttrs = dragLocked
      ? ''
      : nested
        ? `data-route-group-child-index="${index}" data-route-group-child-start="${groupStart}" data-route-group-child-end="${groupEnd}"`
        : `data-route-index="${index}" data-route-range-start="${index}" data-route-range-end="${index + 1}"`;
    const matchedPreset = !nested && presets.length ? presets[0] : null;
    const matchedPresetData = matchedPreset
      ? (externalRoutePreset(matchedPreset.key) || routeBundles[matchedPreset.key] || routePresets[matchedPreset.key] || customRoutePreset(matchedPreset.key) || { title: matchedPreset.title })
      : null;
    const presetIcon = matchedPreset
      ? routePresetIconView(escapeHtml, matchedPreset.key, matchedPresetData, 'compact route-row-preset-icon')
      : '<span class="route-preset-icon compact route-row-preset-icon route-row-preset-icon-empty" aria-hidden="true"></span>';
    return `<article class="route-row route-row-${escapeHtml(category)} ${managed ? 'route-row-managed' : ''} ${nested ? 'route-row-nested' : ''} ${selectedForGroup ? 'route-row-selected' : ''}" draggable="${dragLocked ? 'false' : 'true'}" ${dragAttrs}>
      <div class="route-order">
        <label class="route-select-check" title="${selectableForGroup ? 'Выбрать правило для новой группы' : 'Служебные правила и строки внутри группы выбираются через настройки группы'}" aria-label="Выбрать правило для новой группы">
          <input type="checkbox" data-route-select="${index}" ${selectedForGroup ? 'checked' : ''} ${selectableForGroup ? '' : 'disabled'} />
          <span></span>
        </label>
        <button class="route-drag-handle" type="button" ${dragLocked ? 'disabled' : ''} title="${managed ? 'Служебное правило управляется настройками RuOpenRay' : nested ? 'Перетащить внутри подборки' : 'Перетащить правило'}" aria-label="${managed ? 'Служебное правило управляется настройками RuOpenRay' : nested ? 'Перетащить правило внутри подборки' : 'Перетащить правило'}">${managed ? '•' : '⋮⋮'}</button>
        <span>${displayOrder}</span>
      </div>
      <div class="route-kind-stack">
        <span class="route-category route-category-${escapeHtml(category)}">${escapeHtml(section?.title || 'Другое')}</span>
        <span class="route-kind">${escapeHtml(info.kind)}</span>
      </div>
      ${presetIcon}
      <div class="route-title">
        <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
        <span>${escapeHtml(source)} · выше = раньше</span>
        ${presets.length ? `<div class="route-preset-tags">${presets.slice(0, 3).map((preset) => `<em>${escapeHtml(preset.title)}</em>`).join('')}${presets.length > 3 ? `<em>+${presets.length - 3}</em>` : ''}</div>` : ''}
      </div>
      ${routeValuesPreviewHtml(item.rule, info, index)}
      <select class="route-outbound" data-route-target="${index}" ${targetLocked ? 'disabled' : ''} title="${managed ? 'Служебное правило меняется через профильный раздел' : nested ? 'Назначение меняется для всей подборки в верхней строке' : ''}">
        ${targetOptions.map((option) => `<option value="${escapeHtml(option.value)}" ${selectedTarget === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
      </select>
      <div class="route-actions">
        <button class="icon-btn route-action-btn move-up" type="button" ${moveUpAttrs} ${moveUpDisabled ? 'disabled' : ''} title="${nested ? 'Поднять внутри подборки' : 'Поднять выше'}" aria-label="${nested ? 'Поднять правило внутри подборки' : 'Поднять правило выше'}">↑</button>
        <button class="icon-btn route-action-btn move-down" type="button" ${moveDownAttrs} ${moveDownDisabled ? 'disabled' : ''} title="${nested ? 'Опустить внутри подборки' : 'Опустить ниже'}" aria-label="${nested ? 'Опустить правило внутри подборки' : 'Опустить правило ниже'}">↓</button>
        <button class="icon-btn route-action-btn edit" type="button" data-route-edit="${index}" ${editLocked ? 'disabled' : ''} title="${managed ? 'Служебное правило меняется через DNS, Перехват, Защиту от утечек или Статистику Xray' : nested ? 'Править правило и сохранить как измененную копию подборки' : 'Править'}" aria-label="Править правило">✎</button>
        <button class="icon-btn route-action-btn disable" type="button" data-route-disable="${index}" ${actionLocked ? 'disabled' : ''} title="${managed ? 'Служебное правило нельзя поставить на паузу из общего списка' : nested ? 'Отключайте подборку целиком или раскройте ее в редакторе' : 'Отключить без удаления'}" aria-label="Отключить правило без удаления">⏸</button>
        <button class="icon-btn route-action-btn danger" type="button" data-route-delete="${index}" ${actionLocked ? 'disabled' : ''} title="${managed ? 'Служебное правило удаляется отключением соответствующей функции' : nested ? 'Удаляйте подборку целиком или раскройте ее в редакторе' : 'Удалить'}" aria-label="Удалить правило">×</button>
      </div>
    </article>`;
  }

  function compactRouteTargetLabel(label) {
    return String(label || '')
      .replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, '')
      .replace(/^[A-Z]{2}\s+(?=\S)/, '')
      .trim();
  }

  function routePresetGroupRowHtml(item, options, rulesLength) {
    const customGroup = item.kind === 'customGroup';
    const start = item.index + 1;
    const end = item.index + item.items.length;
    const displayStart = Number.isFinite(Number(item.displayOrderStart)) ? Number(item.displayOrderStart) : start;
    const displayEnd = Number.isFinite(Number(item.displayOrderEnd)) ? Number(item.displayOrderEnd) : end;
    const icon = routePresetIconView(escapeHtml, item.key, item.preset || {}, 'compact');
    const detail = customGroup ? (item.preset?.detail || 'Пользовательская группа правил') : routePresetDetail(item.key);
    const encodedTargets = [...new Set(item.items.map(({ rule }) => encodedRouteTarget(rule)).filter(Boolean))];
    const selectedTarget = encodedTargets.length === 1 ? encodedTargets[0] : '__mixed__';
    const targetOptions = selectedTarget === '__mixed__'
      ? [{ value: '__mixed__', label: 'Разные назначения', disabled: true }, ...options]
      : options.some((option) => option.value === selectedTarget)
        ? options
        : [{ value: selectedTarget, label: readableRouteTag(selectedTarget.replace(/^(outbound|balancer):/, '') || 'не задано') }, ...options];
    const startIndex = item.index;
    const endIndex = item.index + item.items.length;
    const detailsKey = `routing:preset-group:${item.key}:${startIndex}:${endIndex}`;
    return `<details class="route-preset-group-row" draggable="true" data-details-key="${escapeHtml(detailsKey)}" data-route-index="${item.index}" data-route-range-start="${item.index}" data-route-range-end="${item.index + item.items.length}" data-route-preset-group="${escapeHtml(item.key)}">
      <summary>
        <div class="route-preset-group-order">
          <button class="route-drag-handle" type="button" title="Перетащить подборку" aria-label="Перетащить подборку">⋮⋮</button>
          <span>${displayStart === displayEnd ? displayStart : `${displayStart}–${displayEnd}`}</span>
        </div>
        ${icon}
        <div class="route-preset-group-title">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(detail || 'Подборка правил')} · ${ruleCountLabel(item.items.length)}</span>
        </div>
        <select class="route-outbound route-group-outbound" data-route-group-target data-route-group-target-start="${startIndex}" data-route-group-target-end="${endIndex}" title="Куда отправлять всю подборку">
          ${targetOptions.map((option) => `<option value="${escapeHtml(option.value)}" ${option.disabled ? 'disabled' : ''} ${selectedTarget === option.value ? 'selected' : ''}>${escapeHtml(compactRouteTargetLabel(option.label))}</option>`).join('')}
        </select>
        <div class="route-actions route-preset-group-actions">
          <button class="icon-btn route-action-btn move-up" type="button" data-route-group-move-start="${startIndex}" data-route-group-move-end="${endIndex}" data-direction="-1" ${startIndex === 0 ? 'disabled' : ''} title="Поднять подборку выше" aria-label="Поднять подборку выше">↑</button>
          <button class="icon-btn route-action-btn move-down" type="button" data-route-group-move-start="${startIndex}" data-route-group-move-end="${endIndex}" data-direction="1" ${endIndex >= rulesLength ? 'disabled' : ''} title="Опустить подборку ниже" aria-label="Опустить подборку ниже">↓</button>
          ${customGroup
            ? `<button class="icon-btn route-action-btn edit" type="button" data-route-group-rename-start="${startIndex}" data-route-group-rename-end="${endIndex}" title="Переименовать группу" aria-label="Переименовать группу">✎</button>`
            : `<button class="icon-btn route-action-btn edit" type="button" data-route-preset-edit="${escapeHtml(item.key)}" title="Править подборку" aria-label="Править подборку">✎</button>`}
          <button class="icon-btn route-action-btn disable" type="button" data-route-group-disable-start="${startIndex}" data-route-group-disable-end="${endIndex}" data-route-group-title="${escapeHtml(item.title)}" title="Отключить подборку без удаления" aria-label="Отключить подборку без удаления">⏸</button>
          <button class="icon-btn route-action-btn danger" type="button" data-route-group-delete-start="${startIndex}" data-route-group-delete-end="${endIndex}" data-route-group-title="${escapeHtml(item.title)}" title="Удалить подборку" aria-label="Удалить подборку">×</button>
        </div>
      </summary>
      <div class="route-preset-group-children">
        ${item.items.map((child, childOffset) => routeRowHtml({ ...child, nested: true, groupStart: startIndex, groupEnd: endIndex, displayOrderStart: displayStart + childOffset }, options, rulesLength)).join('')}
      </div>
    </details>`;
  }

  function orderedRouteList(items, options, rulesLength, managedItems = managedRoutingRuleItems()) {
    let displayOrder = 1;
    const numberedItems = items.map((item) => {
      const span = (item.kind === 'presetGroup' || item.kind === 'customGroup')
        ? Math.max(1, item.items?.length || 1)
        : 1;
      const numbered = { ...item, displayOrderStart: displayOrder, displayOrderEnd: displayOrder + span - 1 };
      displayOrder += span;
      return numbered;
    });
    const userList = items.length ? `<section class="route-ordered-list">
      <header class="route-order-head">
        <strong>Порядок выполнения Xray</strong>
        <span>Сверху вниз: правило №1 проверяется первым. Перетаскивание меняет реальный порядок в конфигурации.</span>
      </header>
      <div class="route-section-list">
        ${numberedItems.map((item) => (item.kind === 'presetGroup' || item.kind === 'customGroup') ? routePresetGroupRowHtml(item, options, rulesLength) : routeRowHtml(item, options, rulesLength)).join('')}
      </div>
    </section>` : `<p class="muted route-empty-state">${state.routeSearch.trim() ? 'Правил по этому поиску нет.' : 'Пользовательских правил пока нет. Добавьте правило или выберите подборку.'}</p>`;
    return `${userList}${managedRoutesPanel(managedItems)}${routeValuesDrawer()}`;
  }

  function disableVisibleRoutingRules() {
    const visible = visibleRoutingRuleItems(80);
    if (!visible.length) return;
    const current = routeRules();
    const visibleRules = visible.flatMap((item) => item.kind === 'presetGroup' ? item.items : [item]);
    const disabledIndexes = new Set(visibleRules.map((item) => item.index));
    const disabled = visibleRules.map(({ rule, name, index }) => ({
      id: `disabled-${Date.now()}-${index}`,
      rule: JSON.parse(JSON.stringify(rule)),
      name,
      disabledAt: new Date().toISOString()
    }));
    state.disabledRouteRules = [...disabled, ...state.disabledRouteRules].slice(0, 160);
    saveDisabledRouteRules();
    setRoutingDraft(current.filter((_, index) => !disabledIndexes.has(index)));
    state.message = `Отключено правил: ${disabled.length}. Их можно вернуть из списка ниже.`;
    render();
  }

  function restoreAllDisabledRouteRules() {
    if (!state.disabledRouteRules.length) return;
    const restored = state.disabledRouteRules.map((item) => item.rule).filter(Boolean);
    for (const item of state.disabledRouteRules) {
      if (item.rule && item.name) setRouteRuleName(item.rule, item.name);
    }
    state.disabledRouteRules = [];
    saveDisabledRouteRules();
    setRoutingDraft([...restored, ...routeRules()]);
    state.message = `Возвращено правил: ${restored.length}. Они добавлены в начало списка.`;
    render();
  }

  function routeRuleTargetValue(rule) {
    if (rule?.balancerTag) return `balancer:${rule.balancerTag}`;
    return `outbound:${rule?.outboundTag || 'proxy'}`;
  }

  function routeTargetOptionMap() {
    return new Map(routeTargetOptions().map((option) => [option.value, option]));
  }

  function routeTargetLabel(value) {
    const option = routeTargetOptionMap().get(value);
    if (option?.label) return option.label;
    if (String(value || '').startsWith('balancer:')) return `Балансировщик · ${String(value).slice('balancer:'.length)}`;
    if (String(value || '').startsWith('outbound:')) return readableRouteTag(String(value).slice('outbound:'.length));
    return value || 'не задано';
  }

  function routeTargetReplacementSourceOptions() {
    const counts = new Map();
    routeRules().forEach((rule) => {
      if (!rule || isRuOpenRayManagedRoute(rule)) return;
      const value = routeRuleTargetValue(rule);
      if (['outbound:direct', 'outbound:block', 'outbound:dns-out', 'outbound:ruopenray-api'].includes(value)) return;
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count, label: routeTargetLabel(value) }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  }

  function routeTargetReplacementTargetOptions() {
    return routeTargetOptions()
      .filter((option) => !option.disabled)
      .filter((option) => option.value !== 'outbound:dns-out' && option.value !== 'outbound:ruopenray-api')
      .map((option) => ({ value: option.value, label: option.label }));
  }

  function routeTargetReplacementIndexes() {
    const rules = routeRules();
    const selected = new Set(selectedRouteRuleIndexes());
    const useSelected = state.routeReplaceScope === 'selected' && selected.size > 0;
    return rules
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule, index }) => rule && !isRuOpenRayManagedRoute(rule) && (!useSelected || selected.has(index)))
      .filter(({ rule }) => routeRuleTargetValue(rule) === state.routeReplaceFrom)
      .map(({ index }) => index);
  }

  function ensureRouteTargetReplacementDefaults() {
    const sources = routeTargetReplacementSourceOptions();
    const targets = routeTargetReplacementTargetOptions();
    if (!sources.some((option) => option.value === state.routeReplaceFrom)) {
      state.routeReplaceFrom = sources[0]?.value || '';
    }
    if (!targets.some((option) => option.value === state.routeReplaceTo) || state.routeReplaceTo === state.routeReplaceFrom) {
      state.routeReplaceTo = targets.find((option) => option.value !== state.routeReplaceFrom)?.value || '';
    }
    if (state.routeReplaceScope === 'selected' && !selectedRouteRuleIndexes().length) {
      state.routeReplaceScope = 'all';
    }
  }

  function routeTargetReplacementSummary() {
    ensureRouteTargetReplacementDefaults();
    const sources = routeTargetReplacementSourceOptions();
    const targets = routeTargetReplacementTargetOptions();
    const indexes = routeTargetReplacementIndexes();
    const selectedCount = selectedRouteRuleIndexes().length;
    const sample = indexes.slice(0, 6).map((index) => {
      const rule = routeRules()[index];
      const info = describeRouteRule(rule);
      return {
        index,
        name: routeRuleName(rule, info),
        detail: `${info.kind}: ${info.value}`,
        target: info.outbound
      };
    });
    return {
      sources,
      targets,
      selectedCount,
      affectedCount: indexes.length,
      sample,
      fromLabel: routeTargetLabel(state.routeReplaceFrom),
      toLabel: routeTargetLabel(state.routeReplaceTo)
    };
  }

  function openRouteTargetReplaceDialog() {
    ensureRouteTargetReplacementDefaults();
    state.routeTargetReplaceDialog = true;
    state.message = '';
    render();
  }

  function closeRouteTargetReplaceDialog() {
    state.routeTargetReplaceDialog = false;
    state.message = '';
    render();
  }

  function applyRouteTargetReplacement() {
    ensureRouteTargetReplacementDefaults();
    if (!state.routeReplaceFrom || !state.routeReplaceTo) {
      state.message = 'Выберите, какой сервер заменить и на что заменить.';
      render();
      return;
    }
    if (state.routeReplaceFrom === state.routeReplaceTo) {
      state.message = 'Новый сервер совпадает со старым. Выберите другую цель.';
      render();
      return;
    }
    const indexes = new Set(routeTargetReplacementIndexes());
    if (!indexes.size) {
      state.message = 'Подходящих правил для замены не найдено.';
      render();
      return;
    }
    const rules = routeRules().map((rule, index) => indexes.has(index) ? routeRuleWithTarget(rule, state.routeReplaceTo) : rule);
    setRoutingDraft(rules);
    state.routeTargetReplaceDialog = false;
    state.selectedRouteRuleIndexes = [];
    state.message = `Заменено целей в правилах: ${indexes.size}. Проверьте черновик и примените изменения.`;
    render();
  }

  function routeRuleWithTarget(rule, targetValue) {
    const [kind, ...rest] = String(targetValue || '').split(':');
    const tag = rest.join(':') || 'proxy';
    const next = { ...rule };
    delete next.outboundTag;
    delete next.balancerTag;
    if (kind === 'balancer') next.balancerTag = tag;
    else next.outboundTag = tag;
    copyRouteRuleName(rule, next);
    return next;
  }

  function updateRoutingTarget(index, targetValue) {
    if (targetValue === '__mixed__') return;
    const rules = routeRules().map((rule, ruleIndex) => ruleIndex === index ? routeRuleWithTarget(rule, targetValue) : rule);
    setRoutingDraft(rules);
    state.message = 'Цель правила изменена в черновике';
    render();
  }

  function updateRoutingTargetRange(fromStart, fromEnd, targetValue) {
    if (targetValue === '__mixed__') return;
    const rules = routeRules().map((rule, ruleIndex) => (
      ruleIndex >= fromStart && ruleIndex < fromEnd ? routeRuleWithTarget(rule, targetValue) : rule
    ));
    setRoutingDraft(rules);
    state.message = `Цель подборки изменена для правил ${fromStart + 1}–${fromEnd}`;
    render();
  }

  function routeOrderBlocks(rules = routeRules()) {
    const blocks = [];
    for (let index = 0; index < rules.length;) {
      const sequence = routePresetSequenceAt(rules, index);
      const length = sequence?.rules?.length || 1;
      const blockRules = rules.slice(index, index + length);
      blocks.push({
        start: index,
        end: index + length,
        managed: blockRules.length > 0 && blockRules.every((rule) => isRuOpenRayManagedRoute(rule))
      });
      index += length;
    }
    return blocks;
  }

  function moveRoutingRule(index, direction) {
    const block = routeOrderBlocks().find((item) => item.start <= index && index < item.end);
    if (!block) return;
    moveRoutingRuleRange(block.start, block.end, direction);
  }

  function reorderRoutingRule(fromIndex, toIndex) {
    reorderRoutingRuleRange(fromIndex, fromIndex + 1, toIndex);
  }

  function moveRoutingRuleRange(fromStart, fromEnd, direction) {
    const blocks = routeOrderBlocks();
    const blockIndex = blocks.findIndex((block) => block.start <= fromStart && fromEnd <= block.end);
    if (blockIndex < 0) return;
    const block = blocks[blockIndex];
    fromStart = block.start;
    fromEnd = block.end;
    if (direction < 0) {
      const previous = [...blocks.slice(0, blockIndex)].reverse().find((item) => !item.managed);
      if (previous) reorderRoutingRuleRange(fromStart, fromEnd, previous.start);
      return;
    }
    const next = blocks.slice(blockIndex + 1).find((item) => !item.managed);
    if (next) reorderRoutingRuleRange(fromStart, fromEnd, next.end);
  }

  function moveRoutingRuleInsideGroup(index, groupStart, groupEnd, direction) {
    index = Number(index);
    groupStart = Number(groupStart);
    groupEnd = Number(groupEnd);
    direction = Number(direction);
    if (![index, groupStart, groupEnd, direction].every(Number.isInteger)) return;
    if (Math.abs(direction) !== 1) return;
    const rules = [...routeRules()];
    const target = index + direction;
    if (groupStart < 0 || groupEnd > rules.length || groupStart >= groupEnd) return;
    if (index < groupStart || index >= groupEnd || target < groupStart || target >= groupEnd) return;
    [rules[index], rules[target]] = [rules[target], rules[index]];
    setRoutingDraft(rules);
    state.message = 'Порядок правил внутри подборки изменен.';
    render();
  }

  function reorderRoutingRuleInsideGroup(fromIndex, groupStart, groupEnd, toIndex) {
    fromIndex = Number(fromIndex);
    groupStart = Number(groupStart);
    groupEnd = Number(groupEnd);
    toIndex = Number(toIndex);
    if (![fromIndex, groupStart, groupEnd, toIndex].every(Number.isInteger)) return;
    const rules = [...routeRules()];
    if (groupStart < 0 || groupEnd > rules.length || groupStart >= groupEnd) return;
    if (fromIndex < groupStart || fromIndex >= groupEnd || toIndex < groupStart || toIndex > groupEnd) return;
    if (toIndex === fromIndex || toIndex === fromIndex + 1) return;
    const [moved] = rules.splice(fromIndex, 1);
    if (fromIndex < toIndex) toIndex -= 1;
    rules.splice(toIndex, 0, moved);
    setRoutingDraft(rules);
    state.message = 'Порядок правил внутри подборки изменен.';
    render();
  }

  function reorderRoutingRuleRange(fromStart, fromEnd, toIndex) {
    const rules = [...routeRules()];
    const length = fromEnd - fromStart;
    if (fromStart < 0 || fromEnd > rules.length || length <= 0 || toIndex < 0 || toIndex > rules.length) return;
    if (toIndex >= fromStart && toIndex <= fromEnd) return;
    const moved = rules.splice(fromStart, length);
    if (fromStart < toIndex) toIndex -= length;
    if (toIndex === fromStart) return;
    rules.splice(toIndex, 0, ...moved);
    setRoutingDraft(rules);
    state.message = length > 1
      ? 'Порядок подборки изменен. Все правила внутри нее остались рядом.'
      : 'Порядок правил изменен. Xray читает правила сверху вниз.';
    render();
  }

  function renameRoutingRule(index) {
    const rule = routeRules()[index];
    if (!rule) return;
    const info = describeRouteRule(rule);
    const nextName = prompt('Название правила', routeRuleName(rule, info));
    if (nextName === null) return;
    setRouteRuleName(rule, nextName);
    state.message = nextName.trim() ? 'Название правила сохранено' : 'Название сброшено, будет показано автоматически';
    render();
  }

  function selectableRouteRuleIndexes() {
    const rules = routeRules();
    return new Set(rules
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => rule && !isRuOpenRayManagedRoute(rule))
      .map(({ index }) => index));
  }

  function selectedRouteRuleIndexes() {
    const selectable = selectableRouteRuleIndexes();
    const seen = new Set();
    return (state.selectedRouteRuleIndexes || [])
      .map((index) => Number(index))
      .filter((index) => Number.isInteger(index) && selectable.has(index) && !seen.has(index) && seen.add(index))
      .sort((left, right) => left - right);
  }

  function toggleRouteRuleSelection(index, selected) {
    const selectable = selectableRouteRuleIndexes();
    index = Number(index);
    if (!Number.isInteger(index) || !selectable.has(index)) return;
    const next = new Set(selectedRouteRuleIndexes());
    if (selected) next.add(index);
    else next.delete(index);
    state.selectedRouteRuleIndexes = [...next].sort((left, right) => left - right);
    render();
  }

  function clearRouteRuleSelection() {
    state.selectedRouteRuleIndexes = [];
    state.routeGroupDialog = false;
    state.routeGroupTitle = '';
    state.routeGroupDetail = '';
    state.routeGroupIcon = '';
    render();
  }

  function openSelectedRouteGroupDialog() {
    const indexes = selectedRouteRuleIndexes();
    state.selectedRouteRuleIndexes = indexes;
    if (indexes.length < 2) {
      state.message = 'Отметьте хотя бы два правила, чтобы собрать группу';
      render();
      return;
    }
    const rules = routeRules();
    const names = indexes
      .map((index) => state.routeNames?.[routeRuleKey(rules[index])] || '')
      .filter(Boolean);
    state.routeGroupTitle = state.routeGroupTitle || names[0] || 'Моя группа правил';
    state.routeGroupDetail = state.routeGroupDetail || 'Пользовательская группа правил';
    state.routeGroupIcon = state.routeGroupIcon || '';
    state.routeGroupDialog = true;
    state.message = '';
    render();
  }

  function closeSelectedRouteGroupDialog() {
    state.routeGroupDialog = false;
    state.message = '';
    render();
  }

  function createSelectedRouteGroup() {
    const indexes = selectedRouteRuleIndexes();
    if (indexes.length < 2) {
      state.message = 'Отметьте хотя бы два правила, чтобы собрать группу';
      render();
      return;
    }
    const title = String(state.routeGroupTitle || '').trim();
    if (!title) {
      state.message = 'Укажите название группы правил';
      render();
      return;
    }
    const selected = new Set(indexes);
    const rules = routeRules();
    const groupRules = indexes.map((index) => JSON.parse(JSON.stringify(rules[index]))).filter(Boolean);
    const insertAt = rules.slice(0, indexes[0]).filter((_, index) => !selected.has(index)).length;
    const remaining = rules.filter((_, index) => !selected.has(index));
    remaining.splice(insertAt, 0, ...groupRules);
    groupRules.forEach((rule) => {
      state.routeNames[routeRuleKey(rule)] = title;
    });
    const id = title;
    state.customRoutePresets[id] = {
      title,
      detail: String(state.routeGroupDetail || '').trim(),
      icon: String(state.routeGroupIcon || '').trim(),
      rules: groupRules,
      preserveMixed: true,
      source: 'local',
      updatedAt: new Date().toISOString()
    };
    saveRouteNames();
    saveCustomRoutePresets();
    setRoutingDraft(remaining);
    state.selectedRouteRuleIndexes = [];
    state.routeGroupDialog = false;
    state.routeGroupTitle = '';
    state.routeGroupDetail = '';
    state.routeGroupIcon = '';
    state.message = `Группа «${title}» собрана: ${groupRules.length} правил. Проверьте порядок и примените изменения.`;
    render();
  }

  function groupRoutingRuleWithNext(index) {
    const rules = routeRules();
    const rule = rules[index];
    if (!rule || isRuOpenRayManagedRoute(rule)) return;
    const existingName = state.routeNames?.[routeRuleKey(rule)] || '';
    let start = index;
    let end = index + 1;
    if (existingName) {
      while (start > 0 && !isRuOpenRayManagedRoute(rules[start - 1]) && state.routeNames?.[routeRuleKey(rules[start - 1])] === existingName) start -= 1;
      while (end < rules.length && !isRuOpenRayManagedRoute(rules[end]) && state.routeNames?.[routeRuleKey(rules[end])] === existingName) end += 1;
    }
    if (end >= rules.length || isRuOpenRayManagedRoute(rules[end])) {
      state.message = 'Ниже нет пользовательского правила, которое можно добавить в группу';
      render();
      return;
    }
    const fallbackName = existingName || routeRuleName(rule, describeRouteRule(rule)) || 'Моя группа правил';
    const nextName = prompt('Название группы правил', fallbackName);
    if (nextName === null) return;
    const cleanName = String(nextName || '').trim();
    if (!cleanName) {
      state.message = 'Укажите название группы';
      render();
      return;
    }
    for (let ruleIndex = start; ruleIndex <= end; ruleIndex += 1) {
      state.routeNames[routeRuleKey(rules[ruleIndex])] = cleanName;
    }
    saveRouteNames();
    state.message = `Группа «${cleanName}» собрана: ${end - start + 1} правил. Перетащите группу, чтобы менять порядок целиком.`;
    render();
  }

  function renameRoutingRuleGroup(start, end) {
    const rules = routeRules();
    const groupRules = rules.slice(start, end).filter((rule) => rule && !isRuOpenRayManagedRoute(rule));
    if (!groupRules.length) return;
    const currentName = state.routeNames?.[routeRuleKey(groupRules[0])] || 'Моя группа правил';
    const nextName = prompt('Название группы правил', currentName);
    if (nextName === null) return;
    const cleanName = String(nextName || '').trim();
    if (!cleanName) {
      state.message = 'Укажите название группы';
      render();
      return;
    }
    groupRules.forEach((groupRule) => {
      state.routeNames[routeRuleKey(groupRule)] = cleanName;
    });
    saveRouteNames();
    state.message = `Группа переименована: ${cleanName}`;
    render();
  }


  return {
    previewRoutingDsl,
    configAnalysisView,
    applyRoutingDsl,
    addRoutingRule,
    testRouteRuleTarget,
    resetRouteRuleForm,
    routeRuleFromForm,
    openRoutingRuleEditor,
    saveRoutingRuleEdit,
    addRoutingPreset,
    normalizePresetRule,
    applySelectedRoutingPresets,
    routePresetRules,
    routePresetTitle,
    routePresetDetail,
    routeRuleConditionCount,
    routePresetConditionCount,
    routePresetInstallSummary,
    routePresetInstallLabel,
    builtinRoutePresetEntries,
    ruleCountLabel,
    customRoutePreset,
    customRoutePresetEntries,
    saveCustomRoutePresets,
    scenarioIdFromTitle,
    routeRuleToDslLines,
    clearRoutePresetEditor,
    newRoutingPreset,
    editRoutingPreset,
    previewRoutePresetEdit,
    routePresetCheckResultView,
    applyRoutePresetEdit,
    saveRoutePresetEdit,
    deleteCustomRoutePreset,
    checkRoutePresetSource,
    saveRoutePresetSource,
    updateRoutePresetSources,
    deleteRoutePresetSource,
    toggleRoutePresetSource,
    removeRoutingRule,
    removeRoutingRuleRange,
    disableRoutingRule,
    disableRoutingRuleRange,
    removeSelectedRoutingRules,
    disableSelectedRoutingRules,
    restoreDisabledRouteRule,
    deleteDisabledRouteRule,
    visibleRoutingRuleItems,
    managedRoutingRuleItems,
    routeRowHtml,
    orderedRouteList,
    disableVisibleRoutingRules,
    restoreAllDisabledRouteRules,
    updateRoutingTarget,
    updateRoutingTargetRange,
    openRouteTargetReplaceDialog,
    closeRouteTargetReplaceDialog,
    applyRouteTargetReplacement,
    routeTargetReplacementSummary,
    moveRoutingRule,
    moveRoutingRuleInsideGroup,
    reorderRoutingRuleInsideGroup,
    reorderRoutingRule,
    reorderRoutingRuleRange,
    moveRoutingRuleRange,
    renameRoutingRule,
    selectedRouteRuleIndexes,
    toggleRouteRuleSelection,
    clearRouteRuleSelection,
    openSelectedRouteGroupDialog,
    closeSelectedRouteGroupDialog,
    createSelectedRouteGroup,
    groupRoutingRuleWithNext,
    renameRoutingRuleGroup
  };
}
