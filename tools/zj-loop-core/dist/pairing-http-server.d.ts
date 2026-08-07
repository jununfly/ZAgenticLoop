import { type Server, type ServerOptions } from 'node:https';
import type { PairingRecordStore } from './pairing-record-store.js';
import { type HumanApprovalContext } from './human-authority.js';
import type { OpnTransportHttpService } from './opn-transport-http-server.js';
import type { OpnMessageReadModel } from './opn-message-read-model.js';
import type { OpnArtifactTransferHttpService } from './opn-artifact-transfer-http-server.js';
export declare const PAIRING_HTTP_SCHEMA: "zj-loop.pairing_http.v1";
export type PairingOwnerAuthenticator = {
    authenticate(input: {
        action: 'pairing.list' | 'pairing.inbox' | 'pairing.approve' | 'pairing.reject';
        authorization: string | null;
        request_id?: string;
        request_digest?: string;
        context?: HumanApprovalContext;
        require_v2?: boolean;
        peer_fingerprint?: string;
    }): Promise<{
        status: 'allowed' | 'blocked';
        human_id?: string;
        reason?: string;
    }> | {
        status: 'allowed' | 'blocked';
        human_id?: string;
        reason?: string;
    };
};
export type CredentialClaimService = {
    claim(input: {
        request_id: string;
        session_id: string;
        network_id: string;
        node_id: string;
    }): Promise<{
        status: 'claimed' | 'duplicate';
        credential_id: string;
        claimed_at: string;
        token?: string;
    }>;
};
export type CredentialIssueService = {
    issue(input: {
        request_id: string;
        network_id: string;
        node_id: string;
        request_digest: string;
        human_id: string;
        capabilities: string[];
        issued_at: string;
        expires_at: string;
    }): Promise<{
        status: 'recorded' | 'duplicate';
        credential_id: string;
    }>;
};
export type PairingConnectionReadModelService = {
    read(): Promise<Record<string, unknown>>;
};
export type PairingInboxReadModelService = {
    read(input: {
        network_id: string;
    }): Promise<OpnMessageReadModel[]>;
};
export declare function createPairingHttpServer(input: {
    tls: ServerOptions;
    recordStore: PairingRecordStore;
    ownerAuthenticator?: PairingOwnerAuthenticator | null;
    readinessCheck?: {
        check(): Promise<{
            status: 'ready' | 'not-ready';
            reason?: string;
        }> | {
            status: 'ready' | 'not-ready';
            reason?: string;
        };
    } | null;
    now?: () => string;
    session_ttl_ms?: number;
    credentialClaim?: CredentialClaimService | null;
    credentialIssue?: CredentialIssueService | null;
    connectionReadModel?: PairingConnectionReadModelService | null;
    inboxReadModel?: PairingInboxReadModelService | null;
    transport?: OpnTransportHttpService | null;
    artifactTransfer?: OpnArtifactTransferHttpService | null;
}): Server;
