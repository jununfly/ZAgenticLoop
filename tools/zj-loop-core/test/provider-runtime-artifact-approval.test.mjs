import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { createProviderRuntimeArtifactApproval, validateProviderRuntimeArtifactApproval } from '../dist/provider-runtime-artifact-approval.js';

const manifest = {
  artifact_id: 'runtime-dev-1',
  manifest_digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  profile: 'development-local',
  platform: 'darwin',
};

async function approvalFixture(overrides = {}) {
  const signer = await createInMemoryHumanSigner({ human_id: 'human-81' });
  const approval = await createProviderRuntimeArtifactApproval({ signer, network_id: 'network-1', node_id: 'node-1', device_id: 'device-1', manifest, approval_id: 'approval-1', revision: 1, issued_at: '2026-08-06T12:00:00.000Z', expires_at: '2026-09-06T12:00:00.000Z', ...overrides });
  return { signer, approval };
}

test('artifact approval is created and verified through the HumanSigner contract', async () => {
  const { signer, approval } = await approvalFixture();
  const identity = await signer.getPublicIdentity();
  const result = validateProviderRuntimeArtifactApproval({ approval, identity, now: '2026-08-07T12:00:00.000Z', expected: { network_id: 'network-1', node_id: 'node-1', device_id: 'device-1', manifest } });
  assert.equal(result.status, 'valid');
  assert.equal(approval.side_effects_executed, false);
  assert.equal(approval.signature.algorithm, 'ECDSA-P256');
  assert.equal(approval.canonicalization_profile, 'provider-runtime-artifact-approval-v1-2026-08');
});

test('artifact approval rejects signature, manifest, device, and signer drift', async () => {
  const { signer, approval } = await approvalFixture();
  const identity = await signer.getPublicIdentity();
  assert.equal(validateProviderRuntimeArtifactApproval({ approval: { ...approval, signature: { ...approval.signature, signature_base64: Buffer.from('tampered').toString('base64') } }, identity, expected: { network_id: 'network-1', node_id: 'node-1', device_id: 'device-1', manifest } }).status, 'blocked');
  assert.equal(validateProviderRuntimeArtifactApproval({ approval, identity, expected: { network_id: 'network-1', node_id: 'node-1', device_id: 'device-2', manifest } }).reason, 'artifact-approval-context-mismatch');
  assert.equal(validateProviderRuntimeArtifactApproval({ approval, identity, expected: { network_id: 'network-1', node_id: 'node-1', device_id: 'device-1', manifest: { ...manifest, manifest_digest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } } }).reason, 'artifact-approval-manifest-mismatch');
  const other = await createInMemoryHumanSigner({ human_id: 'human-82' });
  assert.equal(validateProviderRuntimeArtifactApproval({ approval, identity: await other.getPublicIdentity(), expected: { network_id: 'network-1', node_id: 'node-1', device_id: 'device-1', manifest } }).reason, 'artifact-approval-human-identity-mismatch');
});

test('artifact approval is time-bounded and cannot authorize side effects', async () => {
  const { signer, approval } = await approvalFixture();
  const identity = await signer.getPublicIdentity();
  assert.equal(validateProviderRuntimeArtifactApproval({ approval, identity, now: '2026-09-06T12:00:00.000Z', expected: { network_id: 'network-1', node_id: 'node-1', device_id: 'device-1', manifest } }).reason, 'artifact-approval-expired');
  assert.equal(validateProviderRuntimeArtifactApproval({ approval, identity, now: '2026-08-01T12:00:00.000Z', expected: { network_id: 'network-1', node_id: 'node-1', device_id: 'device-1', manifest } }).reason, 'artifact-approval-issued-in-future');
  assert.equal(validateProviderRuntimeArtifactApproval({ approval: { ...approval, side_effects_executed: true }, identity, expected: { network_id: 'network-1', node_id: 'node-1', device_id: 'device-1', manifest } }).reason, 'artifact-approval-safety-boundary-invalid');
});
