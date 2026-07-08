import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLiveRunnerEvidence,
  buildLiveRunnerEvidenceComment,
  parseLiveRunnerEvidenceComments,
  validateLiveRunnerEvidence,
} from '../dist/index.js';

function validEvidence(overrides = {}) {
  return buildLiveRunnerEvidence({
    runner_id: 'ci-sweeper',
    route_id: 'ci-sweeper',
    consumer_kind: 'fix-runner',
    execution_mode: 'live',
    completion_form: 'repair-pr',
    status: 'completed',
    dedupe_key: 'ci:run:123',
    created_at: '2026-07-09T00:00:00Z',
    source: { kind: 'issue-fix-request', id: 'ifr_123', url: 'https://example.test/issues/1' },
    verifier_evidence: [{ name: 'ci-validate-gates', status: 'passed' }],
    side_effects: { executed: true, level: 'pr', actions: [{ kind: 'pull-request', url: 'https://example.test/pr/2' }] },
    ...overrides,
  });
}

test('live runner evidence validates completion forms by consumer kind', () => {
  assert.equal(validateLiveRunnerEvidence(validEvidence()).ok, true);

  const invalid = validateLiveRunnerEvidence(validEvidence({
    consumer_kind: 'report-consumer',
    completion_form: 'repair-pr',
  }));
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join('\n'), /unsupported consumer_kind report-consumer/);

  const wrongStatus = validateLiveRunnerEvidence(validEvidence({
    completion_form: 'escalation-issue',
    status: 'completed',
  }));
  assert.equal(wrongStatus.ok, false);
  assert.match(wrongStatus.errors.join('\n'), /escalation-issue completion_form requires status escalated/);
});

test('live runner evidence comment roundtrips structured JSON', () => {
  const evidence = validEvidence();
  const body = buildLiveRunnerEvidenceComment(evidence);
  const parsed = parseLiveRunnerEvidenceComments([{ id: 'c1', author: 'bot', createdAt: '2026-07-09T00:00:00Z', body }]);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].commentId, 'c1');
  assert.equal(parsed[0].validation.ok, true);
  assert.deepEqual(parsed[0].evidence, evidence);
});

test('live runner evidence comments report invalid JSON', () => {
  const parsed = parseLiveRunnerEvidenceComments([{
    id: 'bad',
    body: '<!-- zj-loop:live-runner-evidence\n{ nope\n-->',
  }]);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].evidence, null);
  assert.equal(parsed[0].validation.ok, false);
  assert.match(parsed[0].validation.errors.join('\n'), /invalid-json/);
});
