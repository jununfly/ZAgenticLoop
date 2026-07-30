import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoundedJsonError, parseBoundedJson } from '../dist/parse-bounded-json.js';

const invalid = (input, reason = 'approval-json-invalid') => {
  assert.throws(() => parseBoundedJson(input), (error) => error instanceof BoundedJsonError && error.reason === reason);
};

test('parseBoundedJson returns null-prototype objects and strict JSON values', () => {
  const value = parseBoundedJson(new TextEncoder().encode('{"__proto__":{"safe":true},"items":[1,true,null]}'));
  assert.equal(Object.getPrototypeOf(value), null);
  assert.deepEqual(value.items, [1, true, null]);
  assert.equal(Object.getPrototypeOf(value.__proto__), null);
});

test('parseBoundedJson rejects duplicate keys, comments, and trailing commas', () => {
  invalid('{"a":1,"a":2}');
  invalid('{/*comment*/"a":1}');
  invalid('{"a":1,}');
});

test('parseBoundedJson enforces byte, depth, member, array, string, and node limits', () => {
  invalid('"' + 'a'.repeat(16 * 1024 + 1) + '"', 'approval-json-limit-exceeded');
  invalid('['.repeat(17) + '0' + ']'.repeat(17), 'approval-json-limit-exceeded');
  invalid('[' + Array.from({ length: 129 }, () => '0').join(',') + ']', 'approval-json-limit-exceeded');
  invalid('{' + Array.from({ length: 129 }, (_, index) => `"k${index}":0`).join(',') + '}', 'approval-json-limit-exceeded');
  invalid('[' + Array.from({ length: 513 }, () => '[]').join(',') + ']', 'approval-json-limit-exceeded');
});

test('parseBoundedJson rejects invalid UTF-8 and unsafe numbers', () => {
  invalid(Uint8Array.from([0xc3, 0x28]));
  invalid('9007199254740992');
  invalid('1e309');
});

test('parseBoundedJson accepts a string convenience input but applies byte limits', () => {
  assert.equal(parseBoundedJson('{"ok":true}').ok, true);
  invalid('a'.repeat(64 * 1024 + 1), 'approval-json-limit-exceeded');
});
