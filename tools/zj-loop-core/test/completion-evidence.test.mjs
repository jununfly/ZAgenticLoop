import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCompletionEvidence } from '../dist/index.js';

const base = {
  schema: 'zj-loop.completion_evidence.v1',
  orchestration_id: 'orch_123',
  signal_id: 'sig_123',
  route_id: 'ci-sweeper',
  request_id: 'req_123',
  carrier: { kind: 'issue', id: '200', url: 'https://example.test/issues/200' },
  consumer_id: 'ci-sweeper',
  current_head_sha: 'abc123',
  status: 'planned',
  review_artifact: { kind: 'consumer-plan', path: 'consumer-plan.json', schema: 'zj-loop.consumer_run_plan.v1' },
  stop_reason: null,
  side_effects_executed: false,
  evidence_refs: [{ kind: 'route-decision', path: 'route-decision.json' }],
  resume_anchor: 'orch_123',
  provenance: {
    provider: 'gitlab',
    project: 'mlive-dev/ai-studio',
    pipeline_id: '10553918',
    job_id: '26131971',
    commit: 'abc123',
  },
};

test('completion evidence accepts a planned report-only result', () => {
  const result = validateCompletionEvidence(base, {
    expected: {
      orchestration_id: 'orch_123',
      signal_id: 'sig_123',
      route_id: 'ci-sweeper',
      request_id: 'req_123',
      consumer_id: 'ci-sweeper',
      current_head_sha: 'abc123',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.evidence?.schema, 'zj-loop.completion_evidence.v1');
  assert.equal(result.evidence?.side_effects_executed, false);
});

test('completion evidence rejects identity drift', () => {
  const result = validateCompletionEvidence({ ...base, request_id: 'req-other' }, {
    expected: { request_id: 'req_123' },
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('request_id mismatch: expected req_123, observed req-other'));
  assert.equal(result.status, 'hard_stop');
  assert.equal(result.side_effects_executed, false);
});

test('completion evidence rejects review completion without an artifact', () => {
  const result = validateCompletionEvidence({
    ...base,
    status: 'executed_to_review_artifact',
    review_artifact: null,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('review_artifact is required for executed_to_review_artifact'));
  assert.equal(result.status, 'hard_stop');
});

test('completion evidence rejects hard stops without a structured reason', () => {
  const result = validateCompletionEvidence({ ...base, status: 'hard_stopped' });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('stop_reason is required for hard_stopped'));
  assert.equal(result.status, 'hard_stop');
});

test('completion evidence rejects side effects unless explicitly allowed', () => {
  const result = validateCompletionEvidence({ ...base, side_effects_executed: true });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('side_effects_executed must be false in report-only validation'));
  assert.equal(result.status, 'hard_stop');
});

test('completion evidence allows an explicitly authorized side-effect result', () => {
  const result = validateCompletionEvidence({
    ...base,
    status: 'executed_to_review_artifact',
    side_effects_executed: true,
  }, { allowSideEffects: true });

  assert.equal(result.ok, true);
});

test('completion evidence rejects incomplete external provider provenance', () => {
  const result = validateCompletionEvidence({
    ...base,
    provenance: { provider: 'gitlab', project: 'mlive-dev/ai-studio', commit: 'abc123' },
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('provenance is incomplete'));
  assert.equal(result.status, 'hard_stop');
});

test('completion evidence accepts local provenance without external pipeline fields', () => {
  const result = validateCompletionEvidence({
    ...base,
    provenance: { provider: 'none', orchestration_id: 'orch_123' },
  });

  assert.equal(result.ok, true);
});

test('completion evidence accepts GitHub workflow/check provenance with the same contract', () => {
  const result = validateCompletionEvidence({
    ...base,
    provenance: {
      provider: 'github',
      repository: 'jununfly/ZAgenticLoop',
      workflow_id: '29852361562',
      check_id: '88531657108',
      head_sha: 'abc123',
    },
  });

  assert.equal(result.ok, true);
});
