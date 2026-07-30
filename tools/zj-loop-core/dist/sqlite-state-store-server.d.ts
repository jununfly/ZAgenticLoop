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
export type HumanAuthorityVerificationRequest = {
    context: string;
    action: string;
    request_body: unknown;
    require_v2?: boolean;
    peer_fingerprint?: string;
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
export type CredentialIssueIntentService = {
    issueIntent(input: {
        network_id: string;
        expected_revision: number;
        human_id: string;
        human_context: string;
        request: Record<string, unknown>;
    }): Promise<{
        status: 'recorded' | 'duplicate';
        credential_id: string;
        issuance_digest: string;
        intent_expires_at: string;
    }>;
};
export declare function createStateStoreServer(input: {
    tls: ServerOptions;
    store: SqliteStateStore | null;
    credentialVerifier: CredentialVerifier | null;
    humanAuthorityVerifier?: HumanAuthorityVerifier | null;
    credentialIssuance?: CredentialIssueIntentService | null;
}): Server;
