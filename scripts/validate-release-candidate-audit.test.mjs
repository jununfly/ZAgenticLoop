import { test } from 'node:test';
import assert from 'node:assert/strict';

import { auditReleaseCandidate, buildReleaseCandidateAudit } from './validate-release-candidate-audit.mjs';

test('release candidate audit derives the current matrix without side effects', async () => {
  const result = await auditReleaseCandidate();

  assert.equal(result.schema, 'zj-loop.release_candidate_complete_matrix_audit.v1');
  assert.equal(result.status, 'not-ready');
  assert.equal(result.target.id, 'automation-first-product');
  assert.equal(result.matrix.required_cells, 40);
  assert.equal(result.matrix.complete_required_cells, 0);
  assert.equal(result.matrix.blocking_cells.length, 40);
  assert.equal(result.side_effects_executed, false);
});

test('release candidate audit accepts a fully complete required matrix', () => {
  const completeCell = {
    route_id: 'smoke', adapter_id: 'github', status: 'complete',
    gates: { architecture_integrity: 'pass', live_capability: 'pass', stop_recovery: 'pass', experience_continuity: 'pass', automatic_progression: 'pass', verification: 'pass' },
    next_actions: [],
  };
  const notApplicableCell = { ...completeCell, adapter_id: 'workspace', status: 'not-applicable-with-reason' };
  const result = buildReleaseCandidateAudit({
    completion: {
      target: { id: 'automation-first-product', digest: 'target', route_table_digest: 'route-table' },
      summary: { complete: 1, incomplete: 0, blocked: 0, stale: 0, unsupported: 0, 'not-applicable-with-reason': 1 },
      cells: [completeCell, notApplicableCell],
    },
    architecture: { status: 'pass' }, releaseCapability: { errors: [], warnings: [] },
    delta: { status: 'pass', errors: [], warnings: [], stale_cells: [], delta: null },
  });

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.checks, { architecture_integrity: true, release_capability: true, completion_delta: true, required_matrix: true });
  assert.equal(result.matrix.required_cells, 1);
  assert.equal(result.matrix.complete_required_cells, 1);
  assert.deepEqual(result.blocking_reasons, []);
});

test('release candidate audit keeps upstream gate failures separate from matrix gaps', () => {
  const result = buildReleaseCandidateAudit({
    completion: {
      target: { id: 'automation-first-product', digest: 'target', route_table_digest: 'route-table' },
      summary: { complete: 0, incomplete: 0, blocked: 0, stale: 0, unsupported: 1, 'not-applicable-with-reason': 0 },
      cells: [{ route_id: 'smoke', adapter_id: 'github', status: 'unsupported', gates: {}, next_actions: [{ type: 'implement_adapter_capability' }] }],
    },
    architecture: { status: 'fail' }, releaseCapability: { errors: ['claim drift'], warnings: [] },
    delta: { status: 'fail', errors: ['stale'], warnings: [], stale_cells: ['smoke:github'], delta: null },
  });

  assert.equal(result.status, 'not-ready');
  assert.equal(result.matrix.blocking_cells[0].status, 'unsupported');
  assert.deepEqual(result.checks, { architecture_integrity: false, release_capability: false, completion_delta: false, required_matrix: false });
  assert.equal(result.blocking_reasons.length, 4);
  assert.equal(result.side_effects_executed, false);
});
