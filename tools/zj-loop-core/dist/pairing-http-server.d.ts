import { type Server, type ServerOptions } from 'node:https';
import type { PairingRecordStore } from './pairing-record-store.js';
import { type HumanApprovalContext } from './human-authority.js';
import type { OpnTransportHttpService } from './opn-transport-http-server.js';
import type { OpnMessageReadModel } from './opn-message-read-model.js';
import type { OpnArtifactTransferHttpService } from './opn-artifact-transfer-http-server.js';
import type { HumanActionReadModel } from './human-action-opn-projection.js';
import type { HumanActionDecision, HumanActionRequest } from './human-action.js';
import { type TransportEnvelope } from './transport-contract.js';
import type { OutboundTaskApproval } from './opn-outbound-task-approval.js';
export declare const PAIRING_HTTP_SCHEMA: "zj-loop.pairing_http.v1";
export type PairingOwnerAuthenticator = {
    authenticate(input: {
        action: 'pairing.list' | 'pairing.inbox' | 'pairing.approve' | 'pairing.reject' | 'human.action.list' | 'human.action.decide' | 'message.send' | 'message.cancel';
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
export type HumanActionReadModelService = {
    read(input: {
        network_id: string;
        node_id: string;
    }): Promise<HumanActionReadModel>;
};
export type HumanActionCommandService = {
    decide(input: {
        network_id: string;
        request: HumanActionRequest;
        decision: HumanActionDecision;
    }): Promise<Record<string, unknown>>;
};
export type OwnerMessageCommandService = {
    send(input: {
        network_id: string;
        envelope: TransportEnvelope;
    }): Promise<Record<string, unknown>>;
};
export type OwnerMessageCancelCommandService = {
    cancel(input: {
        network_id: string;
        message_id: string;
        envelope_digest: string;
        reason: string;
    }): Promise<Record<string, unknown>>;
};
export type OwnerOutboundTaskApprovalService = {
    list(input: {
        network_id: string;
    }): Promise<{
        requests: OutboundTaskApproval[];
    }>;
    request(input: {
        network_id: string;
        approval: OutboundTaskApproval;
    }): Promise<Record<string, unknown>>;
    decide(input: {
        network_id: string;
        approval: OutboundTaskApproval;
        decision: 'approved' | 'rejected';
        human_id: string;
        human_note: string;
    }): Promise<Record<string, unknown>>;
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
    outboxReadModel?: PairingInboxReadModelService | null;
    humanActionReadModel?: HumanActionReadModelService | null;
    humanActionCommand?: HumanActionCommandService | null;
    ownerMessageCommand?: OwnerMessageCommandService | null;
    ownerMessageCancelCommand?: OwnerMessageCancelCommandService | null;
    ownerOutboundTaskApproval?: OwnerOutboundTaskApprovalService | null;
    transport?: OpnTransportHttpService | null;
    artifactTransfer?: OpnArtifactTransferHttpService | null;
}): Server;
