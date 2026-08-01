import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateAgentDogfoodConformance,
  createAgentDogfoodFixture,
  agentDogfoodConformanceDigest,
} from '../dist/agent-dogfood-conformance.js';

test('agent dogfood conformance passes only when the provider-neutral chain is closed', () => {
  const report = evaluateAgentDogfoodConformance(createAgentDogfoodFixture());

  assert.equal(report.status, 'passed');
  assert.equal(report.side_effects_executed, false);
  assert.equal(report.provider.provider_id, 'fixture-agent');
  assert.deepEqual(report.blocking_reasons, []);
  assert.match(agentDogfoodConformanceDigest(report), /^sha256:[0-9a-f]{64}$/);
});

test('agent dogfood blocks when environment proof is missing', () => {
  const fixture = createAgentDogfoodFixture();
  fixture.environment.network_denied.status = 'blocked';
  const report = evaluateAgentDogfoodConformance(fixture);

  assert.equal(report.status, 'blocked');
  assert.ok(report.blocking_reasons.includes('network-denied-proof-missing'));
  assert.equal(report.side_effects_executed, false);
});

test('agent dogfood rejects environment claims made by the Agent itself', () => {
  const fixture = createAgentDogfoodFixture();
  fixture.environment.proof_source = 'agent-self-report';
  const report = evaluateAgentDogfoodConformance(fixture);

  assert.equal(report.status, 'blocked');
  assert.ok(report.blocking_reasons.includes('environment-proof-not-trusted'));
});

test('agent dogfood blocks a trusted proof with drifted execution binding or expiry', () => {
  const fixture = createAgentDogfoodFixture();
  fixture.environment.trusted_runner.execution_id = 'other-execution';
  const drifted = evaluateAgentDogfoodConformance(fixture);
  assert.ok(drifted.blocking_reasons.includes('trusted-environment-proof-binding-mismatch'));

  const expiredFixture = createAgentDogfoodFixture();
  expiredFixture.environment.trusted_runner.expires_at = '2026-07-31T12:00:00.000Z';
  const expired = evaluateAgentDogfoodConformance(expiredFixture);
  assert.ok(expired.blocking_reasons.includes('trusted-environment-proof-expired'));
});

test('agent dogfood rejects a proof digest without a valid trusted-runner signature', () => {
  const fixture = createAgentDogfoodFixture();
  fixture.environment.trusted_runner.signature.signature_base64 = Buffer.from('tampered').toString('base64');
  const report = evaluateAgentDogfoodConformance(fixture);

  assert.equal(report.status, 'blocked');
  assert.ok(report.blocking_reasons.includes('trusted-environment-proof-signature-invalid'));
});

test('agent dogfood requires an active pre-registered runner identity', () => {
  const unregistered = createAgentDogfoodFixture();
  unregistered.trusted_runner_registry = [];
  const unregisteredReport = evaluateAgentDogfoodConformance(unregistered);
  assert.ok(unregisteredReport.blocking_reasons.includes('trusted-runner-not-registered'));

  const revoked = createAgentDogfoodFixture();
  revoked.trusted_runner_registry[0].status = 'revoked';
  const revokedReport = evaluateAgentDogfoodConformance(revoked);
  assert.ok(revokedReport.blocking_reasons.includes('trusted-runner-not-active'));
});

test('agent dogfood blocks trusted runner registry snapshot drift', () => {
  const fixture = createAgentDogfoodFixture();
  fixture.registry_snapshot.digest = 'sha256:' + 'f'.repeat(64);
  const report = evaluateAgentDogfoodConformance(fixture);
  assert.equal(report.status, 'blocked');
  assert.ok(report.blocking_reasons.includes('trusted-runner-registry-snapshot-drift'));
});

test('agent dogfood requires the trusted proof to be pre-launch', () => {
  const fixture = createAgentDogfoodFixture();
  fixture.environment.proof_stage = 'post-launch';
  const report = evaluateAgentDogfoodConformance(fixture);
  assert.equal(report.status, 'blocked');
  assert.ok(report.blocking_reasons.includes('trusted-environment-proof-stage-invalid'));
});

test('agent dogfood rejects a same-process trusted runner', () => {
  const fixture = createAgentDogfoodFixture();
  fixture.environment.runner_isolation = 'same-process';
  const report = evaluateAgentDogfoodConformance(fixture);
  assert.equal(report.status, 'blocked');
  assert.ok(report.blocking_reasons.includes('trusted-runner-isolation-invalid'));
});

test('agent dogfood rejects an unsigned post-run observation bundle', () => {
  const fixture = createAgentDogfoodFixture();
  fixture.post_run_observation.signature.signature_base64 = Buffer.from('tampered').toString('base64');
  const report = evaluateAgentDogfoodConformance(fixture);
  assert.equal(report.status, 'blocked');
  assert.ok(report.blocking_reasons.includes('post-run-observation-signature-invalid'));
});

test('agent dogfood requires a trusted process boundary for the full descendant tree', () => {
  const fixture = createAgentDogfoodFixture();
  fixture.post_run_observation.process_boundary.all_descendants_terminated = false;
  const report = evaluateAgentDogfoodConformance(fixture);

  assert.equal(report.status, 'blocked');
  assert.ok(report.blocking_reasons.includes('process-boundary-invalid'));
});

test('agent dogfood fails closed for orphaned or unknown descendants', () => {
  const orphaned = createAgentDogfoodFixture();
  orphaned.post_run_observation.process_boundary.orphan_processes_detected = true;
  const orphanedReport = evaluateAgentDogfoodConformance(orphaned);
  assert.ok(orphanedReport.blocking_reasons.includes('process-boundary-invalid'));

  const unknown = createAgentDogfoodFixture();
  unknown.post_run_observation.process_boundary.unknown_descendants_detected = true;
  const unknownReport = evaluateAgentDogfoodConformance(unknown);
  assert.ok(unknownReport.blocking_reasons.includes('process-boundary-invalid'));
});

test('agent dogfood blocks unknown post-run network, credential, or side-effect state', () => {
  const fixture = createAgentDogfoodFixture();
  fixture.post_run_observation.after_network_denied = false;
  const report = evaluateAgentDogfoodConformance(fixture);
  assert.equal(report.status, 'blocked');
  assert.ok(report.blocking_reasons.includes('post-run-safety-observation-invalid'));
});

test('agent dogfood blocks credential inheritance, dirty worktrees, and scope drift', () => {
  const fixture = createAgentDogfoodFixture();
  fixture.environment.credentials.status = 'blocked';
  fixture.worktree.after_clean = false;
  fixture.execution.preflight_digest = 'sha256:' + 'f'.repeat(64);
  const report = evaluateAgentDogfoodConformance(fixture);

  assert.equal(report.status, 'blocked');
  assert.deepEqual(report.blocking_reasons, [
    'credential-inheritance-detected',
    'execution-preflight-drift',
    'post-run-observation-signature-invalid',
    'trusted-environment-proof-binding-mismatch',
    'worktree-not-clean-after-execution',
  ]);
});

test('agent dogfood blocks uncertain process outcomes and unaccepted review', () => {
  const fixture = createAgentDogfoodFixture();
  fixture.execution.process_status = 'timed-out';
  fixture.review.decision = 'pending';
  const report = evaluateAgentDogfoodConformance(fixture);

  assert.equal(report.status, 'blocked');
  assert.ok(report.blocking_reasons.includes('execution-outcome-uncertain'));
  assert.ok(report.blocking_reasons.includes('human-review-not-accepted'));
});
