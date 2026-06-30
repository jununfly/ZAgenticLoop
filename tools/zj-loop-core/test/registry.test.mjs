import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGISTRY_SCHEMA_VERSION,
  parsePatternRegistry,
} from '../dist/index.js';

const VALID_REGISTRY = `
schemaVersion: 1
patterns:
  - id: daily-triage
    name: Daily Triage
    cadence: 1d
    token_cost: low
    cost:
      tokens_noop: 5000
      tokens_report: 50000
      tokens_action: 200000
      suggested_daily_cap: 100000
      early_exit_required: false
    init:
      budget:
        max_runs_per_day: 2
        max_spawns_l1: 0
        max_spawns_l2: 2
      first_loop_command:
        grok: /loop 1d Run loop-triage.
        claude: /loop 1d $loop-triage
        codex: "Automation daily: loop-triage"
`;

test('parsePatternRegistry: validates schemaVersion and pattern cost fields', () => {
  const registry = parsePatternRegistry(VALID_REGISTRY, 'registry.yaml');
  assert.equal(REGISTRY_SCHEMA_VERSION, 1);
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.patterns[0].id, 'daily-triage');
  assert.equal(registry.patterns[0].cost.suggested_daily_cap, 100000);
  assert.equal(registry.patterns[0].init.budget.max_runs_per_day, 2);
});

test('parsePatternRegistry: fails fast on unsupported schema versions', () => {
  assert.throws(
    () => parsePatternRegistry(VALID_REGISTRY.replace('schemaVersion: 1', 'schemaVersion: 2'), 'registry.yaml'),
    /schemaVersion/,
  );
});

test('parsePatternRegistry: reports missing cost fields', () => {
  assert.throws(
    () => parsePatternRegistry(VALID_REGISTRY.replace('tokens_action: 200000', ''), 'registry.yaml'),
    /tokens_action/,
  );
});
