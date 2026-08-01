import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const CODEX_JSONL_PARSE_SCHEMA = 'zj-loop.codex_jsonl_parse.v1' as const;
export const AGENT_TASK_RESULT_SCHEMA = 'zj-loop.agent_task_result.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/i;
const BEGIN = 'ZJ_LOOP_RESULT_BEGIN';
const END = 'ZJ_LOOP_RESULT_END';

export type AgentTaskResult = {
  schema: typeof AGENT_TASK_RESULT_SCHEMA;
  status: 'completed';
  summary: string;
  claims: string[];
  file_refs: Array<{ repository: string; commit: string; path: string; start_line: number; end_line: number; content_sha256: string }>;
  evidence_refs: string[];
};

type CodexEvent = { type: string; id: string; sequence: number; data: Record<string, unknown> };
export type CodexJsonlParseResult =
  | { schema: typeof CODEX_JSONL_PARSE_SCHEMA; status: 'completed'; events: CodexEvent[]; event_stream_digest: string; task_result: AgentTaskResult; final_message: string }
  | { schema: typeof CODEX_JSONL_PARSE_SCHEMA; status: 'blocked'; reason: string; events: CodexEvent[] };

export type CodexJsonlParserOptions = { max_line_bytes?: number; max_events?: number; max_json_depth?: number; max_object_fields?: number; max_string_bytes?: number; max_task_result_bytes?: number };

function digest(value: unknown): string { const json = canonicalize(value); if (typeof json !== 'string') throw new Error('codex-jsonl-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`; }
function blocked(reason: string, events: CodexEvent[] = []): CodexJsonlParseResult { return { schema: CODEX_JSONL_PARSE_SCHEMA, status: 'blocked', reason, events }; }
function structureWithin(value: unknown, depth: number, maxDepth: number, maxFields: number, maxStringBytes: number): boolean {
  if (depth > maxDepth) return false;
  if (typeof value === 'string') return Buffer.byteLength(value, 'utf8') <= maxStringBytes;
  if (Array.isArray(value)) return value.every((item) => structureWithin(item, depth + 1, maxDepth, maxFields, maxStringBytes));
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length <= maxFields && entries.every(([key, item]) => Buffer.byteLength(key, 'utf8') <= maxStringBytes && structureWithin(item, depth + 1, maxDepth, maxFields, maxStringBytes));
  }
  return true;
}
function parseEvent(line: string, options: Required<CodexJsonlParserOptions>): CodexEvent | { error: string } {
  if (Buffer.byteLength(line, 'utf8') > options.max_line_bytes) return { error: 'line-limit-exceeded' };
  let value: unknown;
  try { value = JSON.parse(line); } catch { return { error: 'event-json-invalid' }; }
  if (!structureWithin(value, 0, options.max_json_depth, options.max_object_fields, options.max_string_bytes)) return { error: 'event-structure-limit-exceeded' };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'event-schema-invalid' };
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !['type', 'id', 'sequence', 'data'].includes(key)) || typeof record.type !== 'string' || typeof record.id !== 'string' || !record.id || !Number.isInteger(record.sequence) || (record.sequence as number) < 1 || !record.data || typeof record.data !== 'object' || Array.isArray(record.data)) return { error: 'event-schema-invalid' };
  return { type: record.type, id: record.id, sequence: record.sequence as number, data: record.data as Record<string, unknown> };
}
function validTaskResult(value: unknown): value is AgentTaskResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some((key) => !['schema', 'status', 'summary', 'claims', 'file_refs', 'evidence_refs'].includes(key)) || item.schema !== AGENT_TASK_RESULT_SCHEMA || item.status !== 'completed' || typeof item.summary !== 'string' || item.summary.trim().length === 0 || !Array.isArray(item.claims) || !item.claims.every((claim) => typeof claim === 'string' && claim.trim().length > 0) || !Array.isArray(item.evidence_refs) || !item.evidence_refs.every((ref) => typeof ref === 'string' && DIGEST.test(ref))) return false;
  if (!Array.isArray(item.file_refs) || item.file_refs.length === 0) return false;
  return item.file_refs.every((ref) => {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return false;
    const file = ref as Record<string, unknown>;
    const startLine = file.start_line;
    const endLine = file.end_line;
    return Object.keys(file).every((key) => ['repository', 'commit', 'path', 'start_line', 'end_line', 'content_sha256'].includes(key)) && typeof file.repository === 'string' && file.repository.length > 0 && typeof file.commit === 'string' && COMMIT.test(file.commit) && typeof file.path === 'string' && file.path.length > 0 && !file.path.startsWith('/') && !file.path.split('/').includes('..') && typeof startLine === 'number' && Number.isInteger(startLine) && startLine >= 1 && typeof endLine === 'number' && Number.isInteger(endLine) && endLine >= startLine && typeof file.content_sha256 === 'string' && DIGEST.test(file.content_sha256);
  });
}
function extractTaskResult(message: string, maxBytes: number): { result?: AgentTaskResult; reason?: string } {
  if (Buffer.byteLength(message, 'utf8') > maxBytes) return { reason: 'task-result-limit-exceeded' };
  const begins = message.split(BEGIN).length - 1;
  const ends = message.split(END).length - 1;
  if (begins !== 1 || ends !== 1) return { reason: 'task-result-missing' };
  const start = message.indexOf(BEGIN) + BEGIN.length;
  const finish = message.indexOf(END, start);
  const body = message.slice(start, finish).trim();
  let value: unknown;
  try { value = JSON.parse(body); } catch { return { reason: 'task-result-json-invalid' }; }
  return validTaskResult(value) ? { result: value } : { reason: 'task-result-schema-invalid' };
}

export function parseCodexJsonl(input: string, provided: CodexJsonlParserOptions = {}): CodexJsonlParseResult {
  const options: Required<CodexJsonlParserOptions> = { max_line_bytes: 256 * 1024, max_events: 10_000, max_json_depth: 32, max_object_fields: 128, max_string_bytes: 64 * 1024, max_task_result_bytes: 64 * 1024, ...provided };
  if (typeof input !== 'string') return blocked('input-invalid');
  const lines = input.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const events: CodexEvent[] = [];
  const seenIds = new Set<string>();
  const startedItems = new Set<string>();
  let phase: 'start' | 'thread' | 'turn' | 'terminal' = 'start';
  let finalMessage = '';
  let terminalType: 'completed' | 'error' | null = null;
  for (const line of lines) {
    if (events.length >= options.max_events) return blocked('event-limit-exceeded', events);
    const parsed = parseEvent(line, options);
    if ('error' in parsed) return blocked(parsed.error, events);
    if (seenIds.has(parsed.id) || parsed.sequence !== events.length + 1) return blocked('event-sequence-invalid', events);
    seenIds.add(parsed.id);
    const data = parsed.data;
    const canAcceptTurnEvent = phase === 'turn';
    if (parsed.type === 'thread.started' && phase === 'start') phase = 'thread';
    else if (parsed.type === 'turn.started' && phase === 'thread') phase = 'turn';
    else if (parsed.type === 'item.started' && canAcceptTurnEvent && typeof data.item_id === 'string') startedItems.add(data.item_id);
    else if (parsed.type === 'item.completed' && canAcceptTurnEvent && typeof data.item_id === 'string' && startedItems.has(data.item_id)) {
      if (data.item_type === 'agent_message' && typeof data.text === 'string') finalMessage = data.text;
    } else if (parsed.type === 'turn.completed' && canAcceptTurnEvent && data.status === 'completed') { phase = 'terminal'; terminalType = 'completed'; }
    else if (parsed.type === 'error' && (canAcceptTurnEvent || phase === 'thread')) { phase = 'terminal'; terminalType = 'error'; }
    else return blocked(parsed.type === 'thread.started' || parsed.type === 'turn.started' || parsed.type === 'item.started' || parsed.type === 'item.completed' || parsed.type === 'turn.completed' || parsed.type === 'error' ? 'event-order-invalid' : 'unknown-event-type', events);
    events.push(parsed);
    if (phase === 'terminal' && events.length < lines.length) return blocked('event-after-terminal', events);
  }
  if (terminalType === 'error') return blocked('provider-error', events);
  if (terminalType !== 'completed' || !finalMessage) return blocked('event-order-invalid', events);
  const extracted = extractTaskResult(finalMessage, options.max_task_result_bytes);
  if (!extracted.result) return blocked(extracted.reason ?? 'task-result-invalid', events);
  return { schema: CODEX_JSONL_PARSE_SCHEMA, status: 'completed', events, event_stream_digest: digest(events), task_result: extracted.result, final_message: finalMessage };
}
