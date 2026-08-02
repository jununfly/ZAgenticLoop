import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProviderAuthIpcFrame, encodeProviderAuthIpcFrame, ProviderAuthIpcDecoder, validateProviderAuthIpcFrame } from '../dist/provider-auth-ipc-protocol.js';

const base = { correlation_id: 'corr-1', network_id: 'network-1', node_id: 'node-1', provider_runtime_id: 'runtime-1', provider_id: 'codex', execution_id: 'execution-1', attempt: 1 };
const frame = (kind, sequence, extra = {}) => createProviderAuthIpcFrame({ ...base, kind, sequence, ...extra });

test('ProviderAuth IPC codec frames canonical JSON with a bounded binary length prefix', () => {
  const challenge = encodeProviderAuthIpcFrame(frame('challenge', 1, { nonce: 'nonce-1' }));
  const result = encodeProviderAuthIpcFrame(frame('result', 2, { launch_handle_digest: 'sha256:' + 'a'.repeat(64), payload: { result: 'ok' } }));
  const decoder = new ProviderAuthIpcDecoder({ correlation_id: 'corr-1' });
  const first = decoder.push(challenge.slice(0, 3));
  assert.deepEqual(first, { status: 'accepted', frames: [] });
  const second = decoder.push(new Uint8Array([...challenge.slice(3), ...result]));
  assert.equal(second.status, 'accepted');
  assert.deepEqual(second.frames.map(({ kind, sequence }) => ({ kind, sequence })), [{ kind: 'challenge', sequence: 1 }, { kind: 'result', sequence: 2 }]);
  assert.deepEqual(decoder.finish(), { status: 'accepted', frames: [] });
});

test('ProviderAuth IPC codec rejects unknown fields, replayed sequence, correlation drift, truncation, and invalid lengths', () => {
  const valid = frame('challenge', 1, { nonce: 'nonce-1' });
  assert.equal(validateProviderAuthIpcFrame({ ...valid, secret: 'must-not-travel' }).status, 'blocked');
  const replay = new ProviderAuthIpcDecoder({ correlation_id: 'corr-1' });
  assert.equal(replay.push(encodeProviderAuthIpcFrame(valid)).status, 'accepted');
  assert.equal(replay.push(encodeProviderAuthIpcFrame(valid)).reason, 'provider-auth-ipc-sequence-mismatch');
  const drift = new ProviderAuthIpcDecoder({ correlation_id: 'corr-1' });
  assert.equal(drift.push(encodeProviderAuthIpcFrame(frame('challenge', 1, { nonce: 'nonce-1', correlation_id: 'corr-2' }))).reason, 'provider-auth-ipc-correlation-mismatch');
  const truncated = new ProviderAuthIpcDecoder();
  const bytes = encodeProviderAuthIpcFrame(valid);
  truncated.push(bytes.slice(0, -1));
  assert.deepEqual(truncated.finish(), { status: 'blocked', reason: 'provider-auth-ipc-frame-truncated' });
  const invalid = new ProviderAuthIpcDecoder();
  assert.deepEqual(invalid.push(Uint8Array.from([0, 0, 0, 1])), { status: 'blocked', reason: 'provider-auth-ipc-frame-length-invalid' });
});
