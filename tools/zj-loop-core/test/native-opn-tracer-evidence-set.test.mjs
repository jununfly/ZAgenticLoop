import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildNativeOpnTracerEvidenceSet, nativeOpnTracerEvidenceSetDigest } from '../dist/native-opn-tracer-evidence-set.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const validInput = () => ({
  fixture_version: '1-4-9.1', network_id: 'network-1', event_id: 'event-1', plan: { plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1') },
  center: { responsibility_unit: 'human+agent', human_id: 'human-1' },
  conformance_report: { status: 'passed', report_digest: digest('2'), network_id: 'network-1', event_id: 'event-1', plan: { plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1') } },
  semantic_review: { status: 'passed', review_digest: digest('a'), intent_digest: digest('3'), aggregation_digest: digest('4'), verification_digest: digest('5'), review_handoff_digest: digest('6') },
  evidence_refs: [
    { kind: 'execution', artifact_id: 'artifact-1', content_sha256: digest('7') },
    { kind: 'aggregation', artifact_id: 'artifact-2', content_sha256: digest('8') },
    { kind: 'verification', artifact_id: 'artifact-3', content_sha256: digest('9') },
  ],
  relay: { receipt_count: 2, message_ids: ['message-1', 'message-2'], duplicate_message_ids: [], conflict_message_ids: [], out_of_order: false },
  created_at: '2026-07-31T12:00:00.000Z',
});

test('Evidence Set is a deterministic report over the complete Graph scope', () => {
  const report = buildNativeOpnTracerEvidenceSet(validInput());
  assert.equal(report.status, 'passed');
  assert.equal(report.side_effects_executed, false);
  assert.match(nativeOpnTracerEvidenceSetDigest(report), /^sha256:[0-9a-f]{64}$/);
});

test('Evidence Set fails closed on relay conflict, duplicate, ordering, or scope drift', () => {
  const input = validInput();
  input.relay.duplicate_message_ids = ['message-1'];
  input.relay.conflict_message_ids = ['message-2'];
  input.relay.out_of_order = true;
  input.conformance_report.plan.plan_digest = digest('9');
  const report = buildNativeOpnTracerEvidenceSet(input);
  assert.equal(report.status, 'blocked');
  assert.ok(report.blocking_reasons.includes('relay-delivery-not-converged'));
  assert.ok(report.blocking_reasons.includes('conformance-scope-mismatch'));
  assert.equal(report.side_effects_executed, false);
});
