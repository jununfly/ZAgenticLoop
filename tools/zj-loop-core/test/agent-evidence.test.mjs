import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeAgentEvidence, validateNativeAgentEvidence } from '../dist/agent-evidence.js';
import { createAgentReviewHandoff, validateAgentReviewHandoff } from '../dist/agent-review-handoff.js';

const evidence = () => createNativeAgentEvidence({
  evidence_id: 'evidence-1', execution_id: 'exec-1', task_id: 'task-1', attempt: 1, agent_id: 'agent-1', kind: 'result',
  artifact_ref: 'sha256:' + '1'.repeat(64), content_sha256: 'sha256:' + '2'.repeat(64), success_criteria: ['result exists'],
  observed_at: '2026-08-01T00:00:02.000Z', status: 'passed',
});

test('Agent Evidence is execution-bound, digest-bound, and provider-neutral', () => {
  const item = evidence();
  assert.equal(validateNativeAgentEvidence(item).status, 'valid');
  assert.equal(item.side_effects_executed, false);
  assert.equal(validateNativeAgentEvidence({ ...item, provider: 'codex' }).status, 'blocked');
  assert.equal(validateNativeAgentEvidence({ ...item, execution_id: 'exec-2' }).status, 'blocked');
});

test('Agent Review Handoff is a pending proposal and cannot claim Human acceptance', () => {
  const item = createAgentReviewHandoff({
    execution_id: 'exec-1', task_id: 'task-1', attempt: 1, agent_id: 'agent-1', evidence_refs: [evidence().evidence_digest],
    recommendation: 'needs-more-work', recommendation_reason: 'verification remains external', risks: ['human review required'],
  });
  assert.equal(item.status, 'review-pending');
  assert.equal(validateAgentReviewHandoff(item).status, 'valid');
  assert.equal(validateAgentReviewHandoff({ ...item, status: 'accepted' }).status, 'blocked');
});
