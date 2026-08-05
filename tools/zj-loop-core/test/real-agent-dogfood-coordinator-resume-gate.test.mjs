import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateRealAgentDogfoodCoordinatorResumeGate } from '../dist/real-agent-dogfood-coordinator-resume-gate.js';

const digest = 'sha256:' + 'a'.repeat(64);
const lease = { status: 'reused', execution_id: 'execution-1', execution_binding_digest: digest, coordinator_lease_digest: 'sha256:' + 'b'.repeat(64), expires_at: '2026-08-01T12:01:00.000Z' };

test('Coordinator resume gate fails closed without an active matching lease', () => {
  assert.deepEqual(evaluateRealAgentDogfoodCoordinatorResumeGate({ execution_id: 'execution-1', execution_binding_digest: digest, lease: { status: 'blocked', reason: 'coordinator-lease-mismatch' }, phase: null, next_phase: 'source_execution', now: '2026-08-01T12:00:00.000Z' }), { schema: 'zj-loop.real_agent_dogfood_coordinator_resume_gate.v1', status: 'blocked', reason: 'coordinator-lease-required' });
  assert.deepEqual(evaluateRealAgentDogfoodCoordinatorResumeGate({ execution_id: 'execution-1', execution_binding_digest: 'sha256:' + 'c'.repeat(64), lease, phase: null, next_phase: 'source_execution', now: '2026-08-01T12:00:00.000Z' }), { schema: 'zj-loop.real_agent_dogfood_coordinator_resume_gate.v1', status: 'blocked', reason: 'coordinator-lease-binding-mismatch' });
});

test('Coordinator resume gate permits the first phase with a live lease and blocks failed or legacy phase evidence', () => {
  const first = evaluateRealAgentDogfoodCoordinatorResumeGate({ execution_id: 'execution-1', execution_binding_digest: digest, lease, phase: null, next_phase: 'source_execution', now: '2026-08-01T12:00:00.000Z' });
  assert.equal(first.status, 'ready');
  assert.equal(first.next_phase, 'source_execution');
  assert.equal(evaluateRealAgentDogfoodCoordinatorResumeGate({ execution_id: 'execution-1', execution_binding_digest: digest, lease, phase: { status: 'blocked' }, next_phase: 'scope_observation', now: '2026-08-01T12:00:00.000Z' }).reason, 'graph-phase-not-passed');
  assert.equal(evaluateRealAgentDogfoodCoordinatorResumeGate({ execution_id: 'execution-1', execution_binding_digest: digest, lease, phase: { status: 'passed' }, next_phase: 'scope_observation', now: '2026-08-01T12:00:00.000Z' }).reason, 'graph-phase-actor-binding-required');
});

test('Coordinator resume gate rejects an expired lease before any phase side effect', () => {
  assert.equal(evaluateRealAgentDogfoodCoordinatorResumeGate({ execution_id: 'execution-1', execution_binding_digest: digest, lease: { ...lease, expires_at: '2026-08-01T12:00:00.000Z' }, phase: null, next_phase: 'source_execution', now: '2026-08-01T12:00:00.001Z' }).reason, 'coordinator-lease-expired');
});
