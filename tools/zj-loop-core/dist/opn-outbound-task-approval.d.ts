import type { SqliteStateStore } from './sqlite-state-store.js';
import type { TransportEnvelope } from './transport-contract.js';
export declare const OPN_OUTBOUND_TASK_APPROVAL_SCHEMA: "zj-loop.opn_outbound_task_approval.v1";
export declare const OPN_OUTBOUND_TASK_APPROVAL_AGGREGATE: "opn-outbound-task-approval";
export type OutboundTaskApproval = {
    schema: typeof OPN_OUTBOUND_TASK_APPROVAL_SCHEMA;
    approval_id: string;
    network_id: string;
    envelope: TransportEnvelope;
    envelope_digest: string;
    task_artifact_id?: string;
    requested_at: string;
    expires_at: string;
    status: 'pending' | 'approved' | 'rejected' | 'published' | 'expired';
    human_id?: string;
    human_note?: string;
    decided_at?: string;
    published_at?: string;
    published_message_id?: string;
};
export declare function outboundTaskApprovalDigest(envelope: TransportEnvelope): string;
export declare function createOutboundTaskApproval(input: {
    network_id: string;
    envelope: TransportEnvelope;
    approval_id?: string;
    task_artifact_id?: string;
    requested_at?: string;
    expires_at?: string;
}): OutboundTaskApproval;
export declare function listOutboundTaskApprovals(input: {
    stateStore: Pick<SqliteStateStore, 'readEvents'>;
    network_id: string;
}): Promise<OutboundTaskApproval[]>;
export declare function recordOutboundTaskApproval(input: {
    stateStore: SqliteStateStore;
    approval: OutboundTaskApproval;
    expected_revision?: number;
    now?: string;
}): Promise<{
    status: 'recorded' | 'duplicate' | 'conflict';
    approval: OutboundTaskApproval;
}>;
export declare function appendOutboundTaskApprovalDecision(input: {
    stateStore: SqliteStateStore;
    approval: OutboundTaskApproval;
    decision: 'approved' | 'rejected';
    human_id: string;
    human_note: string;
    decided_at?: string;
}): Promise<{
    status: 'recorded' | 'duplicate' | 'conflict';
    approval: OutboundTaskApproval;
}>;
export declare function appendOutboundTaskPublished(input: {
    stateStore: SqliteStateStore;
    approval: OutboundTaskApproval;
    message_id: string;
    published_at?: string;
}): Promise<{
    status: 'recorded' | 'duplicate' | 'conflict';
    approval: OutboundTaskApproval;
}>;
