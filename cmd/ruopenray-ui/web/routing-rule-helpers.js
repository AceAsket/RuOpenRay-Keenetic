export function routeRuleConditionValue(rule, field) {
  if (field === 'port') {
    const value = String(rule?.port || '').trim();
    return value && value !== '0-65535' ? value : '';
  }
  const values = Array.isArray(rule?.[field])
    ? rule[field].map((item) => String(item || '').trim()).filter(Boolean)
    : (rule?.[field] ? [String(rule[field]).trim()].filter(Boolean) : []);
  return values;
}

export function splitMixedRouteRule(rule) {
  if (!rule) return [];
  const fields = ['domain', 'ip', 'source', 'inboundTag', 'port'];
  const populated = fields
    .map((field) => ({ field, value: routeRuleConditionValue(rule, field) }))
    .filter(({ value }) => Array.isArray(value) ? value.length > 0 : Boolean(value));
  if (populated.length <= 1) return [rule];
  const base = JSON.parse(JSON.stringify(rule));
  fields.forEach((field) => delete base[field]);
  return populated.map(({ field, value }) => ({
    ...JSON.parse(JSON.stringify(base)),
    [field]: Array.isArray(value) ? [...value] : value
  }));
}

export function expandRoutePresetRules(rules, preserveMixed = false) {
  const source = Array.isArray(rules) ? rules : [];
  if (preserveMixed) return source;
  return source.flatMap(splitMixedRouteRule);
}

export function routeRuleConditionSignature(rule) {
  const sorted = (values) => Array.isArray(values) ? [...values].map(String).sort() : [];
  const port = String(rule?.port || '').trim();
  const hasConditions = Boolean(
    sorted(rule?.domain).length ||
    sorted(rule?.ip).length ||
    sorted(rule?.source).length ||
    sorted(rule?.inboundTag).length ||
    rule?.network ||
    (port && port !== '0-65535')
  );
  return {
    network: String(rule?.network || ''),
    domain: sorted(rule?.domain),
    ip: sorted(rule?.ip),
    source: sorted(rule?.source),
    inboundTag: sorted(rule?.inboundTag),
    port: hasConditions ? port : ''
  };
}

export function routeRuleConditionKey(rule) {
  return JSON.stringify(routeRuleConditionSignature(rule));
}

export function routePresetRuleMatches(rule, presetRule) {
  return routeRuleConditionKey(rule) === routeRuleConditionKey(presetRule);
}

export function routePresetRuleSetMatches(currentRules, presetRules) {
  if (!Array.isArray(currentRules) || currentRules.length !== presetRules.length) return false;
  const remaining = new Map();
  presetRules.forEach((rule) => {
    const key = routeRuleConditionKey(rule);
    remaining.set(key, (remaining.get(key) || 0) + 1);
  });
  for (const rule of currentRules) {
    const key = routeRuleConditionKey(rule);
    const count = remaining.get(key) || 0;
    if (count <= 0) return false;
    if (count === 1) remaining.delete(key);
    else remaining.set(key, count - 1);
  }
  return remaining.size === 0;
}
