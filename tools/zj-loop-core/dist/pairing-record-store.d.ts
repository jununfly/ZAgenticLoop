import type { PairingLifecycleRecord } from './pairing-projection.js';
export type PairingRecordStore = {
    append(record: PairingLifecycleRecord): Promise<{
        status: 'recorded' | 'duplicate';
        record: PairingLifecycleRecord;
    }>;
    appendIfPending(input: {
        request_id: string;
        request_digest: string;
        record: Exclude<PairingLifecycleRecord, {
            type: 'pairing-requested';
        }>;
        now?: string;
    }): Promise<{
        status: 'recorded' | 'duplicate';
        record: PairingLifecycleRecord;
    }>;
    list(network_id: string): Promise<PairingLifecycleRecord[]>;
};
export declare function createInMemoryPairingRecordStore(): PairingRecordStore;
