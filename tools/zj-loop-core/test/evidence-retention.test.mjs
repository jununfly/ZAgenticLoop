import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEvidenceRetentionDryRun, evidenceRetentionDryRunDigest } from '../dist/evidence-retention.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const item = (overrides = {}) => ({ artifact_id: digest('a'), network_id: 'network-1', task_id: 'task-1', execution_id: 'execution-1', attempt: 1, artifact_digest: digest('a'), created_at: '2026-07-01T12:00:00.000Z', review_status: 'accepted', lifecycle_digest: digest('b'), retained_until: '2026-07-15T12:00:00.000Z', ...overrides });

test('evidence retention dry-run is deterministic and read-only', () => {
  const input = { policy: { version: 'retention-1', purpose: 'retention-dry-run', network_id: 'network-1', task_ids: ['task-1'], scope_digest: digest('d'), state_revision: 2, policy_digest: digest('e'), effective_at: '2026-07-01T00:00:00.000Z', expires_at: '2026-12-31T00:00:00.000Z' }, now: '2026-08-01T12:00:00.000Z', items: [item()] };
  const report = buildEvidenceRetentionDryRun(input);
  assert.equal(report.status, 'passed');
  assert.equal(report.side_effects_executed, false);
  assert.equal(report.items[0].decision, 'eligible');
  assert.equal(evidenceRetentionDryRunDigest(report), evidenceRetentionDryRunDigest(buildEvidenceRetentionDryRun(input)));
});

test('evidence retention blocks unreviewed or tampered evidence and marks future items not-due', () => {
  const report = buildEvidenceRetentionDryRun({ policy: { version: 'retention-1', purpose: 'retention-dry-run', network_id: 'network-1', task_ids: ['task-1'], scope_digest: digest('d'), state_revision: 2, policy_digest: digest('e'), effective_at: '2026-07-01T00:00:00.000Z', expires_at: '2026-12-31T00:00:00.000Z' }, now: '2026-08-01T12:00:00.000Z', items: [item({ review_status: 'pending' }), item({ artifact_digest: digest('c') }), item({ retained_until: '2026-09-01T12:00:00.000Z' })] });
  const scopeReport = buildEvidenceRetentionDryRun({ policy: { version: 'retention-1', purpose: 'retention-dry-run', network_id: 'network-1', task_ids: ['task-1'], scope_digest: digest('d'), state_revision: 2, policy_digest: digest('e'), effective_at: '2026-07-01T00:00:00.000Z', expires_at: '2026-12-31T00:00:00.000Z' }, now: '2026-08-01T12:00:00.000Z', items: [item({ network_id: 'network-2' }), item({ task_id: 'task-2' })] });
  assert.equal(scopeReport.items[0].reason, 'retention-policy-scope-mismatch');
  assert.equal(scopeReport.items[1].reason, 'retention-policy-scope-mismatch');
  assert.equal(report.status, 'blocked');
  assert.equal(report.items[0].decision, 'blocked');
  assert.equal(report.items[1].decision, 'blocked');
  assert.equal(report.items[2].decision, 'not-due');
});
