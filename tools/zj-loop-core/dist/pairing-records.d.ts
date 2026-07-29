import { type PairingApproval, type PairingRequest } from './node-enrollment.js';
import type { PairingLifecycleRecord } from './pairing-projection.js';
export declare function createPairingRequestedRecord(input: {
    request: PairingRequest;
    occurred_at?: string;
}): Extract<PairingLifecycleRecord, {
    type: 'pairing-requested';
}>;
export declare function createPairingApprovedRecord(input: {
    request: {
        request_id: string;
        network_id: string;
        node_id: string;
        request_digest: string;
    };
    approval: Pick<PairingApproval, 'request_id' | 'network_id' | 'node_id' | 'human_id' | 'approved_capabilities' | 'approved_at'>;
}): Extract<PairingLifecycleRecord, {
    type: 'human-approved';
}>;
export declare function createPairingRejectedRecord(input: {
    request: {
        request_id: string;
        network_id: string;
        node_id: string;
        request_digest: string;
    };
    human_id: string;
    rejected_at: string;
    reason: string;
}): Extract<PairingLifecycleRecord, {
    type: 'pairing-rejected';
}>;
export declare function createPairingExpiredRecord(input: {
    request: {
        request_id: string;
        network_id: string;
        node_id: string;
        request_digest: string;
    };
    expired_at: string;
}): Extract<PairingLifecycleRecord, {
    type: 'pairing-expired';
}>;
