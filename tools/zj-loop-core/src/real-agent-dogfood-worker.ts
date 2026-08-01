import { randomUUID } from 'node:crypto';
import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';

export const REAL_AGENT_DOGFOOD_WORKER_LEASE_SCHEMA = 'zj-loop.real_agent_dogfood_worker_lease.v1' as const;
export const REAL_AGENT_DOGFOOD_WORKER_AGGREGATE_TYPE = 'real-agent-dogfood-worker' as const;

export type RealAgentDogfoodWorkerLeaseResult =
  | { status: 'acquired'; lease_id: string; worker_id: string; expires_at: string; revision: number }
  | { status: 'reused'; lease_id: string; worker_id: string; expires_at: string; revision: number }
  | { status: 'renewed'; lease_id: string; worker_id: string; expires_at: string; revision: number }
  | { status: 'blocked'; reason: 'worker-lease-expired' | 'worker-lease-mismatch' };

type LeaseFact = {
  schema: typeof REAL_AGENT_DOGFOOD_WORKER_LEASE_SCHEMA;
  network_id: string;
  execution_id: string;
  lease_id: string;
  worker_id: string;
  operation: 'acquired' | 'renewed';
  issued_at: string;
  expires_at: string;
};

const AGGREGATE = REAL_AGENT_DOGFOOD_WORKER_AGGREGATE_TYPE;

function expiry(now: string, ttl: number): string {
  if (!Number.isFinite(Date.parse(now)) || !Number.isInteger(ttl) || ttl <= 0) throw new Error('worker-lease-time-invalid');
  return new Date(Date.parse(now) + ttl).toISOString();
}

function latest(events: StateEvent[]): { fact: LeaseFact; revision: number } | null {
  const event = events.at(-1);
  if (!event) return null;
  const fact = event.payload as LeaseFact;
  if (fact.schema !== REAL_AGENT_DOGFOOD_WORKER_LEASE_SCHEMA || fact.network_id !== event.network_id || fact.execution_id !== event.aggregate_id) throw new Error('worker-lease-fact-invalid');
  return { fact, revision: event.revision };
}

async function readLease(input: { stateStore: SqliteStateStore; network_id: string; execution_id: string }) {
  return latest((await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: AGGREGATE, aggregate_id: input.execution_id })).events);
}

function event(input: { network_id: string; execution_id: string; lease_id: string; worker_id: string; operation: 'acquired' | 'renewed'; now: string; expires_at: string }) {
  const fact: LeaseFact = { schema: REAL_AGENT_DOGFOOD_WORKER_LEASE_SCHEMA, network_id: input.network_id, execution_id: input.execution_id, lease_id: input.lease_id, worker_id: input.worker_id, operation: input.operation, issued_at: input.now, expires_at: input.expires_at };
  return { event_id: `${input.lease_id}:${input.operation}:${input.now}:${randomUUID()}`, aggregate_type: AGGREGATE, aggregate_id: input.execution_id, event_type: 'real-agent-dogfood-worker.lease', occurred_at: input.now, payload: fact };
}

export async function acquireRealAgentDogfoodWorkerLease(input: { stateStore: SqliteStateStore; network_id: string; execution_id: string; worker_id: string; now?: string; ttl_ms?: number }): Promise<RealAgentDogfoodWorkerLeaseResult> {
  const now = input.now ?? new Date().toISOString();
  const ttl = input.ttl_ms ?? 30_000;
  const current = await readLease(input);
  if (current) {
    if (Date.parse(now) >= Date.parse(current.fact.expires_at)) return { status: 'blocked', reason: 'worker-lease-expired' };
    return { status: 'reused', lease_id: current.fact.lease_id, worker_id: current.fact.worker_id, expires_at: current.fact.expires_at, revision: current.revision };
  }
  const leaseId = `lease-${input.execution_id}-${randomUUID()}`;
  const result = await input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: await input.stateStore.getRevision(input.network_id), event: event({ network_id: input.network_id, execution_id: input.execution_id, lease_id: leaseId, worker_id: input.worker_id, operation: 'acquired', now, expires_at: expiry(now, ttl) }) });
  if (result.status === 'conflict') return { status: 'blocked', reason: 'worker-lease-mismatch' };
  return { status: 'acquired', lease_id: leaseId, worker_id: input.worker_id, expires_at: expiry(now, ttl), revision: result.revision as number };
}

export async function renewRealAgentDogfoodWorkerLease(input: { stateStore: SqliteStateStore; network_id: string; execution_id: string; lease_id: string; worker_id: string; expected_revision: number; now?: string; ttl_ms?: number }): Promise<RealAgentDogfoodWorkerLeaseResult> {
  const now = input.now ?? new Date().toISOString();
  const ttl = input.ttl_ms ?? 30_000;
  const current = await readLease(input);
  if (!current || current.fact.lease_id !== input.lease_id || current.fact.worker_id !== input.worker_id || Date.parse(now) >= Date.parse(current.fact.expires_at)) return { status: 'blocked', reason: current ? 'worker-lease-expired' : 'worker-lease-mismatch' };
  const expiresAt = expiry(now, ttl);
  const result = await input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: input.expected_revision, event: event({ network_id: input.network_id, execution_id: input.execution_id, lease_id: input.lease_id, worker_id: input.worker_id, operation: 'renewed', now, expires_at: expiresAt }) });
  if (result.status !== 'recorded') return { status: 'blocked', reason: 'worker-lease-mismatch' };
  return { status: 'renewed', lease_id: input.lease_id, worker_id: input.worker_id, expires_at: expiresAt, revision: result.revision as number };
}
