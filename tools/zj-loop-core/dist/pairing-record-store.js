function clone(value) {
    return structuredClone(value);
}
export function createInMemoryPairingRecordStore() {
    const records = new Map();
    return {
        async append(record) {
            if (!record.event_id.trim())
                throw new Error('pairing-event-id-required');
            const existing = records.get(record.event_id);
            if (existing) {
                if (JSON.stringify(existing) !== JSON.stringify(record))
                    throw new Error('pairing-event-conflict');
                return { status: 'duplicate', record: clone(existing) };
            }
            records.set(record.event_id, clone(record));
            return { status: 'recorded', record: clone(record) };
        },
        async list(network_id) {
            return [...records.values()].filter((record) => {
                return record.network_id === network_id;
            }).map(clone);
        },
    };
}
