import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEvidenceAccessAudit, evidenceAccessAuditDigest } from '../dist/evidence-access-audit.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const input = (overrides = {}) => ({ network_id: 'network-1', task_id: 'task-1', execution_id: 'execution-1', attempt: 1, actor: 'human-1', role: 'human', purpose: 'review', authorization_scope_digest: digest('a'), decision: 'allowed', returned_content_digest: digest('b'), occurred_at: '2026-08-01T12:00:00.000Z', state_revision: 4, ...overrides });

test('evidence access audit is metadata-only and deterministic', () => {
  const audit = buildEvidenceAccessAudit(input());
  assert.equal(audit.side_effects_executed, false);
  assert.match(evidenceAccessAuditDigest(audit), /^sha256:[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(audit), /token|secret|raw_content/i);
});

test('blocked evidence access never returns an artifact digest', () => {
  const audit = buildEvidenceAccessAudit(input({ decision: 'blocked', returned_content_digest: null }));
  assert.equal(audit.decision, 'blocked');
  assert.equal(audit.returned_content_digest, null);
});
