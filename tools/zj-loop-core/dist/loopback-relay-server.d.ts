import { type Server, type ServerOptions } from 'node:https';
export declare const RELAY_HTTP_SCHEMA: "zj-loop.relay_http.v1";
export type RelaySessionVerificationRequest = {
    token: string;
    node_id: string;
    network_id: string;
    protocol_version: string;
};
export type RelaySessionVerifier = {
    verify(input: RelaySessionVerificationRequest): Promise<{
        status: 'allowed' | 'blocked';
        credential_id?: string;
        expires_at?: string;
        reason?: string;
    }> | {
        status: 'allowed' | 'blocked';
        credential_id?: string;
        expires_at?: string;
        reason?: string;
    };
};
export type RelayDeliveryResolver = {
    findNext(input: {
        network_id: string;
        node_id: string;
        after_revision: number;
    }): Promise<Record<string, unknown> | null> | Record<string, unknown> | null;
};
export declare function createLoopbackRelayServer(input: {
    tls: ServerOptions;
    sessionVerifier: RelaySessionVerifier | null;
    deliveryResolver?: RelayDeliveryResolver | null;
    now?: () => string;
    session_ttl_ms: number;
    supported_protocol_version?: string;
}): Server;
