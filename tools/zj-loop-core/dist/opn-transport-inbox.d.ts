import type { OpnMessageReadModel } from './opn-message-read-model.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import type { TransportAdapter } from './transport-contract.js';
export declare const OPN_INBOX_AGGREGATE_TYPE: "opn-inbox";
export declare const OPN_INBOX_RECEIVED_EVENT_TYPE: "opn.inbox.message.received";
export declare const OPN_INBOX_ACKNOWLEDGED_EVENT_TYPE: "opn.inbox.message.acknowledged";
export declare const OPN_INBOX_EVENT_SCHEMA: "zj-loop.opn_inbox_event.v1";
type InboxStateStore = Pick<SqliteStateStore, 'appendEvent' | 'getRevision' | 'readEvents'> & Partial<Pick<SqliteStateStore, 'runAtomic'>>;
export type OpnInboxResult = {
    status: 'empty';
    side_effects_executed: false;
} | {
    status: 'acknowledged' | 'duplicate';
    message_id: string;
    envelope_digest: string;
    side_effects_executed: false;
} | {
    status: 'ack-pending';
    message_id: string;
    envelope_digest: string;
    reason: string;
    side_effects_executed: false;
} | {
    status: 'blocked';
    message_id?: string;
    reason: string;
    side_effects_executed: false;
} | {
    status: 'outcome-uncertain';
    message_id: string;
    envelope_digest: string;
    reason: string;
    side_effects_executed: false;
};
export declare function receiveAndPersistOpnMessage(input: {
    transport: Pick<TransportAdapter, 'receive' | 'acknowledge'>;
    session_id: string;
    stateStore: InboxStateStore;
    network_id: string;
    node_id: string;
    expected_revision: number;
    now: string;
}): Promise<OpnInboxResult>;
export declare function projectOpnInbox(input: {
    stateStore: InboxStateStore;
    network_id: string;
    node_id: string;
}): Promise<OpnMessageReadModel[]>;
export {};
