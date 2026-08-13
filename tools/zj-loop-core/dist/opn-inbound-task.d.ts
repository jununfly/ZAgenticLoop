import type { SqliteStateStore } from './sqlite-state-store.js';
import type { TransportEnvelope } from './transport-contract.js';
export declare const OPN_INBOUND_TASK_SCHEMA: "zj-loop.opn_inbound_task.v1";
export declare const OPN_INBOUND_TASK_AGGREGATE: "opn-inbound-task";
export declare const DEFAULT_INBOUND_PROCESSING_LEASE_MS: number;
export type InboundTaskStatus = 'pending-human-approval' | 'admitted' | 'processing' | 'completed' | 'failed' | 'blocked' | 'expired' | 'cancelled';
export type InboundTask = {
    schema: typeof OPN_INBOUND_TASK_SCHEMA;
    inbound_id: string;
    network_id: string;
    envelope: TransportEnvelope;
    status: InboundTaskStatus;
    received_at: string;
    human_note?: string;
    human_id?: string;
    decided_at?: string;
    selected_agent_id?: string;
    admission_reason?: string;
    processing_started_at?: string;
    processing_lease_expires_at?: string;
};
export declare function createInboundTask(input: {
    network_id: string;
    envelope: TransportEnvelope;
    received_at?: string;
}): InboundTask;
export declare function listInboundTasks(input: {
    stateStore: Pick<SqliteStateStore, 'readEvents'>;
    network_id: string;
    now?: string;
}): Promise<InboundTask[]>;
export declare function expireInboundTasks(input: {
    stateStore: SqliteStateStore;
    network_id: string;
    now?: string;
}): Promise<{
    expired: number;
}>;
export declare function persistInboundTask(input: {
    stateStore: SqliteStateStore;
    inbound: InboundTask;
    now?: string;
}): Promise<{
    status: 'recorded' | 'duplicate' | 'conflict';
    inbound: InboundTask;
}>;
export declare function appendInboundTaskDecision(input: {
    stateStore: SqliteStateStore;
    inbound: InboundTask;
    decision: 'approved' | 'rejected';
    human_id: string;
    human_note: string;
    selected_agent_id?: string;
    decided_at?: string;
}): Promise<{
    status: 'recorded' | 'duplicate' | 'conflict';
    inbound: InboundTask;
}>;
export declare function appendInboundTaskLifecycle(input: {
    stateStore: SqliteStateStore;
    inbound: InboundTask;
    status: 'admitted' | 'processing' | 'completed' | 'failed';
    reason?: string;
    now?: string;
    processing_lease_ms?: number;
}): Promise<{
    status: 'recorded' | 'duplicate' | 'conflict';
    inbound: InboundTask;
}>;
export declare function recoverExpiredInboundTasks(input: {
    stateStore: SqliteStateStore;
    network_id: string;
    now?: string;
}): Promise<{
    recovered: number;
}>;
