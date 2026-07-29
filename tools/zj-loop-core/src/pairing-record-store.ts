import type { PairingLifecycleRecord } from './pairing-projection.js';

export type PairingRecordStore = {
  append(record: PairingLifecycleRecord): Promise<{ status: 'recorded' | 'duplicate'; record: PairingLifecycleRecord }>;
  list(network_id: string): Promise<PairingLifecycleRecord[]>;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createInMemoryPairingRecordStore(): PairingRecordStore {
  const records = new Map<string, PairingLifecycleRecord>();
  return {
    async append(record) {
      if (!record.event_id.trim()) throw new Error('pairing-event-id-required');
      const existing = records.get(record.event_id);
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(record)) throw new Error('pairing-event-conflict');
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
