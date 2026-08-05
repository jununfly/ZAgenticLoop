import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REAL_AGENT_DOGFOOD_DIGEST_PROFILE,
  realAgentDogfoodCoordinatorLeaseDigest,
  realAgentDogfoodExecutionBindingDigest,
} from '../dist/real-agent-dogfood-digests.js';

const base = {
  plan_definition_digest: 'sha256:' + 'a'.repeat(64),
  execution_id: 'execution-1',
  attempt: 1,
  human_approval_digest: 'sha256:' + 'b'.repeat(64),
  provider_id: 'provider-1',
  adapter_contract_digest: 'sha256:' + 'c'.repeat(64),
  resource_scope: ['repo:branch-a'],
  network_policy: 'network-allowed',
  timeout_ms: 60_000,
  runtime_identity_digest: 'sha256:' + 'd'.repeat(64),
};

test('execution binding digest changes for execution, approval, or runtime drift', () => {
  const first = realAgentDogfoodExecutionBindingDigest(base);
  assert.match(first, /^sha256:[0-9a-f]{64}$/);
  assert.equal(REAL_AGENT_DOGFOOD_DIGEST_PROFILE, 'zj-loop.real-agent-dogfood-digest.v1');
  assert.notEqual(first, realAgentDogfoodExecutionBindingDigest({ ...base, execution_id: 'execution-2', attempt: 2 }));
  assert.notEqual(first, realAgentDogfoodExecutionBindingDigest({ ...base, human_approval_digest: 'sha256:' + 'e'.repeat(64) }));
  assert.notEqual(first, realAgentDogfoodExecutionBindingDigest({ ...base, runtime_identity_digest: 'sha256:' + 'f'.repeat(64) }));
});

test('Coordinator lease digest is separate and binds the lease event to execution binding', () => {
  const executionBindingDigest = realAgentDogfoodExecutionBindingDigest(base);
  const first = realAgentDogfoodCoordinatorLeaseDigest({ execution_binding_digest: executionBindingDigest, execution_id: base.execution_id, session_id: 'session-1', lease_id: 'lease-1', human_id: 'human-1', coordinator_id: 'coordinator-1', expires_at: '2026-08-01T12:05:00.000Z' });
  assert.match(first, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(first, realAgentDogfoodCoordinatorLeaseDigest({ execution_binding_digest: executionBindingDigest, execution_id: base.execution_id, session_id: 'session-1', lease_id: 'lease-2', human_id: 'human-1', coordinator_id: 'coordinator-1', expires_at: '2026-08-01T12:05:00.000Z' }));
});
