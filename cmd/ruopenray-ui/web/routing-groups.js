import {
  routePresetRuleMatches,
  routePresetRuleSetMatches,
  routeRuleConditionKey
} from './routing-rule-helpers.js';

function presetEntriesWithRules(entries, rulesForKey, normalizeRule, titleForKey) {
  return entries
    .map(([key, preset]) => ({
      key,
      preset,
      title: titleForKey(key),
      rules: rulesForKey(key).map(normalizeRule)
    }))
    .filter((entry) => entry.rules.length > 0)
    .sort((left, right) => right.rules.length - left.rules.length);
}

export function routeRulePresetMatchesFor(rule, entries, rulesForKey, normalizeRule, titleForKey) {
  return entries
    .filter(([key]) => rulesForKey(key).some((presetRule) => routePresetRuleMatches(rule, normalizeRule(presetRule))))
    .map(([key]) => ({ key, title: titleForKey(key) }));
}

export function routePresetSequenceAt(rules, startIndex, entries, rulesForKey, normalizeRule, titleForKey) {
  const candidates = presetEntriesWithRules(entries, rulesForKey, normalizeRule, titleForKey);
  for (const entry of candidates) {
    if (startIndex + entry.rules.length > rules.length) continue;
    const currentSlice = rules.slice(startIndex, startIndex + entry.rules.length);
    if (routePresetRuleSetMatches(currentSlice, entry.rules)) return entry;
  }
  return null;
}

export function routePresetInstallSummaryFor(key, currentRules, rulesForKey, normalizeRule) {
  const presetRules = rulesForKey(key).map(normalizeRule);
  const currentKeys = new Set(currentRules.map(routeRuleConditionKey));
  const presetKeys = [...new Set(presetRules.map(routeRuleConditionKey))];
  const matched = presetKeys.filter((presetKey) => currentKeys.has(presetKey)).length;
  return {
    matched,
    total: presetKeys.length,
    installed: Boolean(presetKeys.length && matched === presetKeys.length),
    partial: Boolean(matched && matched < presetKeys.length)
  };
}
