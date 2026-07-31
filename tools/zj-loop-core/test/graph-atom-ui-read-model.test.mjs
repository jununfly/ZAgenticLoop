import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGraphAtomUiFixture, projectGraphAtomUiReadModel } from '../dist/graph-atom-ui-read-model.js';

test('Graph Atom read model projects a review-ready canonical fixture without creating facts', () => {
  const model = projectGraphAtomUiReadModel(createGraphAtomUiFixture('review-ready'));
  assert.equal(model.status, 'review-ready');
  assert.equal(model.side_effects_executed, false);
  assert.equal(model.event.event_id, 'event-graph-atom-1');
  assert.equal(model.nodes.length, 2);
  assert.deepEqual(model.nodes[1].depends_on, ['task-agent-1']);
  assert.match(model.plan.plan_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(model.next_action.kind, 'human-review');
});

test('Graph Atom fixture exposes blocked and scope-drift as explainable read states', () => {
  const blocked = projectGraphAtomUiReadModel(createGraphAtomUiFixture('blocked'));
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.next_action.kind, 'inspect-blocker');
  assert.ok(blocked.blocking_reasons.length > 0);

  const drifted = projectGraphAtomUiReadModel(createGraphAtomUiFixture('scope-drift'));
  assert.equal(drifted.status, 'scope-drift');
  assert.equal(drifted.next_action.kind, 'reject-scope-drift');
  assert.ok(drifted.blocking_reasons.includes('scope-digest-mismatch'));
});

test('Graph Atom projection rejects invalid or incomplete facts fail-closed', () => {
  const facts = createGraphAtomUiFixture('review-ready');
  facts.nodes[0].execution.execution_digest = facts.nodes[1].execution.execution_digest;
  assert.throws(() => projectGraphAtomUiReadModel(facts), /graph-atom-ui-facts-invalid/);
});
