export declare const HUMAN_AUTHORITY_SCHEMA: "zj-loop.human_authority.v1";
export type HumanPublicIdentity = {
    schema: typeof HUMAN_AUTHORITY_SCHEMA;
    human_id: string;
    algorithm: 'Ed25519';
    public_key_pem: string;
    public_key_fingerprint: string;
};
export type HumanApprovalContext = {
    schema: typeof HUMAN_AUTHORITY_SCHEMA;
    human_id: string;
    public_key_fingerprint: string;
    action: string;
    request_id: string;
    request_digest: string;
    approved_capabilities: string[];
    issued_at: string;
    expires_at: string;
    payload_digest: string;
    signature_base64: string;
};
export type RecoveryMaterial = {
    public_identifier: string;
    secret: string;
};
export type HumanAuthorityProvider = {
    getPublicIdentity(): HumanPublicIdentity;
    signApprovalContext(input: {
        action: string;
        request_id: string;
        request_digest: string;
        approved_capabilities?: string[];
        issued_at?: string;
        expires_at?: string;
    }): Promise<HumanApprovalContext>;
    createRecoveryMaterial(): Promise<RecoveryMaterial>;
    rotateRecoveryMaterial(): Promise<RecoveryMaterial>;
    verifyRecoveryMaterial(secret: string): Promise<boolean>;
};
export declare function createInMemoryHumanAuthorityProvider(input: {
    human_id: string;
}): HumanAuthorityProvider;
export declare function verifyHumanApprovalContext(input: {
    identity: HumanPublicIdentity;
    context: HumanApprovalContext;
    now?: string;
}): boolean;
