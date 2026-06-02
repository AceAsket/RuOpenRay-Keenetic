import assert from 'node:assert/strict';
import test from 'node:test';

import {
  routePresetInstallSummaryFor,
  routePresetSequenceAt,
  routeRulePresetMatchesFor
} from '../cmd/ruopenray-ui/web/routing-groups.js';

const presets = new Map([
  ['telegram', {
    title: 'Telegram',
    rules: [
      { domain: ['domain:t.me'], outboundTag: 'proxy' },
      { ip: ['149.154.160.0/20'], network: 'udp', outboundTag: 'proxy' }
    ]
  }],
  ['direct-local', {
    title: 'Local direct',
    rules: [
      { ip: ['geoip:private'], outboundTag: 'direct' }
    ]
  }]
]);

const entries = () => [...presets.entries()];
const rulesForKey = (key) => presets.get(key)?.rules || [];
const titleForKey = (key) => presets.get(key)?.title || key;
const normalizeProxy = (rule) => ({
  ...rule,
  outboundTag: rule.outboundTag === 'proxy' ? 'server-de' : rule.outboundTag
});

test('route preset sequence stays grouped after proxy alias resolves to a server tag', () => {
  const currentRules = [
    { domain: ['domain:t.me'], outboundTag: 'server-de' },
    { ip: ['149.154.160.0/20'], network: 'udp', outboundTag: 'server-de' },
    { domain: ['domain:example.com'], outboundTag: 'direct' }
  ];

  const sequence = routePresetSequenceAt(currentRules, 0, entries(), rulesForKey, normalizeProxy, titleForKey);

  assert.equal(sequence?.key, 'telegram');
  assert.equal(sequence?.rules.length, 2);
});

test('route preset sequence does not match partial groups', () => {
  const currentRules = [
    { domain: ['domain:t.me'], outboundTag: 'server-de' }
  ];

  const sequence = routePresetSequenceAt(currentRules, 0, entries(), rulesForKey, normalizeProxy, titleForKey);

  assert.equal(sequence, null);
});

test('single rule preset match uses conditions, not current outbound target', () => {
  const matches = routeRulePresetMatchesFor(
    { domain: ['domain:t.me'], outboundTag: 'server-nl' },
    entries(),
    rulesForKey,
    normalizeProxy,
    titleForKey
  );

  assert.deepEqual(matches, [{ key: 'telegram', title: 'Telegram' }]);
});

test('install summary counts already installed preset rules by condition', () => {
  const currentRules = [
    { domain: ['domain:t.me'], outboundTag: 'server-de' },
    { ip: ['149.154.160.0/20'], network: 'udp', outboundTag: 'server-de' }
  ];

  const summary = routePresetInstallSummaryFor('telegram', currentRules, rulesForKey, normalizeProxy);

  assert.equal(summary.total, 2);
  assert.equal(summary.matched, 2);
  assert.equal(summary.installed, true);
});
