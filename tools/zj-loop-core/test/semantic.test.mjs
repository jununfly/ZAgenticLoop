import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimatePatternCost,
  getPatternProfile,
  listPatternSummaries,
  listRequiredSkills,
  parsePatternRegistry,
  recommendPatterns,
} from '../dist/index.js';

const REGISTRY = parsePatternRegistry(`
schemaVersion: 1
patterns:
  - id: daily-triage
    name: Daily Triage
    goal: Prioritized morning scan
    cadence: 1d
    risk: low
    skills: [zj-loop-triage, zj-minimal-fix]
    state: zj-loop/STATE.md
    phases: [report, escalate]
    human_gates: [design-decisions]
    starter: starters/minimal-loop
    week_one_mode: L1
    token_cost: low
    cost:
      tokens_noop: 5000
      tokens_report: 50000
      tokens_action: 200000
      suggested_daily_cap: 100000
      early_exit_required: false
  - id: ci-sweeper
    name: CI Sweeper
    goal: React to failing CI
    cadence: 5m-15m
    risk: medium
    skills: [zj-ci-triage, zj-minimal-fix]
    state: zj-loop/ci-sweeper-state.md
    phases: [detect, classify, fix]
    human_gates: [max-attempts]
    starter: starters/ci-sweeper
    week_one_mode: L2
    token_cost: very-high
    cost:
      tokens_noop: 5000
      tokens_report: 50000
      tokens_action: 200000
      suggested_daily_cap: 1000000
      early_exit_required: true
  - id: dependency-sweeper
    name: Dependency Sweeper
    goal: Discover and apply dependency updates
    cadence: 6h-1d
    risk: medium
    skills: [zj-dependency-triage, zj-minimal-fix, zj-loop-verifier]
    state: zj-loop/dependency-sweeper-state.md
    phases: [scan, triage-risk, patch-safe]
    human_gates: [major-bumps]
    starter: starters/dependency-sweeper
    week_one_mode: L2
    token_cost: medium
    cost:
      tokens_noop: 5000
      tokens_report: 60000
      tokens_action: 300000
      suggested_daily_cap: 500000
      early_exit_required: true
`, 'semantic.fixture.yaml');

test('listPatternSummaries projects stable cards without full registry leakage', () => {
  const result = listPatternSummaries(REGISTRY);
  assert.equal(result.meta.query, 'listPatternSummaries');
  assert.equal(result.patterns.length, 3);
  assert.deepEqual(result.patterns[0], {
    id: 'daily-triage',
    name: 'Daily Triage',
    goal: 'Prioritized morning scan',
    cadence: '1d',
    risk: 'low',
    weekOneMode: 'L1',
    tokenCostTier: 'low',
    stateFile: 'zj-loop/STATE.md',
    requiredSkills: ['zj-loop-triage', 'zj-minimal-fix'],
    humanGates: ['design-decisions'],
    starter: 'starters/minimal-loop',
  });
  assert.equal('cost' in result.patterns[0], false);
  assert.equal('init' in result.patterns[0], false);
});

test('getPatternProfile separates registry facts from optional docs', () => {
  const result = getPatternProfile(REGISTRY, {
    patternId: 'daily-triage',
    patternDoc: { path: 'patterns/daily-triage.md', text: '# Daily Triage\n' },
  });
  assert.equal(result.meta.query, 'getPatternProfile');
  assert.equal(result.pattern.id, 'daily-triage');
  assert.equal(result.summary.id, 'daily-triage');
  assert.equal(result.documentation.path, 'patterns/daily-triage.md');

  const missing = getPatternProfile(REGISTRY, { patternId: 'missing' });
  assert.equal(missing.code, 'pattern_not_found');
  assert.ok(missing.availablePatternIds.includes('ci-sweeper'));
});

test('recommendPatterns returns deterministic ranked results with reason codes', () => {
  const ci = recommendPatterns(REGISTRY, { useCase: 'watch CI failures', limit: 2 });
  assert.equal(ci.recommendations[0].pattern.id, 'ci-sweeper');
  assert.ok(ci.recommendations[0].reasons.some((r) => r.code === 'boost.ci'));

  const deps = recommendPatterns(REGISTRY, { useCase: 'update dependencies' });
  assert.equal(deps.recommendations[0].pattern.id, 'dependency-sweeper');
  assert.ok(deps.recommendations[0].reasons.some((r) => r.code === 'boost.dependency'));

  const weak = recommendPatterns(REGISTRY, { useCase: 'morning scan' });
  assert.ok(weak.recommendations.length > 0);
  assert.equal(weak.recommendations[0].pattern.id, 'daily-triage');
  assert.equal(weak.recommendations[0].score, 4);
  assert.equal(weak.recommendations[0].confidence, 'medium');
  assert.ok(weak.recommendations[0].reasons.every((r) => r.code === 'match.goal' && r.scoreImpact === 2));
});

test('estimatePatternCost exposes structured estimate, warnings, and typed errors', () => {
  const result = estimatePatternCost(REGISTRY, { patternId: 'ci-sweeper', cadence: '15m', level: 'L2' });
  assert.equal(result.meta.query, 'estimatePatternCost');
  assert.equal(result.estimate.runsPerDay, 96);
  assert.ok(result.estimate.warnings.length > 0);
  assert.ok(result.meta.warnings.some((w) => w.code === 'cost.high_cadence'));
  assert.ok(result.estimate.scenarios.realistic.tokensPerDay < result.estimate.scenarios.action.tokensPerDay);

  assert.equal(estimatePatternCost(REGISTRY, { patternId: 'ci-sweeper', cadence: 'garbage', level: 'L2' }).code, 'invalid_cadence');
  assert.equal(estimatePatternCost(REGISTRY, { patternId: 'missing', level: 'L2' }).code, 'pattern_not_found');
});

test('listRequiredSkills returns registry skills as required', () => {
  const result = listRequiredSkills(REGISTRY, 'dependency-sweeper');
  assert.equal(result.meta.query, 'listRequiredSkills');
  assert.deepEqual(result.skills.map((s) => s.name), ['zj-dependency-triage', 'zj-minimal-fix', 'zj-loop-verifier']);
  assert.ok(result.skills.every((s) => s.required));

  const missing = listRequiredSkills(REGISTRY, 'missing');
  assert.equal(missing.code, 'pattern_not_found');
});
