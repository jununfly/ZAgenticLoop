import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCodexJsonl } from '../dist/codex-jsonl-parser.js';

const event = (type, id, sequence, data = {}) => JSON.stringify({ type, id, sequence, data });
const result = JSON.stringify({
  schema: 'zj-loop.agent_task_result.v1',
  status: 'completed',
  summary: 'Reviewed repository',
  claims: ['The repository is consistent'],
  file_refs: [{ repository: 'repo-1', commit: 'a'.repeat(40), path: 'README.md', start_line: 1, end_line: 2, content_sha256: `sha256:${'b'.repeat(64)}` }],
  evidence_refs: [`sha256:${'c'.repeat(64)}`],
});

function happy(finalMessage = `ZJ_LOOP_RESULT_BEGIN\n${result}\nZJ_LOOP_RESULT_END`) {
  return [
    event('thread.started', 'evt-1', 1, { thread_id: 'thread-1' }),
    event('turn.started', 'evt-2', 2, { turn_id: 'turn-1' }),
    event('item.started', 'evt-3', 3, { item_id: 'item-1', item_type: 'agent_message' }),
    event('item.completed', 'evt-4', 4, { item_id: 'item-1', item_type: 'agent_message', text: finalMessage }),
    event('turn.completed', 'evt-5', 5, { turn_id: 'turn-1', status: 'completed' }),
  ].join('\n');
}

test('Codex JSONL parser accepts a bounded ordered stream and one structured task result', () => {
  const parsed = parseCodexJsonl(happy());
  assert.equal(parsed.status, 'completed');
  assert.equal(parsed.events.length, 5);
  assert.equal(parsed.task_result.schema, 'zj-loop.agent_task_result.v1');
  assert.equal(parsed.task_result.file_refs[0].path, 'README.md');
  assert.match(parsed.event_stream_digest, /^sha256:[0-9a-f]{64}$/);
});

test('Codex JSONL parser fails closed for unknown, reordered, duplicated, and incomplete streams', () => {
  assert.equal(parseCodexJsonl([event('thread.started', 'evt-1', 1), event('mystery.event', 'evt-2', 2)].join('\n')).reason, 'unknown-event-type');
  assert.equal(parseCodexJsonl([event('turn.started', 'evt-1', 1)].join('\n')).reason, 'event-order-invalid');
  assert.equal(parseCodexJsonl(happy().replace('"sequence":5', '"sequence":4')).reason, 'event-sequence-invalid');
  assert.equal(parseCodexJsonl(happy('plain response')).reason, 'task-result-missing');
});

test('Codex JSONL parser rejects malformed task result and boundedness violations', () => {
  const malformed = `ZJ_LOOP_RESULT_BEGIN\n{"schema":"zj-loop.agent_task_result.v1","status":"completed"}\nZJ_LOOP_RESULT_END`;
  assert.equal(parseCodexJsonl(happy(malformed)).reason, 'task-result-schema-invalid');
  assert.equal(parseCodexJsonl(happy() + `\n${'x'.repeat(32)}`, { max_line_bytes: 16 }).reason, 'line-limit-exceeded');
  assert.equal(parseCodexJsonl(happy(), { max_events: 4 }).reason, 'event-limit-exceeded');
});
