import { randomUUID } from 'node:crypto';
import { realAgentDogfoodCoordinatorLeaseDigest } from './real-agent-dogfood-digests.js';
export const REAL_AGENT_DOGFOOD_COORDINATOR_LEASE_SCHEMA = 'zj-loop.real_agent_dogfood_coordinator_lease.v1';
export const REAL_AGENT_DOGFOOD_COORDINATOR_AGGREGATE_TYPE = 'real-agent-dogfood-graph-coordinator';
function expiry(now, ttl) {
    if (!Number.isFinite(Date.parse(now)) || !Number.isInteger(ttl) || ttl <= 0)
        throw new Error('coordinator-lease-time-invalid');
    return new Date(Date.parse(now) + ttl).toISOString();
}
function latest(events) {
    const event = events.at(-1);
    if (!event)
        return null;
    const fact = event.payload;
    if (fact.schema !== REAL_AGENT_DOGFOOD_COORDINATOR_LEASE_SCHEMA || fact.network_id !== event.network_id || fact.execution_id !== event.aggregate_id || !['acquired', 'renewed', 'released', 'abandoned'].includes(fact.operation) || !fact.human_id.trim() || !fact.coordinator_id.trim() || !fact.session_id.trim() || !fact.execution_binding_digest || !fact.coordinator_lease_digest)
        throw new Error('coordinator-lease-fact-invalid');
    return { fact, revision: event.revision };
}
async function readLease(input) {
    return latest((await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: REAL_AGENT_DOGFOOD_COORDINATOR_AGGREGATE_TYPE, aggregate_id: input.execution_id })).events);
}
function leaseEvent(input) {
    const fact = { schema: REAL_AGENT_DOGFOOD_COORDINATOR_LEASE_SCHEMA, network_id: input.network_id, execution_id: input.execution_id, lease_id: input.lease_id, human_id: input.human_id, coordinator_id: input.coordinator_id, session_id: input.session_id, execution_binding_digest: input.execution_binding_digest, coordinator_lease_digest: realAgentDogfoodCoordinatorLeaseDigest({ execution_binding_digest: input.execution_binding_digest, execution_id: input.execution_id, session_id: input.session_id, lease_id: input.lease_id, human_id: input.human_id, coordinator_id: input.coordinator_id, expires_at: input.expires_at }), operation: input.operation, issued_at: input.now, expires_at: input.expires_at };
    return { event_id: `${input.lease_id}:${input.operation}:${input.now}:${randomUUID()}`, aggregate_type: REAL_AGENT_DOGFOOD_COORDINATOR_AGGREGATE_TYPE, aggregate_id: input.execution_id, event_type: 'real-agent-dogfood-graph-coordinator.lease', occurred_at: input.now, payload: fact };
}
export async function acquireRealAgentDogfoodCoordinatorLease(input) {
    if (!input.human_id.trim() || !input.coordinator_id.trim() || !input.session_id.trim())
        throw new Error('coordinator-lease-identity-required');
    const now = input.now ?? new Date().toISOString();
    const ttl = input.ttl_ms ?? 30_000;
    const current = await readLease(input);
    if (current && current.fact.operation !== 'released' && current.fact.operation !== 'abandoned') {
        if (Date.parse(now) >= Date.parse(current.fact.expires_at))
            return { status: 'blocked', reason: 'coordinator-lease-expired' };
        if (current.fact.human_id !== input.human_id || current.fact.coordinator_id !== input.coordinator_id || current.fact.session_id !== input.session_id || current.fact.execution_binding_digest !== input.execution_binding_digest)
            return { status: 'blocked', reason: 'coordinator-lease-mismatch' };
        return { status: 'reused', lease_id: current.fact.lease_id, human_id: current.fact.human_id, coordinator_id: current.fact.coordinator_id, coordinator_lease_digest: current.fact.coordinator_lease_digest, expires_at: current.fact.expires_at, revision: current.revision };
    }
    const leaseId = `coordinator-lease-${input.execution_id}-${randomUUID()}`;
    const expiresAt = expiry(now, ttl);
    const result = await input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: await input.stateStore.getRevision(input.network_id), event: leaseEvent({ network_id: input.network_id, execution_id: input.execution_id, lease_id: leaseId, human_id: input.human_id, coordinator_id: input.coordinator_id, session_id: input.session_id, execution_binding_digest: input.execution_binding_digest, operation: 'acquired', now, expires_at: expiresAt }) });
    if (result.status === 'conflict')
        return { status: 'blocked', reason: 'coordinator-lease-mismatch' };
    return { status: 'acquired', lease_id: leaseId, human_id: input.human_id, coordinator_id: input.coordinator_id, coordinator_lease_digest: realAgentDogfoodCoordinatorLeaseDigest({ execution_binding_digest: input.execution_binding_digest, execution_id: input.execution_id, session_id: input.session_id, lease_id: leaseId, human_id: input.human_id, coordinator_id: input.coordinator_id, expires_at: expiresAt }), expires_at: expiresAt, revision: result.revision };
}
export async function renewRealAgentDogfoodCoordinatorLease(input) {
    const now = input.now ?? new Date().toISOString();
    const ttl = input.ttl_ms ?? 30_000;
    const current = await readLease(input);
    if (!current || current.fact.lease_id !== input.lease_id || current.fact.human_id !== input.human_id || current.fact.coordinator_id !== input.coordinator_id)
        return { status: 'blocked', reason: 'coordinator-lease-mismatch' };
    if (current.fact.operation === 'released')
        return { status: 'blocked', reason: 'coordinator-lease-released' };
    if (current.fact.operation === 'abandoned' || Date.parse(now) >= Date.parse(current.fact.expires_at))
        return { status: 'blocked', reason: current.fact.operation === 'abandoned' ? 'coordinator-lease-abandoned' : 'coordinator-lease-expired' };
    const expiresAt = expiry(now, ttl);
    const result = await input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: input.expected_revision, event: leaseEvent({ network_id: input.network_id, execution_id: input.execution_id, lease_id: input.lease_id, human_id: input.human_id, coordinator_id: input.coordinator_id, session_id: current.fact.session_id, execution_binding_digest: current.fact.execution_binding_digest, operation: 'renewed', now, expires_at: expiresAt }) });
    if (result.status !== 'recorded')
        return { status: 'blocked', reason: 'coordinator-lease-mismatch' };
    return { status: 'renewed', lease_id: input.lease_id, human_id: input.human_id, coordinator_id: input.coordinator_id, coordinator_lease_digest: realAgentDogfoodCoordinatorLeaseDigest({ execution_binding_digest: current.fact.execution_binding_digest, execution_id: input.execution_id, session_id: current.fact.session_id, lease_id: input.lease_id, human_id: input.human_id, coordinator_id: input.coordinator_id, expires_at: expiresAt }), expires_at: expiresAt, revision: result.revision };
}
export async function releaseRealAgentDogfoodCoordinatorLease(input) {
    const now = input.now ?? new Date().toISOString();
    const current = await readLease(input);
    if (!current || current.fact.lease_id !== input.lease_id || current.fact.human_id !== input.human_id || current.fact.coordinator_id !== input.coordinator_id)
        return { status: 'blocked', reason: 'coordinator-lease-mismatch' };
    if (current.fact.operation === 'released')
        return { status: 'blocked', reason: 'coordinator-lease-released' };
    if (current.fact.operation === 'abandoned' || Date.parse(now) >= Date.parse(current.fact.expires_at))
        return { status: 'blocked', reason: current.fact.operation === 'abandoned' ? 'coordinator-lease-abandoned' : 'coordinator-lease-expired' };
    const result = await input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: input.expected_revision, event: leaseEvent({ network_id: input.network_id, execution_id: input.execution_id, lease_id: input.lease_id, human_id: input.human_id, coordinator_id: input.coordinator_id, session_id: current.fact.session_id, execution_binding_digest: current.fact.execution_binding_digest, operation: 'released', now, expires_at: current.fact.expires_at }) });
    if (result.status !== 'recorded')
        return { status: 'blocked', reason: 'coordinator-lease-mismatch' };
    return { status: 'released', lease_id: input.lease_id, human_id: input.human_id, coordinator_id: input.coordinator_id, coordinator_lease_digest: current.fact.coordinator_lease_digest, revision: result.revision };
}
export async function abandonRealAgentDogfoodCoordinatorLease(input) {
    const now = input.now ?? new Date().toISOString();
    const current = await readLease(input);
    if (!current || current.fact.lease_id !== input.lease_id || current.fact.human_id !== input.human_id || current.fact.coordinator_id !== input.coordinator_id)
        return { status: 'blocked', reason: 'coordinator-lease-mismatch' };
    if (current.fact.operation === 'released')
        return { status: 'blocked', reason: 'coordinator-lease-released' };
    if (current.fact.operation === 'abandoned')
        return { status: 'blocked', reason: 'coordinator-lease-abandoned' };
    if (Date.parse(now) < Date.parse(current.fact.expires_at))
        return { status: 'blocked', reason: 'coordinator-lease-expired' };
    const result = await input.stateStore.appendEvent({ network_id: input.network_id, expected_revision: input.expected_revision, event: leaseEvent({ network_id: input.network_id, execution_id: input.execution_id, lease_id: input.lease_id, human_id: input.human_id, coordinator_id: input.coordinator_id, session_id: current.fact.session_id, execution_binding_digest: current.fact.execution_binding_digest, operation: 'abandoned', now, expires_at: current.fact.expires_at }) });
    if (result.status !== 'recorded')
        return { status: 'blocked', reason: 'coordinator-lease-mismatch' };
    return { status: 'abandoned', lease_id: input.lease_id, human_id: input.human_id, coordinator_id: input.coordinator_id, coordinator_lease_digest: current.fact.coordinator_lease_digest, revision: result.revision };
}
