import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFramedJsonCodec, FramedJsonDecoder } from '../dist/framed-json-transport.js';

const codec = createFramedJsonCodec({ max_frame_bytes: 1024 });

test('provider-neutral framed JSON codec handles canonical split frames and ordered correlation', () => {
  const first = codec.encode({ correlation_id: 'corr-1', sequence: 1, command: 'challenge', payload: { b: 2, a: 1 } });
  const second = codec.encode({ correlation_id: 'corr-1', sequence: 2, command: 'revoke', payload: { auth_ref_id: 'ref-1' } });
  assert.deepEqual(Array.from(first.slice(0, 4)), [0, 0, 0, first.length - 4]);
  const decoder = new FramedJsonDecoder({ correlation_id: 'corr-1', validate: (value) => value && typeof value === 'object' && !Array.isArray(value) ? { status: 'valid' } : { status: 'blocked', reason: 'frame-object-invalid' } });
  assert.deepEqual(decoder.push(first.slice(0, 3)), { status: 'accepted', frames: [] });
  const result = decoder.push(new Uint8Array([...first.slice(3), ...second]));
  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.frames.map((frame) => frame.sequence), [1, 2]);
  assert.deepEqual(decoder.finish(), { status: 'accepted', frames: [] });
});

test('provider-neutral framed JSON codec rejects sequence drift, correlation drift, oversized and truncated frames', () => {
  const valid = codec.encode({ correlation_id: 'corr-1', sequence: 1, command: 'revoke' });
  const decoder = new FramedJsonDecoder({ correlation_id: 'corr-1' });
  assert.equal(decoder.push(valid).status, 'accepted');
  assert.equal(decoder.push(valid).reason, 'framed-json-sequence-mismatch');
  const drift = new FramedJsonDecoder({ correlation_id: 'corr-1' });
  assert.equal(drift.push(codec.encode({ correlation_id: 'corr-2', sequence: 1, command: 'revoke' })).reason, 'framed-json-correlation-mismatch');
  const truncated = new FramedJsonDecoder();
  truncated.push(valid.slice(0, -1));
  assert.deepEqual(truncated.finish(), { status: 'blocked', reason: 'framed-json-truncated' });
  assert.throws(() => codec.encode({ correlation_id: 'corr-1', sequence: 1, payload: 'x'.repeat(2000) }), /framed-json-too-large/);
});
