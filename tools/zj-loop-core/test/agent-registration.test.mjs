import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_REGISTRATION_SCHEMA,
  agentRegistrationDigest,
  createAgentRegistration,
  validateAgentRegistration,
} from '../dist/agent-registration.js';

const registration = (overrides = {}) => createAgentRegistration({
  agent_id: 'agent-1',
  display_name: 'Agent 1',
  capabilities: ['task.execute', 'evidence.write', 'task.execute'],
  accepted_task_kinds: ['loop.task'],
  evidence_kinds: ['result', 'diagnostic'],
  protocol_version: 'opn-agent-runtime.v1',
  identity_ref: 'node-identity-1',
  ...overrides,
});

test('Agent registration normalizes capabilities and binds a canonical digest', () => {
  const item = registration();
  assert.equal(item.schema, AGENT_REGISTRATION_SCHEMA);
  assert.deepEqual(item.capabilities, ['evidence.write', 'task.execute']);
  assert.deepEqual(item.evidence_kinds, ['diagnostic', 'result']);
  assert.match(item.registration_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(validateAgentRegistration(item).status, 'valid');
  assert.equal(item.registration_digest, agentRegistrationDigest(item));
});

test('Agent registration rejects provider-specific fields and invalid arrays', () => {
  const item = registration();
  assert.equal(validateAgentRegistration({ ...item, provider: 'codex' }).status, 'blocked');
  assert.equal(validateAgentRegistration({ ...item, capabilities: [] }).status, 'blocked');
  assert.equal(validateAgentRegistration({ ...item, accepted_task_kinds: [''] }).status, 'blocked');
  assert.equal(validateAgentRegistration({ ...item, registration_digest: 'sha256:' + '0'.repeat(64) }).status, 'blocked');
});

test('Agent registration rejects provider and runtime details in creation input', () => {
  assert.throws(() => createAgentRegistration({
    ...registration(),
    provider: 'workbuddy',
  }), { message: 'agent-registration-field-invalid' });
});
