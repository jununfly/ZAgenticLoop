import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  BOOTSTRAP_CHANNEL_ROLES,
  BOOTSTRAP_INITIAL_LIFECYCLE,
  BOOTSTRAP_PROTOCOL_PROFILE,
  BOOTSTRAP_REASON_DESCRIPTORS,
  bootstrapProfileSha256,
  createBootstrapBinding,
  createBootstrapTransportFixture,
  decodeBootstrapFrame,
  encodeBootstrapFrame,
  advanceBootstrapLifecycle,
  getBootstrapReasonDescriptor,
} from '../dist/bootstrap-protocol.js';
import { bootstrapProfileSha256 as registryBootstrapProfileSha256, orchestrationPlanProfileSha256 } from '../dist/protocol-registry.js';

const identity = {
  schema: 'zj-loop.worker_identity_facts.v1',
  platform: 'darwin',
  kind: 'process-audit',
  executable_digest: 'sha256:' + 'a'.repeat(64),
  signer_digest: 'sha256:' + 'b'.repeat(64),
};

const execution = {
  network_id: 'network-1',
  execution_id: 'execution-1',
  attempt: 1,
  provider_id: 'agent-1',
  execution_binding_nonce: 'n'.repeat(32),
};

test('bootstrap profile has an independent stable digest', () => {
  assert.equal(BOOTSTRAP_PROTOCOL_PROFILE.schema, 'zj-loop.bootstrap_protocol_profile.v1');
  assert.deepEqual(BOOTSTRAP_CHANNEL_ROLES, ['secret', 'identity-binding', 'status']);
  assert.match(bootstrapProfileSha256(), /^sha256:[0-9a-f]{64}$/);
  assert.equal(registryBootstrapProfileSha256(), bootstrapProfileSha256());
  assert.notEqual(orchestrationPlanProfileSha256(), bootstrapProfileSha256());
});

test('createBootstrapBinding separates identity and execution digests', () => {
  const binding = createBootstrapBinding({ identity, execution });
  assert.equal(binding.identity_facts, undefined);
  assert.equal(binding.execution_context, undefined);
  assert.equal(binding.execution_binding_nonce, 'n'.repeat(32));
  assert.match(binding.identity_digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(binding.execution_binding_digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(binding.binding_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(binding.bootstrap_profile_sha256, bootstrapProfileSha256());
  assert.deepEqual(binding, createBootstrapBinding({ identity, execution }));
});

test('bootstrap framing is bounded, canonical and one frame per buffer', () => {
  const frame = encodeBootstrapFrame({
    schema: 'zj-loop.bootstrap_frame.v1',
    channel_role: 'identity-binding',
    payload: { z: 1, a: 'stable' },
  });
  assert.equal(new DataView(frame.buffer, frame.byteOffset, 4).getUint32(0), frame.byteLength - 4);
  const decoded = decodeBootstrapFrame(frame);
  assert.equal(decoded.schema, 'zj-loop.bootstrap_frame.v1');
  assert.equal(decoded.channel_role, 'identity-binding');
  assert.deepEqual({ ...decoded.payload }, { a: 'stable', z: 1 });
  assert.throws(() => decodeBootstrapFrame(new Uint8Array([...frame, ...frame])), /bootstrap-frame-multiple/);
  const nonCanonical = new TextEncoder().encode('{"schema":"zj-loop.bootstrap_frame.v1","channel_role":"identity-binding","payload":{"z":1,"a":"stable"}}');
  const nonCanonicalFrame = new Uint8Array(4 + nonCanonical.byteLength);
  new DataView(nonCanonicalFrame.buffer).setUint32(0, nonCanonical.byteLength);
  nonCanonicalFrame.set(nonCanonical, 4);
  assert.throws(() => decodeBootstrapFrame(nonCanonicalFrame), /bootstrap-frame-not-canonical/);
  assert.throws(() => encodeBootstrapFrame({ schema: 'zj-loop.bootstrap_frame.v1', channel_role: 'identity-binding', payload: 'x'.repeat(64 * 1024) }), /bootstrap-frame-limit-exceeded/);
});

test('memory fixture enforces direction, one-shot ownership and worker fd isolation', async () => {
  const fixture = createBootstrapTransportFixture();
  await fixture.trustedRunner.send('identity-binding', { ok: true });
  assert.deepEqual(await fixture.sidecar.receive('identity-binding'), { ok: true });
  await assert.rejects(() => fixture.sidecar.send('identity-binding', { ok: false }), /bootstrap-channel-direction-invalid/);
  await assert.rejects(() => fixture.worker.receive('identity-binding'), /bootstrap-channel-actor-invalid/);
  await assert.rejects(() => fixture.sidecar.receive('identity-binding'), /bootstrap-channel-closed/);
  await fixture.sidecar.send('status', { status: 'runtime-ready' });
  assert.deepEqual(await fixture.trustedRunner.receive('status'), { status: 'runtime-ready' });
  assert.deepEqual(fixture.worker.inherited_channels(), []);
});

test('memory fixture deterministically replays chunk schedules and timeout boundaries', async () => {
  const frame = { schema: 'zj-loop.bootstrap_frame.v1', channel_role: 'identity-binding', payload: { x: 1 } };
  const fixture = createBootstrapTransportFixture();
  const encodedLength = encodeBootstrapFrame(frame).byteLength;
  await fixture.trustedRunner.sendEncoded('identity-binding', frame, [1, 2, encodedLength - 3]);
  assert.deepEqual({ ...(await fixture.sidecar.receiveEncoded('identity-binding', { now_ms: 10, deadline_ms: 10 })).payload }, { x: 1 });
  const timeoutFixture = createBootstrapTransportFixture();
  await timeoutFixture.trustedRunner.sendEncoded('identity-binding', frame, [encodedLength]);
  await assert.rejects(() => timeoutFixture.sidecar.receiveEncoded('identity-binding', { now_ms: 11, deadline_ms: 10 }), /bootstrap-channel-timeout/);
  await assert.rejects(() => timeoutFixture.sidecar.receiveEncoded('identity-binding', { now_ms: 10, deadline_ms: 10 }), /bootstrap-channel-closed/);
});

test('bootstrap reason descriptors are stable policy records', () => {
  assert.ok(BOOTSTRAP_REASON_DESCRIPTORS.length >= 6);
  const invalidHello = getBootstrapReasonDescriptor('bootstrap-worker-hello-invalid');
  assert.deepEqual(invalidHello, {
    code: 'bootstrap-worker-hello-invalid',
    lifecycle_stage: 'worker-handshake',
    default_outcome: 'blocked',
    requires_human_review: true,
    allows_new_attempt: true,
    detail_policy: 'field-name-length-and-digest-only',
  });
  assert.equal(getBootstrapReasonDescriptor('bootstrap-unknown'), undefined);
  assert.equal(new Set(BOOTSTRAP_REASON_DESCRIPTORS.map((item) => item.code)).size, BOOTSTRAP_REASON_DESCRIPTORS.length);
});

test('bootstrap lifecycle is monotonic and maps cleanup uncertainty explicitly', () => {
  let lifecycle = { ...BOOTSTRAP_INITIAL_LIFECYCLE, execution_id: 'execution-1', attempt: 1 };
  lifecycle = advanceBootstrapLifecycle(lifecycle, { type: 'arm', now_ms: 100 });
  lifecycle = advanceBootstrapLifecycle(lifecycle, { type: 'sidecar-started', now_ms: 110 });
  lifecycle = advanceBootstrapLifecycle(lifecycle, { type: 'auth-ready', now_ms: 120 });
  lifecycle = advanceBootstrapLifecycle(lifecycle, { type: 'binding-verified', now_ms: 130 });
  lifecycle = advanceBootstrapLifecycle(lifecycle, { type: 'runtime-ready', now_ms: 140 });
  lifecycle = advanceBootstrapLifecycle(lifecycle, { type: 'worker-connected', now_ms: 150 });
  lifecycle = advanceBootstrapLifecycle(lifecycle, { type: 'worker-accepted', now_ms: 160 });
  assert.equal(lifecycle.status, 'runtime-ready');
  assert.equal(lifecycle.stage, 'worker-accepted');
  assert.throws(() => advanceBootstrapLifecycle(lifecycle, { type: 'auth-ready', now_ms: 170 }), /bootstrap-lifecycle-transition-invalid/);
  const uncertain = advanceBootstrapLifecycle(lifecycle, { type: 'cleanup-uncertain', now_ms: 180 });
  assert.equal(uncertain.status, 'outcome-uncertain');
  assert.equal(uncertain.reason_code, 'bootstrap-cleanup-uncertain');
});

test('golden vector remains a read-only conformance contract', async () => {
  const path = fileURLToPath(new URL('./fixtures/bootstrap/basic-binding.v1.json', import.meta.url));
  const vector = JSON.parse(await readFile(path, 'utf8'));
  const binding = createBootstrapBinding({ identity: vector.identity, execution: vector.execution });
  assert.equal(binding.bootstrap_profile_sha256, vector.expected.bootstrap_profile_sha256);
  assert.equal(binding.identity_digest, vector.expected.identity_digest);
  assert.equal(binding.execution_binding_digest, vector.expected.execution_binding_digest);
  assert.equal(binding.binding_digest, vector.expected.binding_digest);
  assert.equal(Buffer.from(encodeBootstrapFrame(vector.frame)).toString('hex'), vector.expected.frame_hex);
});
