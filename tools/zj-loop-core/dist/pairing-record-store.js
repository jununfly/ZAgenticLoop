import { projectPairingRequests } from './pairing-projection.js';
import { canonicalizeJson } from './sqlite-state-store.js';
function clone(value) {
    return structuredClone(value);
}
export function pairingRecordsEquivalent(left, right) {
    if (left.type !== right.type || left.event_id !== right.event_id || left.network_id !== right.network_id)
        return false;
    if (left.type === 'pairing-requested' && right.type === 'pairing-requested') {
        const normalize = (record) => {
            const { certificate_pem: _certificatePem, ...identity } = record.request.identity;
            const { occurred_at: _occurredAt, ...event } = record;
            return { ...event, request: { ...record.request, identity } };
        };
        return canonicalizeJson(normalize(left)) === canonicalizeJson(normalize(right));
    }
    return canonicalizeJson(left) === canonicalizeJson(right);
}
export function createInMemoryPairingRecordStore() {
    const records = new Map();
    return {
        async append(record) {
            if (!record.event_id.trim())
                throw new Error('pairing-event-id-required');
            const existing = records.get(record.event_id);
            if (existing) {
                if (!pairingRecordsEquivalent(existing, record))
                    throw new Error('pairing-event-conflict');
                return { status: 'duplicate', record: clone(existing) };
            }
            records.set(record.event_id, clone(record));
            return { status: 'recorded', record: clone(record) };
        },
        async appendIfPending(input) {
            const storedRecords = [...records.values()];
            const projection = projectPairingRequests({ network_id: input.record.network_id, records: storedRecords, ...(input.now ? { now: input.now } : {}) }).find((item) => item.request_id === input.request_id);
            if (!projection || projection.request_digest !== input.request_digest || projection.status !== 'pending') {
                const existing = storedRecords.find((record) => record.event_id === input.record.event_id);
                if (existing && pairingRecordsEquivalent(existing, input.record))
                    return { status: 'duplicate', record: clone(existing) };
                throw new Error('pairing-state-conflict');
            }
            return this.append(input.record);
        },
        async list(network_id) {
            return [...records.values()].filter((record) => {
                return record.network_id === network_id;
            }).map(clone);
        },
    };
}
