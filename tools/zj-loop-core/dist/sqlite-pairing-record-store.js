import { canonicalizeJson } from './sqlite-state-store.js';
import { projectPairingRequests } from './pairing-projection.js';
export const SQLITE_PAIRING_RECORD_STORE_SCHEMA = 'zj-loop.sqlite_pairing_record_store.v1';
function requireText(value, error) {
    if (!value.trim())
        throw new Error(error);
    return value;
}
function clone(value) {
    return structuredClone(value);
}
function parseRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('pairing-record-invalid');
    const record = value;
    if (typeof record.type !== 'string' || typeof record.event_id !== 'string' || typeof record.occurred_at !== 'string' || typeof record.network_id !== 'string')
        throw new Error('pairing-record-invalid');
    if (!['pairing-requested', 'human-approved', 'pairing-rejected', 'pairing-expired'].includes(record.type))
        throw new Error('pairing-record-invalid');
    return clone(value);
}
function eventFor(record) {
    const requestId = record.type === 'pairing-requested' ? record.request.request_id : record.request_id;
    return {
        event_id: record.event_id,
        aggregate_type: 'pairing',
        aggregate_id: requestId,
        event_type: record.type,
        occurred_at: record.occurred_at,
        payload: record,
    };
}
function sameRecord(left, right) {
    return canonicalizeJson(left) === canonicalizeJson(right);
}
export function createSqlitePairingRecordStore(input) {
    if (!input.stateStore)
        throw new Error('state-store-required');
    async function records(network_id) {
        requireText(network_id, 'network-id-required');
        const snapshot = await input.stateStore.readEvents({ network_id, aggregate_type: 'pairing' });
        return snapshot.events.map((event) => parseRecord(event.payload));
    }
    async function existingEvent(network_id, event_id) {
        const found = (await records(network_id)).find((record) => record.event_id === event_id);
        return found ? clone(found) : null;
    }
    async function append(record) {
        requireText(record.network_id, 'network-id-required');
        requireText(record.event_id, 'pairing-event-id-required');
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const snapshot = await input.stateStore.readEvents({ network_id: record.network_id, aggregate_type: 'pairing' });
            const existing = snapshot.events.find((event) => event.event_id === record.event_id);
            if (existing) {
                const stored = parseRecord(existing.payload);
                if (!sameRecord(stored, record))
                    throw new Error('pairing-event-conflict');
                return { status: 'duplicate', record: clone(stored) };
            }
            const result = await input.stateStore.appendEvent({ network_id: record.network_id, expected_revision: snapshot.snapshot_revision, event: eventFor(record) });
            if (result.status === 'recorded')
                return { status: 'recorded', record: clone(record) };
            if (result.status === 'duplicate') {
                const stored = await existingEvent(record.network_id, record.event_id);
                if (stored && sameRecord(stored, record))
                    return { status: 'duplicate', record: stored };
                throw new Error('pairing-event-conflict');
            }
            if (result.reason === 'event-id-reused')
                throw new Error('pairing-event-conflict');
        }
        throw new Error('pairing-state-conflict');
    }
    async function appendIfPending(inputValue) {
        requireText(inputValue.request_id, 'pairing-request-id-required');
        requireText(inputValue.request_digest, 'pairing-request-digest-required');
        const network_id = inputValue.record.network_id;
        requireText(network_id, 'network-id-required');
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const stored = await records(network_id);
            const existing = stored.find((record) => record.event_id === inputValue.record.event_id);
            if (existing) {
                if (!sameRecord(existing, inputValue.record))
                    throw new Error('pairing-event-conflict');
                return { status: 'duplicate', record: clone(existing) };
            }
            const projection = projectPairingRequests({ network_id, records: stored, ...(inputValue.now ? { now: inputValue.now } : {}) }).find((item) => item.request_id === inputValue.request_id);
            if (!projection || projection.request_digest !== inputValue.request_digest || projection.status !== 'pending')
                throw new Error('pairing-state-conflict');
            const snapshot = await input.stateStore.readEvents({ network_id });
            const result = await input.stateStore.appendEvent({ network_id, expected_revision: snapshot.snapshot_revision, event: eventFor(inputValue.record) });
            if (result.status === 'recorded')
                return { status: 'recorded', record: clone(inputValue.record) };
            if (result.status === 'duplicate') {
                const duplicate = await existingEvent(network_id, inputValue.record.event_id);
                if (duplicate && sameRecord(duplicate, inputValue.record))
                    return { status: 'duplicate', record: duplicate };
                throw new Error('pairing-event-conflict');
            }
            if (result.reason === 'event-id-reused')
                throw new Error('pairing-event-conflict');
        }
        throw new Error('pairing-state-conflict');
    }
    return { append, appendIfPending, list: records };
}
