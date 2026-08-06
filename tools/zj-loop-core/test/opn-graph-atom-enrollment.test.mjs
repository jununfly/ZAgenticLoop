import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentRegistration } from '../dist/agent-registration.js';
import { createOpnGraphAtomEnrollmentSnapshot, validateOpnGraphAtomEnrollmentSnapshot } from '../dist/opn-graph-atom-enrollment.js';

const registration = (agent_id, identity_ref = agent_id) => createAgentRegistration({ agent_id, display_name: agent_id, capabilities: ['read'], accepted_task_kinds: ['inspect'], evidence_kinds: ['report'], protocol_version: 'agent-v1', identity_ref });
const enrolled = (node_id, registration_value, device_id = 'device-1') => ({ node_id, device_id, network_id: 'network-1', status: 'approved', capability_ceiling: ['read'], registration: registration_value });

test('Graph Atom enrollment binds two provider-neutral Agents to one device and a Human+Agent center', () => {
  const snapshot = createOpnGraphAtomEnrollmentSnapshot({ graph_id: 'graph-1', network_id: 'network-1', device_id: 'device-1', center: { responsibility_unit: 'human+agent', human_id: 'human-1', center_agent_id: 'Agent1' }, agents: [enrolled('Agent1', registration('Agent1')), enrolled('Agent2', registration('Agent2'))] });
  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.center.responsibility_unit, 'human+agent');
  assert.equal(snapshot.agents.length, 2);
  assert.match(snapshot.snapshot_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(validateOpnGraphAtomEnrollmentSnapshot(snapshot).status, 'valid');
});

test('Graph Atom enrollment blocks an Agent-only center, device drift, and unapproved nodes', () => {
  assert.throws(() => createOpnGraphAtomEnrollmentSnapshot({ graph_id: 'graph-1', network_id: 'network-1', device_id: 'device-1', center: { responsibility_unit: 'agent', human_id: 'human-1', center_agent_id: 'Agent1' }, agents: [enrolled('Agent1', registration('Agent1')), enrolled('Agent2', registration('Agent2'))] }), /center-responsibility-invalid/);
  assert.throws(() => createOpnGraphAtomEnrollmentSnapshot({ graph_id: 'graph-1', network_id: 'network-1', device_id: 'device-1', center: { responsibility_unit: 'human', human_id: 'human-1' }, agents: [enrolled('Agent1', registration('Agent1'), 'device-2'), enrolled('Agent2', registration('Agent2'))] }), /agent-device-mismatch/);
  assert.throws(() => createOpnGraphAtomEnrollmentSnapshot({ graph_id: 'graph-1', network_id: 'network-1', device_id: 'device-1', center: { responsibility_unit: 'human', human_id: 'human-1' }, agents: [enrolled('Agent1', registration('Agent1')), { ...enrolled('Agent2', registration('Agent2')), status: 'pending' }] }), /agent-enrollment-not-approved/);
});

test('Graph Atom enrollment rejects registration identity drift and tampered snapshot digest', () => {
  const snapshot = createOpnGraphAtomEnrollmentSnapshot({ graph_id: 'graph-1', network_id: 'network-1', device_id: 'device-1', center: { responsibility_unit: 'human', human_id: 'human-1' }, agents: [enrolled('Agent1', registration('Agent1')), enrolled('Agent2', registration('Agent2'))] });
  assert.equal(validateOpnGraphAtomEnrollmentSnapshot({ ...snapshot, agents: [{ ...snapshot.agents[0], registration_digest: 'sha256:' + 'f'.repeat(64) }, snapshot.agents[1]] }).reason, 'agent-registration-digest-mismatch');
  assert.equal(validateOpnGraphAtomEnrollmentSnapshot({ ...snapshot, snapshot_digest: 'sha256:' + 'f'.repeat(64) }).reason, 'graph-atom-enrollment-digest-invalid');
});
