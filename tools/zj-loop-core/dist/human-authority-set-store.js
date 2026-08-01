import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { verifyHumanSignature } from './human-signer.js';
export const HUMAN_AUTHORITY_SET_SCHEMA = 'zj-loop.human_authority_set.v1';
export const HUMAN_AUTHORITY_SET_AGGREGATE_TYPE = 'human-authority-set';
export const HUMAN_AUTHORITY_SET_AGGREGATE_ID = 'network';
export const HUMAN_AUTHORITY_SET_EVENT_TYPE = 'human-authority-set.initialized';
function digest(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('human-authority-set-canonicalization-invalid');
    return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}
function unsigned(value) { const { canonical_payload_digest: _, signature: __, ...payload } = value; return payload; }
function payloadBytes(value) { return new TextEncoder().encode(canonicalize(value)); }
export function humanAuthoritySetDigest(active) { return digest(active); }
export async function createHumanAuthoritySetInitialization(input) {
    const owner = await input.signer.getPublicIdentity();
    const payload = { schema: HUMAN_AUTHORITY_SET_SCHEMA, network_id: input.network_id, mutation_id: input.mutation_id, action: 'initialize', owner, signer_fingerprint: owner.public_key_fingerprint, reason: input.reason, occurred_at: input.occurred_at, expected_revision: input.expected_revision };
    return { ...payload, canonical_payload_digest: digest(payload), signature: await input.signer.sign({ payload: payloadBytes(payload) }) };
}
function validate(value) {
    return value.schema === HUMAN_AUTHORITY_SET_SCHEMA && value.action === 'initialize' && value.signer_fingerprint === value.owner.public_key_fingerprint && Number.isInteger(value.expected_revision) && value.expected_revision >= 1 && value.canonical_payload_digest === digest(unsigned(value)) && verifyHumanSignature({ identity: value.owner, payload: payloadBytes(unsigned(value)), signature: value.signature });
}
export async function recordHumanAuthoritySetInitialization(input) {
    const current = await readHumanAuthoritySet({ stateStore: input.stateStore, network_id: input.initialization.network_id });
    if (!validate(input.initialization))
        return { status: 'blocked', snapshot: current, reason: 'authority-set-initialization-invalid' };
    const existingEvents = await input.stateStore.readEvents({ network_id: input.initialization.network_id, aggregate_type: HUMAN_AUTHORITY_SET_AGGREGATE_TYPE, aggregate_id: HUMAN_AUTHORITY_SET_AGGREGATE_ID });
    const existing = existingEvents.events.find((event) => event.payload.mutation_id === input.initialization.mutation_id);
    if (existing) {
        const existingInitialization = existing.payload;
        return existingInitialization.canonical_payload_digest === input.initialization.canonical_payload_digest
            ? { status: 'duplicate', snapshot: current }
            : { status: 'conflict', snapshot: current, reason: 'authority-set-mutation-id-conflict' };
    }
    if (current.active.length > 0)
        return { status: 'conflict', snapshot: current, reason: 'authority-set-already-initialized' };
    if (input.initialization.expected_revision !== current.revision)
        return { status: 'conflict', snapshot: current, reason: 'revision-mismatch' };
    const append = await input.stateStore.appendEvent({ network_id: input.initialization.network_id, expected_revision: input.initialization.expected_revision, event: { event_id: `human-authority-set:${input.initialization.mutation_id}`, aggregate_type: HUMAN_AUTHORITY_SET_AGGREGATE_TYPE, aggregate_id: HUMAN_AUTHORITY_SET_AGGREGATE_ID, event_type: HUMAN_AUTHORITY_SET_EVENT_TYPE, occurred_at: input.initialization.occurred_at, payload: input.initialization }, now: input.now });
    if (append.status === 'duplicate')
        return { status: 'duplicate', snapshot: { ...current, revision: append.revision, active: [input.initialization.owner], digest: humanAuthoritySetDigest([input.initialization.owner]) } };
    if (append.status === 'conflict')
        return { status: 'conflict', snapshot: current, reason: append.reason };
    const active = [input.initialization.owner];
    return { status: 'recorded', snapshot: { network_id: input.initialization.network_id, revision: append.revision, active, digest: humanAuthoritySetDigest(active) } };
}
export async function readHumanAuthoritySet(input) {
    const events = await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: HUMAN_AUTHORITY_SET_AGGREGATE_TYPE, aggregate_id: HUMAN_AUTHORITY_SET_AGGREGATE_ID });
    let active = [];
    for (const event of events.events) {
        const value = event.payload;
        if (!validate(value))
            throw new Error('human-authority-set-history-invalid');
        if (active.length > 0)
            throw new Error('human-authority-set-history-duplicate-initialization');
        active = [value.owner];
    }
    return { network_id: input.network_id, revision: events.snapshot_revision, digest: humanAuthoritySetDigest(active), active };
}
