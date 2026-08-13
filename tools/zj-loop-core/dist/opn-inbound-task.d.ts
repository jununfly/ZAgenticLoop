import type { SqliteStateStore } from './sqlite-state-store.js';
import type { TransportEnvelope } from './transport-contract.js';
export declare const OPN_INBOUND_TASK_SCHEMA: "zj-loop.opn_inbound_task.v1";
export declare const OPN_INBOUND_TASK_AGGREGATE: "opn-inbound-task";
export type InboundTaskStatus = 'pending-human-approval' | 'admitted' | 'blocked' | 'expired' | 'cancelled';
export type InboundTask = {
    schema: typeof OPN_INBOUND_TASK_SCHEMA;
    inbound_id: string;
    network_id: string;
    envelope: TransportEnvelope;
    status: InboundTaskStatus;
    received_at: string;
    human_note?: string;
    selected_agent_id?: string;
    admission_reason?: string;
};
export declare function createInboundTask(input: {
    network_id: string;
    envelope: TransportEnvelope;
    received_at?: string;
}): InboundTask;
export declare function listInboundTasks(input: {
    stateStore: Pick<SqliteStateStore, 'readEvents'>;
    network_id: string;
}): Promise<InboundTask[]>;
export declare function persistInboundTask(input: {
    stateStore: SqliteStateStore;
    inbound: InboundTask;
    now?: string;
}): Promise<{
    status: 'recorded' | 'duplicate' | 'conflict';
    inbound: InboundTask;
}>;
