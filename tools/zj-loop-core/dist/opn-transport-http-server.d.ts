import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SqliteStateStore } from './sqlite-state-store.js';
import type { CredentialVerifier } from './sqlite-state-store-server.js';
export declare const OPN_TRANSPORT_HTTP_SCHEMA: "zj-loop.opn_transport_http.v1";
export declare const OPN_TRANSPORT_MESSAGE_AGGREGATE: "opn-transport-message";
export declare const OPN_TRANSPORT_OFFERED_EVENT: "opn.transport.message.offered";
export declare const OPN_TRANSPORT_ACKNOWLEDGED_EVENT: "opn.transport.message.acknowledged";
export type OpnTransportHttpService = {
    handle(input: {
        request: IncomingMessage;
        response: ServerResponse;
        node_id: string;
    }): Promise<boolean>;
};
export declare function createOpnTransportHttpService(input: {
    network_id: string;
    stateStore: SqliteStateStore;
    credentialVerifier: CredentialVerifier;
    now?: () => string;
    session_ttl_ms?: number;
}): OpnTransportHttpService;
