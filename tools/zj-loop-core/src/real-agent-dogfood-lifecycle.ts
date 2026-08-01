import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import type { SqliteStateStore } from './sqlite-state-store.js';

export const REAL_AGENT_DOGFOOD_LIFECYCLE_SCHEMA = 'zj-loop.real_agent_dogfood_lifecycle.v1' as const;
export const REAL_AGENT_DOGFOOD_EVENT_SCHEMA = 'zj-loop.real_agent_dogfood_event.v1' as const;
export const REAL_AGENT_DOGFOOD_AGGREGATE_TYPE = 'real-agent-dogfood' as const;

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;

export type RealAgentDogfoodStatus =
  | 'draft'
  | 'preflight-ready'
  | 'awaiting-human-approval'
  | 'running'
  | 'verification-pending'
  | 'review-pending'
  | 'accepted'
  | 'blocked'
  | 'outcome-uncertain'
  | 'request-revision'
  | 'rejected';

export type RealAgentDogfoodLifecycle = {
  schema: typeof REAL_AGENT_DOGFOOD_LIFECYCLE_SCHEMA;
  network_id: string;
  dogfood_id: string;
  execution_id: string;
  attempt: number;
  provider_id: string;
  adapter_version: string;
  status: RealAgentDogfoodStatus;
  created_at: string;
  updated_at: string;
  last_fact_digest: string | null;
  approval_digest: string | null;
  reason_code: string | null;
  next_action: string | null;
  lifecycle_digest: string;
};

export type RealAgentDogfoodEventPayload = {
  schema: typeof REAL_AGENT_DOGFOOD_EVENT_SCHEMA;
  network_id: string;
  dogfood_id: string;
  execution_id: string;
  attempt: number;
  provider_id: string;
  adapter_version: string;
  from_status: RealAgentDogfoodStatus | null;
  to_status: RealAgentDogfoodStatus;
  fact_digest: string | null;
  approval_digest: string | null;
  reason_code: string | null;
  next_action: string | null;
};

export type RealAgentDogfoodEvent = {
  event_id: string;
  aggregate_type: typeof REAL_AGENT_DOGFOOD_AGGREGATE_TYPE;
  aggregate_id: string;
  event_type: 'real-agent-dogfood.lifecycle.transitioned';
  occurred_at: string;
  payload: RealAgentDogfoodEventPayload;
};

type Input = Omit<RealAgentDogfoodLifecycle, 'schema' | 'status' | 'created_at' | 'updated_at' | 'last_fact_digest' | 'approval_digest' | 'reason_code' | 'next_action' | 'lifecycle_digest'> & { created_at: string };

const EDGES: Record<RealAgentDogfoodStatus, RealAgentDogfoodStatus[]> = {
  draft: ['preflight-ready', 'blocked'],
  'preflight-ready': ['awaiting-human-approval', 'blocked'],
  'awaiting-human-approval': ['running', 'blocked'],
  running: ['verification-pending', 'blocked', 'outcome-uncertain'],
  'verification-pending': ['review-pending', 'blocked'],
  'review-pending': ['accepted', 'rejected', 'request-revision', 'blocked'],
  accepted: [],
  blocked: ['draft'],
  'outcome-uncertain': ['draft'],
  'request-revision': ['draft'],
  rejected: [],
};

const EVENT_KEYS = ['schema', 'network_id', 'dogfood_id', 'execution_id', 'attempt', 'provider_id', 'adapter_version', 'from_status', 'to_status', 'fact_digest', 'approval_digest', 'reason_code', 'next_action'];

function canonical(value: unknown): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('real-agent-dogfood-canonicalization-invalid');
  return json;
}

function digest(value: unknown): string { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function validDigest(value: unknown): value is string { return typeof value === 'string' && DIGEST.test(value); }
function validId(value: unknown): value is string { return typeof value === 'string' && ID.test(value); }
function validTime(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function lifecycleDigest(value: Omit<RealAgentDogfoodLifecycle, 'lifecycle_digest'>): string { return digest(value); }
function withoutDigest(value: RealAgentDogfoodLifecycle): Omit<RealAgentDogfoodLifecycle, 'lifecycle_digest'> { const { lifecycle_digest: _, ...unsigned } = value; return unsigned; }

function validateIdentity(input: Input): void {
  for (const [value, error] of [[input.network_id, 'network-id-invalid'], [input.dogfood_id, 'dogfood-id-invalid'], [input.execution_id, 'execution-id-invalid'], [input.provider_id, 'provider-id-invalid'], [input.adapter_version, 'adapter-version-invalid']] as const) if (!validId(value)) throw new Error(error);
  if (!Number.isInteger(input.attempt) || input.attempt < 1) throw new Error('real-agent-dogfood-attempt-invalid');
  if (!validTime(input.created_at)) throw new Error('real-agent-dogfood-time-invalid');
}

function makeLifecycle(input: { base: Input; status: RealAgentDogfoodStatus; updated_at: string; last_fact_digest: string | null; approval_digest: string | null; reason_code: string | null; next_action: string | null }): RealAgentDogfoodLifecycle {
  const unsigned = {
    schema: REAL_AGENT_DOGFOOD_LIFECYCLE_SCHEMA,
    network_id: input.base.network_id,
    dogfood_id: input.base.dogfood_id,
    execution_id: input.base.execution_id,
    attempt: input.base.attempt,
    provider_id: input.base.provider_id,
    adapter_version: input.base.adapter_version,
    status: input.status,
    created_at: input.base.created_at,
    updated_at: input.updated_at,
    last_fact_digest: input.last_fact_digest,
    approval_digest: input.approval_digest,
    reason_code: input.reason_code,
    next_action: input.next_action,
  } satisfies Omit<RealAgentDogfoodLifecycle, 'lifecycle_digest'>;
  return { ...unsigned, lifecycle_digest: lifecycleDigest(unsigned) };
}

export function createRealAgentDogfoodDraft(input: Input): { lifecycle: RealAgentDogfoodLifecycle; event: RealAgentDogfoodEvent } {
  validateIdentity(input);
  const lifecycle = makeLifecycle({ base: input, status: 'draft', updated_at: input.created_at, last_fact_digest: null, approval_digest: null, reason_code: null, next_action: 'prepare-preflight' });
  const event = eventFor({ lifecycle: null, next: lifecycle, event_id: `real-agent-dogfood:${input.dogfood_id}:attempt-${input.attempt}:draft`, occurred_at: input.created_at, fact_digest: null, approval_digest: null, reason_code: null, next_action: 'prepare-preflight' });
  return { lifecycle, event };
}

export function createRealAgentDogfoodTransition(input: { lifecycle: RealAgentDogfoodLifecycle; to: RealAgentDogfoodStatus; event_id: string; occurred_at: string; fact_digest?: string; approval_digest?: string; reason_code?: string; next_action?: string; attempt?: number; execution_id?: string }): { lifecycle: RealAgentDogfoodLifecycle; event: RealAgentDogfoodEvent } {
  if (!input.lifecycle || input.lifecycle.lifecycle_digest !== lifecycleDigest(withoutDigest(input.lifecycle))) throw new Error('real-agent-dogfood-lifecycle-invalid');
  if (!EDGES[input.lifecycle.status].includes(input.to)) throw new Error('real-agent-dogfood-transition-invalid');
  if (!validId(input.event_id) || !validTime(input.occurred_at)) throw new Error('real-agent-dogfood-event-identity-invalid');
  if (input.fact_digest !== undefined && !validDigest(input.fact_digest)) throw new Error('real-agent-dogfood-fact-digest-invalid');
  if (input.approval_digest !== undefined && !validDigest(input.approval_digest)) throw new Error('real-agent-dogfood-approval-digest-invalid');
  const isStop = ['blocked', 'outcome-uncertain', 'request-revision', 'rejected'].includes(input.to);
  if (isStop && (!input.reason_code?.trim() || !input.next_action?.trim())) throw new Error('real-agent-dogfood-stop-fact-required');
  if (input.to === 'running' && !validDigest(input.approval_digest)) throw new Error('real-agent-dogfood-approval-required');
  const newAttempt = input.attempt ?? input.lifecycle.attempt;
  const newExecution = input.execution_id ?? input.lifecycle.execution_id;
  if (input.to === 'draft' && (newAttempt !== input.lifecycle.attempt + 1 || newExecution === input.lifecycle.execution_id)) throw new Error('real-agent-dogfood-new-attempt-required');
  if (input.to !== 'draft' && (newAttempt !== input.lifecycle.attempt || newExecution !== input.lifecycle.execution_id)) throw new Error('real-agent-dogfood-attempt-binding-mismatch');
  const base: Input = { network_id: input.lifecycle.network_id, dogfood_id: input.lifecycle.dogfood_id, execution_id: newExecution, attempt: newAttempt, provider_id: input.lifecycle.provider_id, adapter_version: input.lifecycle.adapter_version, created_at: input.lifecycle.created_at };
  const lifecycle = makeLifecycle({ base, status: input.to, updated_at: input.occurred_at, last_fact_digest: input.fact_digest ?? null, approval_digest: input.approval_digest ?? null, reason_code: input.reason_code ?? null, next_action: input.next_action ?? null });
  return { lifecycle, event: eventFor({ lifecycle: input.lifecycle, next: lifecycle, event_id: input.event_id, occurred_at: input.occurred_at, fact_digest: input.fact_digest ?? null, approval_digest: input.approval_digest ?? null, reason_code: input.reason_code ?? null, next_action: input.next_action ?? null }) };
}

function eventFor(input: { lifecycle: RealAgentDogfoodLifecycle | null; next: RealAgentDogfoodLifecycle; event_id: string; occurred_at: string; fact_digest: string | null; approval_digest: string | null; reason_code: string | null; next_action: string | null }): RealAgentDogfoodEvent {
  return { event_id: input.event_id, aggregate_type: REAL_AGENT_DOGFOOD_AGGREGATE_TYPE, aggregate_id: input.next.dogfood_id, event_type: 'real-agent-dogfood.lifecycle.transitioned', occurred_at: input.occurred_at, payload: { schema: REAL_AGENT_DOGFOOD_EVENT_SCHEMA, network_id: input.next.network_id, dogfood_id: input.next.dogfood_id, execution_id: input.next.execution_id, attempt: input.next.attempt, provider_id: input.next.provider_id, adapter_version: input.next.adapter_version, from_status: input.lifecycle?.status ?? null, to_status: input.next.status, fact_digest: input.fact_digest, approval_digest: input.approval_digest, reason_code: input.reason_code, next_action: input.next_action } };
}

function eventIdentity(event: RealAgentDogfoodEvent): string {
  return canonical({ event_id: event.event_id, aggregate_type: event.aggregate_type, aggregate_id: event.aggregate_id, event_type: event.event_type, occurred_at: event.occurred_at, payload: event.payload });
}

function applyEvent(current: RealAgentDogfoodLifecycle | null, event: RealAgentDogfoodEvent): RealAgentDogfoodLifecycle {
  if (event.event_type !== 'real-agent-dogfood.lifecycle.transitioned' || event.aggregate_type !== REAL_AGENT_DOGFOOD_AGGREGATE_TYPE) throw new Error('real-agent-dogfood-event-unknown');
  const payload = event.payload;
  if (!payload || payload.schema !== REAL_AGENT_DOGFOOD_EVENT_SCHEMA || Object.keys(payload).some((key) => !EVENT_KEYS.includes(key))) throw new Error('real-agent-dogfood-event-schema-invalid');
  if (!validId(payload.network_id) || !validId(payload.dogfood_id) || !validId(payload.execution_id) || !validId(payload.provider_id) || !validId(payload.adapter_version) || !Number.isInteger(payload.attempt) || payload.attempt < 1 || !validTime(event.occurred_at)) throw new Error('real-agent-dogfood-event-invalid');
  if (payload.fact_digest !== null && !validDigest(payload.fact_digest)) throw new Error('real-agent-dogfood-event-invalid');
  if (payload.approval_digest !== null && !validDigest(payload.approval_digest)) throw new Error('real-agent-dogfood-event-invalid');
  if (current === null) {
    if (payload.from_status !== null || payload.to_status !== 'draft' || payload.attempt !== 1) throw new Error('real-agent-dogfood-event-sequence-invalid');
    const base: Input = { network_id: payload.network_id, dogfood_id: payload.dogfood_id, execution_id: payload.execution_id, attempt: payload.attempt, provider_id: payload.provider_id, adapter_version: payload.adapter_version, created_at: event.occurred_at };
    return makeLifecycle({ base, status: 'draft', updated_at: event.occurred_at, last_fact_digest: null, approval_digest: null, reason_code: null, next_action: payload.next_action });
  }
  if (payload.network_id !== current.network_id || payload.provider_id !== current.provider_id || payload.adapter_version !== current.adapter_version || payload.dogfood_id !== current.dogfood_id || event.aggregate_id !== current.dogfood_id || payload.from_status !== current.status) throw new Error('real-agent-dogfood-event-sequence-invalid');
  if (payload.execution_id !== current.execution_id && payload.to_status !== 'draft') throw new Error('real-agent-dogfood-event-sequence-invalid');
  if (!EDGES[current.status].includes(payload.to_status)) throw new Error('real-agent-dogfood-event-sequence-invalid');
  const base: Input = { network_id: current.network_id, dogfood_id: current.dogfood_id, execution_id: payload.execution_id, attempt: payload.attempt, provider_id: current.provider_id, adapter_version: current.adapter_version, created_at: current.created_at };
  return makeLifecycle({ base, status: payload.to_status, updated_at: event.occurred_at, last_fact_digest: payload.fact_digest, approval_digest: payload.approval_digest, reason_code: payload.reason_code, next_action: payload.next_action });
}

export function projectRealAgentDogfoodLifecycle(events: RealAgentDogfoodEvent[]): RealAgentDogfoodLifecycle {
  let current: RealAgentDogfoodLifecycle | null = null;
  const seen = new Map<string, string>();
  for (const event of events) {
    const encoded = eventIdentity(event);
    const prior = seen.get(event.event_id);
    if (prior !== undefined) {
      if (prior !== encoded) throw new Error('real-agent-dogfood-event-conflict');
      continue;
    }
    seen.set(event.event_id, encoded);
    current = applyEvent(current, event);
  }
  if (!current) throw new Error('real-agent-dogfood-lifecycle-empty');
  return current;
}

export async function appendRealAgentDogfoodEvent(input: { stateStore: SqliteStateStore; expected_revision: number; event: RealAgentDogfoodEvent; now?: string }): Promise<{ status: 'recorded' | 'duplicate' | 'conflict'; revision?: number; current_revision: number; reason?: string }> {
  if (input.event.aggregate_type !== REAL_AGENT_DOGFOOD_AGGREGATE_TYPE) throw new Error('real-agent-dogfood-aggregate-type-invalid');
  if (input.event.payload.network_id === undefined) throw new Error('real-agent-dogfood-network-id-required');
  const existing = await input.stateStore.readEvents({ network_id: input.event.payload.network_id, aggregate_type: REAL_AGENT_DOGFOOD_AGGREGATE_TYPE, aggregate_id: input.event.aggregate_id });
  const existingEvents = existing.events as unknown as RealAgentDogfoodEvent[];
  projectRealAgentDogfoodLifecycle([...existingEvents, input.event]);
  return input.stateStore.appendEvent({ network_id: input.event.payload.network_id, expected_revision: input.expected_revision, now: input.now, event: input.event });
}
