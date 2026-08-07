import type { SqliteStateStore } from './sqlite-state-store.js';
import { type HumanApprovalContext, type HumanPublicIdentity } from './human-authority.js';
export declare const SQLITE_CREDENTIAL_ISSUANCE_SCHEMA: "zj-loop.sqlite_credential_issuance.v1";
export type CredentialIssuanceRequest = {
    request_id: string;
    network_id: string;
    node_id: string;
    event_id: string;
    task_id: string;
    capabilities: string[];
    issued_at: string;
    expires_at: string;
    approval: HumanApprovalContext;
    human_identity: HumanPublicIdentity;
    expected_revision?: number;
};
export type CredentialIssueIntentResult = {
    status: 'recorded' | 'duplicate';
    credential_id: string;
    issuance_digest: string;
    intent_expires_at: string;
};
export type CredentialClaimResult = {
    status: 'claimed' | 'duplicate';
    credential_id: string;
    claimed_at: string;
    token?: string;
};
export type PairingCredentialIssuanceRequest = {
    request_id: string;
    network_id: string;
    node_id: string;
    request_digest: string;
    human_id: string;
    capabilities: string[];
    issued_at: string;
    expires_at: string;
    expected_revision?: number;
};
export type SqliteCredentialIssuance = {
    issueIntent(input: CredentialIssuanceRequest): Promise<CredentialIssueIntentResult>;
    issuePairingIntent(input: PairingCredentialIssuanceRequest): Promise<CredentialIssueIntentResult>;
    claim(input: {
        request_id: string;
        network_id: string;
        node_id: string;
        credential_id: string;
        now?: string;
    }): Promise<CredentialClaimResult>;
    claimForPairingSession(input: {
        request_id: string;
        network_id: string;
        node_id: string;
        session_id: string;
        now?: string;
    }): Promise<CredentialClaimResult>;
    verifyCredential(input: {
        token: string;
        node_id: string;
        network_id: string;
        required_capabilities?: string[];
        now?: string;
    }): Promise<{
        status: 'allowed' | 'blocked';
        credential_id?: string;
        expires_at?: string;
        reason?: string;
    }>;
    revoke(input: {
        credential_id: string;
        request_id: string;
        reason: string;
        now?: string;
    }): Promise<{
        status: 'revoked' | 'duplicate';
        credential_id: string;
        revoked_at?: string;
    }>;
    close(): Promise<void>;
};
export type CredentialIssueIntentServiceInput = {
    network_id: string;
    expected_revision: number;
    human_id: string;
    human_context: string;
    request: Record<string, unknown>;
};
export type HumanApprovalEnvelope = {
    approval: HumanApprovalContext;
    human_identity: HumanPublicIdentity;
};
export declare function parseHumanApprovalEnvelope(context: string): HumanApprovalEnvelope;
export declare function createCredentialIssueIntentService(input: {
    issuance: SqliteCredentialIssuance;
    resolveApproval?: (context: string) => HumanApprovalEnvelope | Promise<HumanApprovalEnvelope>;
}): {
    issueIntent(request: CredentialIssueIntentServiceInput): Promise<CredentialIssueIntentResult>;
};
export declare function credentialIssuanceDigest(input: CredentialIssuanceRequest): string;
export declare function createSqliteCredentialIssuance(input: {
    filename: string;
    now?: () => string;
    stateStore?: SqliteStateStore;
}): SqliteCredentialIssuance;
