import { randomUUID } from 'node:crypto';
export const REAL_AGENT_DOGFOOD_WORKER_LEASE_SCHEMA = 'zj-loop.real_agent_dogfood_worker_lease.v1';
export const REAL_AGENT_DOGFOOD_WORKER_AGGREGATE_TYPE = 'real-agent-dogfood-worker';
const AGGREGATE = REAL_AGENT_DOGFOOD_WORKER_AGGREGATE_TYPE;
function expiry(now, ttl) {
    if (!Number.isFinite(Date.parse(now)) || !Number.isInteger(ttl) || ttl <= 0)
        throw new Error('worker-lease-time-invalid');
    return new Date(Date.parse(now) + ttl).toISOString();
}
function latest(events) {
    const event = events.at(-1);
    if (!event)
        return null;
    const fact = event.payload;
    if (fact.schema !== REAL_AGENT_DOGFOOD_WORKER_LEASE_SCHEMA || fact.network_id !== event.network_id || fact.execution_id !== event.aggregate_id || !['acquired', 'renewed', 'released', 'abandoned'].includes(fact.operation))
        throw new Error('worker-lease-fact-invalid');
    return { fact, revision: event.revision };
}
async function readLease(input) {
    return latest((await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: AGGREGATE, aggregate_id: input.execution_id })).events);
}
function event(input) {
    const fact = { schema: REAL_AGENT_DOGFOOD_WORKER_LEASE_SCHEMA, network_id: input.network_id, execution_id: input.execution_id, lease_id: input.lease_id, worker_id: input.worker_id, operation: input.operation, issued_at: input.now, expires_at: input.expires_at };
    return { event_id: `${input.lease_id}:${input.operation}:${input.now}:${randomUUID()}`, aggregate_type: AGGREGATE, aggregate_id: input.execution_id, event_type: 'real-agent-dogfood-worker.lease', occurred_at: input.now, payload: fact };
}
export async function acquireRealAgentDogfoodWorkerLease(input) {
    const now = input.now ?? new Date().toISOString();
    const ttl = input.ttl_ms ?? 30_000;
    const current = await readLease(input);
    if (current) {
        if (current.fact.operation === 'released') {
            // A terminal lease fact permits a new worker lease for the same execution.
        }
        else if (current.fact.operation === 'abandoned') {
            // An abandoned lease fact also permits a new worker lease for the same execution.
        }
        else {
            if (Date.parse(now) >= Date.parse(current.fact.expires_at))
                return { status: 'blocked', reason: 'worker-lease-expired' };
            return { status: 'reused', lease_id: current.fact.lease_id, worker_id: current.fact.worker_id, expires_at: current.fact.expires_at, revision: current.revision };
        }
    }
    const leaseId = `lease-${input.execution_id}-${randomUUID()}`;
    const result = await input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: await input.stateStore.getRevision(input.network_id), event: event({ network_id: input.network_id, execution_id: input.execution_id, lease_id: leaseId, worker_id: input.worker_id, operation: 'acquired', now, expires_at: expiry(now, ttl) }) });
    if (result.status === 'conflict')
        return { status: 'blocked', reason: 'worker-lease-mismatch' };
    return { status: 'acquired', lease_id: leaseId, worker_id: input.worker_id, expires_at: expiry(now, ttl), revision: result.revision };
}
export async function renewRealAgentDogfoodWorkerLease(input) {
    const now = input.now ?? new Date().toISOString();
    const ttl = input.ttl_ms ?? 30_000;
    const current = await readLease(input);
    if (!current || current.fact.lease_id !== input.lease_id || current.fact.worker_id !== input.worker_id)
        return { status: 'blocked', reason: 'worker-lease-mismatch' };
    if (current.fact.operation === 'released')
        return { status: 'blocked', reason: 'worker-lease-released' };
    if (current.fact.operation === 'abandoned' || Date.parse(now) >= Date.parse(current.fact.expires_at))
        return { status: 'blocked', reason: current.fact.operation === 'abandoned' ? 'worker-lease-abandoned' : 'worker-lease-expired' };
    const expiresAt = expiry(now, ttl);
    const result = await input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: input.expected_revision, event: event({ network_id: input.network_id, execution_id: input.execution_id, lease_id: input.lease_id, worker_id: input.worker_id, operation: 'renewed', now, expires_at: expiresAt }) });
    if (result.status !== 'recorded')
        return { status: 'blocked', reason: 'worker-lease-mismatch' };
    return { status: 'renewed', lease_id: input.lease_id, worker_id: input.worker_id, expires_at: expiresAt, revision: result.revision };
}
export async function releaseRealAgentDogfoodWorkerLease(input) {
    const now = input.now ?? new Date().toISOString();
    const current = await readLease(input);
    if (!current || current.fact.lease_id !== input.lease_id || current.fact.worker_id !== input.worker_id)
        return { status: 'blocked', reason: 'worker-lease-mismatch' };
    if (current.fact.operation === 'released')
        return { status: 'blocked', reason: 'worker-lease-released' };
    if (current.fact.operation === 'abandoned' || Date.parse(now) >= Date.parse(current.fact.expires_at))
        return { status: 'blocked', reason: current.fact.operation === 'abandoned' ? 'worker-lease-abandoned' : 'worker-lease-expired' };
    const result = await input.stateStore.appendEvent({
        network_id: input.network_id,
        expected_revision: input.expected_revision,
        event: event({ network_id: input.network_id, execution_id: input.execution_id, lease_id: input.lease_id, worker_id: input.worker_id, operation: 'released', now, expires_at: current.fact.expires_at }),
    });
    if (result.status !== 'recorded')
        return { status: 'blocked', reason: 'worker-lease-mismatch' };
    return { status: 'released', lease_id: input.lease_id, worker_id: input.worker_id, revision: result.revision };
}
export async function abandonRealAgentDogfoodWorkerLease(input) {
    const now = input.now ?? new Date().toISOString();
    const current = await readLease(input);
    if (!current || current.fact.lease_id !== input.lease_id || current.fact.worker_id !== input.worker_id)
        return { status: 'blocked', reason: 'worker-lease-mismatch' };
    if (current.fact.operation === 'released')
        return { status: 'blocked', reason: 'worker-lease-released' };
    if (current.fact.operation === 'abandoned')
        return { status: 'blocked', reason: 'worker-lease-abandoned' };
    if (Date.parse(now) < Date.parse(current.fact.expires_at))
        return { status: 'blocked', reason: 'worker-lease-expired' };
    const result = await input.stateStore.appendEvent({
        network_id: input.network_id,
        expected_revision: input.expected_revision,
        event: event({ network_id: input.network_id, execution_id: input.execution_id, lease_id: input.lease_id, worker_id: input.worker_id, operation: 'abandoned', now, expires_at: current.fact.expires_at }),
    });
    if (result.status !== 'recorded')
        return { status: 'blocked', reason: 'worker-lease-mismatch' };
    return { status: 'abandoned', lease_id: input.lease_id, worker_id: input.worker_id, revision: result.revision };
}
