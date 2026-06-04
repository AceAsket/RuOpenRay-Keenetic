import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const catalog = JSON.parse(await readFile(new URL('../scenarios.json', import.meta.url), 'utf8'));

test('routing scenarios catalog has valid metadata and scenarios', () => {
  assert.equal(String(catalog.schema), '1');
  assert.equal(typeof catalog.name, 'string');
  assert.ok(catalog.name.trim());
  assert.equal(typeof catalog.version, 'string');
  assert.ok(catalog.version.trim());

  const scenarios = catalog.scenarios || catalog.presets || {};
  assert.ok(Object.keys(scenarios).length > 0);
});

test('routing scenarios contain usable routing rules', () => {
  const scenarios = catalog.scenarios || catalog.presets || {};
  let ruleCount = 0;

  for (const [id, scenario] of Object.entries(scenarios)) {
    assert.equal(typeof scenario.title, 'string', `${id}: title is required`);
    assert.ok(scenario.title.trim(), `${id}: title is required`);
    assert.ok(Array.isArray(scenario.rules), `${id}: rules must be an array`);
    assert.ok(scenario.rules.length > 0, `${id}: at least one rule is required`);

    for (const [index, rule] of scenario.rules.entries()) {
      const label = `${id}.rules[${index}]`;
      const hasMatcher = ['domain', 'ip', 'source', 'inboundTag', 'network', 'port'].some((key) => Boolean(rule[key]));
      const hasTarget = Boolean(rule.outboundTag || rule.balancerTag);
      assert.ok(hasMatcher, `${label}: rule must include a matcher`);
      assert.ok(hasTarget, `${label}: rule must include outboundTag or balancerTag`);
      ruleCount += 1;
    }
  }

  assert.ok(ruleCount > 0);
});
