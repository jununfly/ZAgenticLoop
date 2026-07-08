import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLiveRunnerEvidence,
  buildLiveRunnerEvidenceComment,
  parseLiveRunnerEvidenceComments,
  validateLiveRunnerEvidence,
} from './live-runner-contract.mjs';

function validEvidence(overrides = {}) {
  return buildLiveRunnerEvidence({
    runner_id: 'ci-sweeper',
    route_id: 'ci-sweeper',
    consumer_kind: 'fix-runner',
    execution_mode: 'live',
    completion_form: 'repair-pr',
    status: 'completed',
    dedupe_key: 'source-run:123',
    created_at: '2026-07-08T00:00:00Z',
    source: {
      kind: 'issue-fix-request',
      id: 'ifr_123',
      url: 'https://github.com/jununfly/ZAgenticLoop/issues/18',
    },
    verifier_evidence: [
      { kind: 'command', command: 'bash scripts/ci-validate-gates.sh', status: 'passed' },
      { kind: 'command', command: 'bash scripts/ci-audit-gates.sh', status: 'passed' },
    ],
    side_effects: {
      executed: true,
      level: 'pr',
      actions: [
        { kind: 'pull-request', url: 'https://github.com/jununfly/ZAgenticLoop/pull/55' },
      ],
    },
    ...overrides,
  });
}

test('validates live fix-runner repair PR evidence', () => {
  const validation = validateLiveRunnerEvidence(validEvidence());

  assert.equal(validation.ok, true);
});

test('validates draft cleanup and activation completion forms by consumer kind', () => {
  assert.equal(validateLiveRunnerEvidence(validEvidence({
    runner_id: 'changelog-drafter',
    route_id: 'changelog-drafter-draft-request',
    consumer_kind: 'draft-consumer',
    completion_form: 'draft-evidence',
    side_effects: { executed: true, level: 'evidence', actions: [{ kind: 'draft-evidence' }] },
  })).ok, true);

  assert.equal(validateLiveRunnerEvidence(validEvidence({
    runner_id: 'post-merge-cleanup',
    route_id: 'post-merge-roadmap-closeout',
    consumer_kind: 'cleanup-consumer',
    completion_form: 'cleanup-skipped',
    status: 'skipped',
    side_effects: { executed: false, level: 'cleanup', actions: [] },
  })).ok, true);

  assert.equal(validateLiveRunnerEvidence(validEvidence({
    runner_id: 'roadmap-sliced-development',
    route_id: 'roadmap-sliced-development',
    consumer_kind: 'activation-consumer',
    completion_form: 'activation-failed',
    status: 'failed',
    side_effects: { executed: false, level: 'branch', actions: [] },
  })).ok, true);

  assert.equal(validateLiveRunnerEvidence(validEvidence({
    runner_id: 'issue-triage-action',
    route_id: 'issue-triage-action',
    consumer_kind: 'triage-action-consumer',
    execution_mode: 'dry-run',
    completion_form: 'triage-label-applied',
    side_effects: {
      executed: false,
      level: 'label',
      actions: [{ kind: 'label', label: 'needs-info', mode: 'dry-run' }],
    },
  })).ok, true);
});

test('rejects mismatched completion forms and statuses', () => {
  const wrongKind = validateLiveRunnerEvidence(validEvidence({
    consumer_kind: 'draft-consumer',
    completion_form: 'repair-pr',
  }));
  const wrongStatus = validateLiveRunnerEvidence(validEvidence({
    completion_form: 'escalation-issue',
    status: 'completed',
  }));

  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.errors.join('\n'), /draft-consumer cannot use completion_form repair-pr/);
  assert.equal(wrongStatus.ok, false);
  assert.match(wrongStatus.errors.join('\n'), /escalation-issue completion_form requires status escalated/);
});

test('requires source verifier evidence and side effect shape', () => {
  const validation = validateLiveRunnerEvidence(validEvidence({
    source: { kind: 'issue-fix-request' },
    verifier_evidence: [],
    side_effects: { executed: 'yes', level: 'magic' },
  }));

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /source.kind and source.id are required/);
  assert.match(validation.errors.join('\n'), /verifier_evidence must be a non-empty array/);
  assert.match(validation.errors.join('\n'), /side_effects.executed must be boolean/);
  assert.match(validation.errors.join('\n'), /unsupported side_effects.level magic/);
  assert.match(validation.errors.join('\n'), /side_effects.actions must be an array/);
});

test('round-trips live runner evidence comments', () => {
  const evidence = validEvidence();
  const body = buildLiveRunnerEvidenceComment(evidence);
  const parsed = parseLiveRunnerEvidenceComments([{ id: 1, body }]);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].validation.ok, true);
  assert.equal(parsed[0].evidence.route_id, 'ci-sweeper');
});
