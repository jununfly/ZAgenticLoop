import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildNativeOpnTracerConformanceReport, nativeOpnTracerConformanceReportDigest } from '../dist/native-opn-tracer-conformance.js';

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const validInput = () => ({
  fixture_version: '1-4-7.1',
  network_id: 'network-1',
  event_id: 'event-1',
  plan: { plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1') },
  center: { responsibility_unit: 'human+agent', human_id: 'human-1' },
  enrollments: [
    { node_id: 'agent-1', network_id: 'network-1', status: 'enrolled-active' },
    { node_id: 'agent-2', network_id: 'network-1', status: 'enrolled-active' },
  ],
  preflight: { status: 'execution-ready', plan_id: 'plan-1', plan_revision: 1, plan_digest: digest('1') },
  executions: [
    { node_id: 'agent-1', execution_id: 'execution-1', status: 'succeeded', execution_digest: digest('2') },
    { node_id: 'agent-2', execution_id: 'execution-2', status: 'succeeded', execution_digest: digest('3') },
  ],
  relay_receipts: [
    { node_id: 'agent-1', message_id: 'message-1', envelope_digest: digest('4'), status: 'recorded' },
    { node_id: 'agent-2', message_id: 'message-2', envelope_digest: digest('5'), status: 'recorded' },
  ],
  aggregation: { status: 'passed', aggregation_digest: digest('6') },
  verification: { status: 'passed', verification_digest: digest('7'), aggregation_digest: digest('6'), verifier_id: 'verifier-1' },
  review_handoff: { status: 'accepted', verification_digest: digest('7'), aggregation_digest: digest('6'), responsible_party: 'human-1' },
  created_at: '2026-07-31T12:00:00.000Z',
});

test('Native OPN Tracer conformance report passes only when all facts close the same Graph scope', () => {
  const report = buildNativeOpnTracerConformanceReport(validInput());
  assert.equal(report.status, 'passed');
  assert.equal(report.side_effects_executed, false);
  assert.equal(report.phases.length, 7);
  assert.match(nativeOpnTracerConformanceReportDigest(report), /^sha256:[0-9a-f]{64}$/);
});

test('Native OPN Tracer conformance report blocks scope drift or incomplete phases', () => {
  const input = validInput();
  input.preflight.plan_digest = digest('9');
  const report = buildNativeOpnTracerConformanceReport(input);
  assert.equal(report.status, 'blocked');
  assert.ok(report.blocking_reasons.includes('preflight-plan-binding-mismatch'));
  assert.equal(report.side_effects_executed, false);
});
