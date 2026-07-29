import type { PairingRequest } from './node-enrollment.js';
export type PairingLifecycleRecord = {
    type: 'pairing-requested';
    event_id: string;
    occurred_at: string;
    request: PairingRequest;
    request_digest: string;
} | {
    type: 'human-approved';
    event_id: string;
    occurred_at: string;
    request_id: string;
    request_digest: string;
    human_id: string;
    approved_capabilities: string[];
} | {
    type: 'pairing-rejected';
    event_id: string;
    occurred_at: string;
    request_id: string;
    request_digest: string;
    reason: string;
} | {
    type: 'pairing-expired';
    event_id: string;
    occurred_at: string;
    request_id: string;
    request_digest: string;
};
export type PairingRequestProjection = {
    request_id: string;
    network_id: string;
    node_id: string;
    request_digest: string;
    expires_at: string;
    requested_capabilities: string[];
    status: 'pending' | 'approved' | 'rejected' | 'expired' | 'projection-conflict';
    human_id: string | null;
    approved_capabilities: string[];
    reason: string | null;
};
export declare function projectPairingRequests(input: {
    network_id: string;
    records: PairingLifecycleRecord[];
    now?: string;
}): PairingRequestProjection[];
