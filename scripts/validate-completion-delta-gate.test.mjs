import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildCompletionAlignmentLedger } from '../tools/zj-loop-core/dist/index.js';
import { compareCompletionLedgers, validateCompletionDeltaGate } from './validate-completion-delta-gate.mjs';

const TABLE = `schemaVersion: 1
kind: zj-loop-route-table
metadata:
  completion_target:
    id: automation-first-product
    schema_version: 1
routes:
  - route_id: smoke
    enabled: true
    request_kind: report-only
    consumer: smoke
    consumer_kind: report-consumer
    execution: { mode: report-only, side_effect_level: evidence, completion_forms: [report-evidence] }
    maturity: { protocol: install-ready, runner: install-ready }
    capabilities: { scopes: [smoke], verifiers: [test], max_side_effect_level: evidence }
    provider_support:
      github: { status: live-supported, evidence: [dogfood-run:smoke] }
      gitlab: { status: dry-run-supported, evidence: [template:smoke] }
    completion_target:
      adapters:
        github: { applicability: applicable, requirement: required, signal_initiation_mode: explicit-on-demand }
`;

test('completion delta gate passes the repository and requires no side effects', async () => {
  const result = await validateCompletionDeltaGate();

  assert.equal(result.schema, 'zj-loop.completion_delta_gate.v1');
  assert.equal(result.status, 'pass');
  assert.equal(result.architecture_integrity.status, 'pass');
  assert.equal(result.side_effects_executed, false);
});

test('completion ledger delta blocks a completed-cell regression', () => {
  const baseline = buildCompletionAlignmentLedger({ table: {
    schemaVersion: 1,
    kind: 'zj-loop-route-table',
    metadata: { completion_target: { id: 'automation-first-product', schema_version: 1 } },
    routes: [],
  }, routeTableText: 'baseline' });
  const completed = {
    ...baseline,
    cells: [{ route_id: 'smoke', adapter_id: 'github', status: 'complete' }],
  };
  const current = {
    ...baseline,
    cells: [{ route_id: 'smoke', adapter_id: 'github', status: 'stale' }],
  };

  const result = compareCompletionLedgers(completed, current);

  assert.deepEqual(result.regressions, ['completed cell regressed: smoke:github complete -> stale']);
});

test('completion delta gate requires a baseline when requested', async () => {
  const result = await validateCompletionDeltaGate(undefined, {
    currentRouteTableText: TABLE,
    requireBaseline: true,
  });

  assert.equal(result.status, 'fail');
  assert.ok(result.errors.includes('completion ledger baseline is required'));
  assert.equal(result.side_effects_executed, false);
});
