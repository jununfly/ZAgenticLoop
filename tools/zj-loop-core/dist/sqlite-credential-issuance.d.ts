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
export type SqliteCredentialIssuance = {
    issueIntent(input: CredentialIssuanceRequest): Promise<CredentialIssueIntentResult>;
    claim(input: {
        request_id: string;
        network_id: string;
        node_id: string;
        credential_id: string;
        now?: string;
    }): Promise<CredentialClaimResult>;
    close(): Promise<void>;
};
export declare function credentialIssuanceDigest(input: CredentialIssuanceRequest): string;
export declare function createSqliteCredentialIssuance(input: {
    filename: string;
    now?: () => string;
}): SqliteCredentialIssuance;
