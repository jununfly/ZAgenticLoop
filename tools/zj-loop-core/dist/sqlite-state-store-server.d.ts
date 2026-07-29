import { type Server, type ServerOptions } from 'node:https';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const STATE_STORE_HTTP_SCHEMA: "zj-loop.state_store_http.v1";
export type CredentialVerificationRequest = {
    token: string;
    node_id: string;
    network_id?: string;
    operation: string;
    event_id?: string;
    task_id?: string;
    required_capabilities?: string[];
};
export type CredentialVerifier = {
    verify(input: CredentialVerificationRequest): Promise<{
        status: 'allowed' | 'blocked';
        reason?: string;
    }> | {
        status: 'allowed' | 'blocked';
        reason?: string;
    };
};
export type HumanAuthorityVerificationRequest = {
    context: string;
    action: string;
    request_body: unknown;
};
export type HumanAuthorityVerifier = {
    verify(input: HumanAuthorityVerificationRequest): Promise<{
        status: 'allowed' | 'blocked';
        human_id?: string;
        reason?: string;
    }> | {
        status: 'allowed' | 'blocked';
        human_id?: string;
        reason?: string;
    };
};
export declare function createStateStoreServer(input: {
    tls: ServerOptions;
    store: SqliteStateStore | null;
    credentialVerifier: CredentialVerifier | null;
    humanAuthorityVerifier?: HumanAuthorityVerifier | null;
}): Server;
