import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpnReadOnlyGraphVerificationResult, validateOpnReadOnlyGraphVerificationResult } from '../dist/opn-readonly-graph-verification.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;

test('Graph verification result binds Agent2 output to the exact source Artifact and plan', () => {
  const result = createOpnReadOnlyGraphVerificationResult({
    graph_id: 'graph-1', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1,
    task_id: 'task-1', plan_digest: digest('a'), source_evidence_ref: digest('b'),
    verification_evidence_ref: digest('c'), verifier_node_id: 'Agent2', status: 'passed',
  });
  assert.equal(result.schema, 'zj-loop.opn_read_only_graph_verification_result.v1');
  assert.equal(result.side_effects_executed, false);
  assert.deepEqual(validateOpnReadOnlyGraphVerificationResult(result), { status: 'valid' });
  assert.match(result.result_digest, /^sha256:[0-9a-f]{64}$/);
});

test('Graph verification result rejects source or plan drift', () => {
  const result = createOpnReadOnlyGraphVerificationResult({
    graph_id: 'graph-1', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1,
    task_id: 'task-1', plan_digest: digest('a'), source_evidence_ref: digest('b'),
    verification_evidence_ref: digest('c'), verifier_node_id: 'Agent2', status: 'passed',
  });
  assert.deepEqual(validateOpnReadOnlyGraphVerificationResult({ ...result, source_evidence_ref: digest('d') }), { status: 'blocked', reason: 'verification-result-digest-invalid' });
});
