import { configTestFailureDetails } from './xray-error-details.js';

export function createConfigActions({
  state,
  request,
  render,
  refresh,
  keepOperationVisible,
  recordXrayStatsSample,
  xrayStatsResetAtStorageKey,
  cancelServerDraftSave,
  activeProxyTag
}) {
  async function testConfig() {
    const startedAt = Date.now();
    state.configTesting = true;
    state.messageDetails = null;
    state.message = 'Проверяю конфигурацию Xray...';
    render();
    const config = materializeProxyAliases(JSON.parse(state.jsonDraft), activeProxyTag);
    const [result, analysis] = await Promise.all([
      request('/api/config/test', { method: 'POST', body: JSON.stringify({ config }) }),
      request('/api/config/analyze', { method: 'POST', body: JSON.stringify({ config }) })
    ]);
    state.configAnalysis = analysis;
    if (result.geoStatus) {
      state.geoStatus = result.geoStatus;
    } else if (result.geoAudit) {
      state.geoStatus = { ...(state.geoStatus || {}), audit: result.geoAudit };
    }
    await keepOperationVisible(startedAt);
    state.configTesting = false;
    state.configTestLog = {
      ok: Boolean(result.ok),
      at: new Date().toISOString(),
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      message: result.message || ''
    };
    state.message = configTestSummary(result, analysis);
    state.messageDetails = configTestFailureDetails(result, analysis, state.message);
    render();
  }

  async function applyConfig(options = {}) {
    const startedAt = Date.now();
    state.configApplying = true;
    state.messageDetails = null;
    state.message = options.progressMessage || state.message || 'Применяю конфигурацию: проверка, запись config.json и перезапуск Xray...';
    render();
    try {
      const parsed = materializeProxyAliases(JSON.parse(state.jsonDraft), activeProxyTag);
      if (typeof cancelServerDraftSave === 'function') cancelServerDraftSave();
      const result = await request('/api/config/apply', { method: 'POST', body: JSON.stringify({ config: parsed }) });
      state.appliedConfigText = JSON.stringify(parsed, null, 2);
      state.jsonDraft = state.appliedConfigText;
      state.serverDraftExists = false;
      state.serverDraftSavedAt = '';
      state.serverDraftError = '';
      state.configAnalysis = result.analysis || null;
      state.lastApplyBackup = result.backup || state.lastApplyBackup;
      state.message = options.successMessage || result.restart?.stdout || result.test?.stdout || 'Конфигурация применена';
      state.messageDetails = null;
      await refresh({ renderAfter: false });
      await keepOperationVisible(startedAt, 900);
    } finally {
      state.configApplying = false;
      render();
    }
  }

  async function setXrayStats(enabled) {
    const result = await request('/api/xray/stats/settings', {
      method: 'POST',
      body: JSON.stringify({ enabled })
    });
    state.lastApplyBackup = result.backup || state.lastApplyBackup;
    state.configAnalysis = result.analysis || state.configAnalysis;
    state.xrayTrafficHistory = [];
    state.message = enabled
      ? 'Статистика Xray включена, сервис перезапущен'
      : 'Статистика Xray выключена, сервис перезапущен';
    await refresh();
  }

  async function resetXrayStats() {
    if (!confirm('Сбросить счетчики Xray? Это обнулит только статистику трафика в панели и не перезапустит Xray.')) return;
    const result = await request('/api/xray/stats/reset', { method: 'POST', body: JSON.stringify({}) });
    state.xrayTrafficHistory = [];
    state.xrayStatsResetAt = new Date().toISOString();
    globalThis.localStorage?.setItem(xrayStatsResetAtStorageKey, state.xrayStatsResetAt);
    state.status = { ...(state.status || {}), xrayStats: result };
    recordXrayStatsSample(state.status);
    state.message = result.ok ? 'Счетчики Xray сброшены' : (result.stderr || 'Не удалось сбросить счетчики Xray');
    render();
  }

  async function analyzeConfig() {
    const parsed = materializeProxyAliases(JSON.parse(state.jsonDraft), activeProxyTag);
    state.configAnalysis = await request('/api/config/analyze', { method: 'POST', body: JSON.stringify({ config: parsed }) });
    const errors = state.configAnalysis.errors?.length || 0;
    const warnings = state.configAnalysis.warnings?.length || 0;
    state.message = `Проверка правил: ошибок ${errors}, предупреждений ${warnings}`;
    render();
  }

  async function restoreLatestBackup() {
    const result = await request('/api/backup/restore', { method: 'POST', body: JSON.stringify({ path: state.lastApplyBackup || '' }) });
    state.configAnalysis = result.analysis || null;
    state.message = result.ok ? `Откат выполнен: ${result.path}` : result.stderr || 'Откат не удался';
    await refresh();
  }

  function downloadConfig({ anonymized = false } = {}) {
    let config;
    try {
      config = JSON.parse(state.jsonDraft || '{}');
    } catch (error) {
      state.message = `Не удалось скачать config: JSON сейчас невалидный (${error.message})`;
      render();
      return;
    }
    const payload = anonymized ? anonymizeConfig(config) : config;
    const suffix = anonymized ? 'anonymized' : 'full';
    const filename = `ruopenray-config-${suffix}-${dateTimeStamp()}.json`;
    downloadJSON(filename, payload);
    state.message = anonymized
      ? 'Скачан обезличенный config: адреса серверов, теги proxy и ключи заменены масками'
      : 'Скачан полный config Xray';
    render();
  }

  return {
    testConfig,
    applyConfig,
    setXrayStats,
    resetXrayStats,
    analyzeConfig,
    restoreLatestBackup,
    downloadConfig,
    downloadAnonymizedConfig: () => downloadConfig({ anonymized: true })
  };
}

function materializeProxyAliases(config, activeProxyTag) {
  const next = JSON.parse(JSON.stringify(config || {}));
  const outbounds = Array.isArray(next.outbounds) ? next.outbounds : [];
  removeTransparentCatchAllRules(next);
  if (outbounds.some((outbound) => outbound?.tag === 'proxy')) return next;
  const systemTags = new Set(['direct', 'block', 'dns-out', 'ruopenray-api']);
  const replacement = typeof activeProxyTag === 'function'
    ? String(activeProxyTag() || '').trim()
    : '';
  const fallback = replacement || String(outbounds.find((outbound) => {
    const tag = String(outbound?.tag || '').trim();
    return tag && !systemTags.has(tag) && !['freedom', 'blackhole', 'dns'].includes(outbound?.protocol);
  })?.tag || '').trim();
  if (!fallback) return next;
  const rules = Array.isArray(next.routing?.rules) ? next.routing.rules : [];
  for (const rule of rules) {
    if (rule && rule.outboundTag === 'proxy') rule.outboundTag = fallback;
  }
  return next;
}

function removeTransparentCatchAllRules(config) {
  const rules = Array.isArray(config?.routing?.rules) ? config.routing.rules : [];
  if (!rules.length) return;
  config.routing.rules = rules.filter((rule) => !isTransparentCatchAllRoute(rule));
}

function isTransparentCatchAllRoute(rule) {
  if (!Array.isArray(rule?.inboundTag) || !rule.inboundTag.includes('transparent_ipv4')) return false;
  return !(
    (Array.isArray(rule.domain) && rule.domain.length) ||
    (Array.isArray(rule.ip) && rule.ip.length) ||
    (Array.isArray(rule.source) && rule.source.length) ||
    rule.network ||
    rule.port ||
    rule.balancerTag
  );
}

function configTestSummary(result = {}, analysis = {}) {
  const errors = Array.isArray(analysis.errors) ? analysis.errors.length : 0;
  const warnings = Array.isArray(analysis.warnings) ? analysis.warnings.length : 0;
  const geoMissing = Number(result.geoAudit?.summary?.missing || 0);
  const geoTotal = Number(result.geoAudit?.summary?.total || 0);
  if (geoMissing > 0) return `Конфигурация не прошла Geo Doctor: проблем ${geoMissing} из ${geoTotal || geoMissing}`;
  if (result.ok) {
    if (warnings > 0) return `Конфигурация корректна, но есть предупреждения: ${warnings}`;
    return 'Конфигурация корректна. Xray принял черновик без ошибок.';
  }
  if (errors > 0) return `Конфигурация не прошла проверку: ошибок ${errors}`;
  return 'Конфигурация не прошла проверку. Подробности сохранены в техническом выводе.';
}

function dateTimeStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function anonymizeConfig(config) {
  const cloned = JSON.parse(JSON.stringify(config || {}));
  const tagMap = new Map();
  const systemTags = new Set(['direct', 'block', 'dns-out', 'ruopenray-api']);
  let proxyIndex = 1;

  for (const outbound of Array.isArray(cloned.outbounds) ? cloned.outbounds : []) {
    const tag = String(outbound?.tag || '');
    if (!tag || systemTags.has(tag)) continue;
    tagMap.set(tag, `proxy-${proxyIndex}`);
    outbound.tag = `proxy-${proxyIndex}`;
    proxyIndex += 1;
  }

  const masked = redactConfigValue(cloned, tagMap);
  masked._ruopenray_export = {
    anonymized: true,
    note: 'Sensitive server addresses, credentials and user proxy tags were masked by RuOpenRay UI.'
  };
  return masked;
}

function redactConfigValue(value, tagMap, key = '', parentKey = '') {
  if (Array.isArray(value)) {
    return value.map((item) => redactConfigValue(item, tagMap, key, parentKey));
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') return redactString(value, key, parentKey, tagMap);
    return value;
  }
  const out = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    if (isSensitiveKey(rawKey, parentKey)) {
      out[rawKey] = maskedValue(rawValue, rawKey);
    } else {
      out[rawKey] = redactConfigValue(rawValue, tagMap, rawKey, key);
    }
  }
  return out;
}

function redactString(value, key, parentKey, tagMap) {
  if (tagMap.has(value)) return tagMap.get(value);
  if (key === 'selector' && tagMap.has(value)) return tagMap.get(value);
  if (key === 'fallbackTag' && tagMap.has(value)) return tagMap.get(value);
  if (key === 'outboundTag' && tagMap.has(value)) return tagMap.get(value);
  if (key === 'tag' && parentKey === 'outbounds' && tagMap.has(value)) return tagMap.get(value);
  return value;
}

function isSensitiveKey(key, parentKey) {
  const normalized = String(key || '').toLowerCase();
  if (['password', 'pass', 'secret', 'token', 'privatekey', 'shortid', 'spiderx', 'path'].includes(normalized)) return true;
  if (['id', 'uuid', 'alterid'].includes(normalized)) return true;
  if (['address', 'server', 'servername', 'sni', 'host', 'dest'].includes(normalized)) return true;
  if (parentKey === 'headers' && ['host'].includes(normalized)) return true;
  return false;
}

function maskedValue(value, key) {
  if (Array.isArray(value)) return value.map((item) => maskedValue(item, key));
  if (value && typeof value === 'object') return '[masked]';
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return value;
  return `[masked:${key}]`;
}

function downloadJSON(filename, payload) {
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
