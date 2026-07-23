import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderCompletionAlignmentText } from '../dist/index.js';

const LEDGER = {
  schema: 'zj-loop.completion-alignment-ledger.v1',
  schema_version: 1,
  target: { id: 'automation-first-product', digest: 'target', route_table_digest: 'routes' },
  summary: { complete: 1, incomplete: 1, blocked: 0, stale: 1, unsupported: 0, 'not-applicable-with-reason': 0 },
  cells: [
    {
      route_id: 'manual-smoke-report',
      adapter_id: 'github',
      status: 'complete',
      gates: { architecture_integrity: 'pass', live_capability: 'pass', stop_recovery: 'pass', experience_continuity: 'pass', automatic_progression: 'pass', verification: 'pass' },
      evidence: [],
      next_actions: [],
    },
    {
      route_id: 'ci-sweeper',
      adapter_id: 'gitlab',
      status: 'stale',
      gates: { architecture_integrity: 'pass', live_capability: 'stale', stop_recovery: 'pass', experience_continuity: 'pass', automatic_progression: 'pass', verification: 'pass' },
      evidence: [],
      next_actions: [{ type: 'supply_completion_evidence', target: 'ci-sweeper:gitlab:live_capability', label: 'Resolve live_capability for ci-sweeper on gitlab.' }],
    },
    {
      route_id: 'roadmap',
      adapter_id: 'github',
      status: 'incomplete',
      gates: { architecture_integrity: 'fail', live_capability: 'pass', stop_recovery: 'missing', experience_continuity: 'pass', automatic_progression: 'pass', verification: 'pass' },
      evidence: [],
      next_actions: [{ type: 'supply_completion_evidence', target: 'roadmap:github:architecture_integrity', label: 'Resolve architecture_integrity for roadmap on github.' }],
    },
  ],
};

test('completion text renderer exposes groups and actionable next actions', () => {
  const output = renderCompletionAlignmentText(LEDGER);

  assert.match(output, /schema: zj-loop\.completion-alignment-text\.v1/);
  assert.match(output, /target: automation-first-product/);
  assert.match(output, /status: stale/);
  assert.match(output, /completed:\n  - manual-smoke-report:github status=complete/);
  assert.match(output, /blocked_or_stale:\n  - ci-sweeper:gitlab status=stale/);
  assert.match(output, /architecture_review_required:\n  - roadmap:github status=incomplete/);
  assert.match(output, /type=supply_completion_evidence target=ci-sweeper:gitlab:live_capability/);
});

test('completion text renderer is deterministic for empty action groups', () => {
  const output = renderCompletionAlignmentText({
    ...LEDGER,
    summary: { complete: 1, incomplete: 0, blocked: 0, stale: 0, unsupported: 0, 'not-applicable-with-reason': 0 },
    cells: [LEDGER.cells[0]],
  });

  assert.match(output, /blocked_or_stale:\n  - none/);
  assert.match(output, /architecture_review_required:\n  - none/);
  assert.match(output, /next_actions:\n  - none/);
});
