export declare const HUMAN_AUTHORITY_SCHEMA: "zj-loop.human_authority.v1";
export declare const HUMAN_AUTHORITY_V2_SCHEMA: "zj-loop.human_authority.v2";
type HumanAuthoritySchema = typeof HUMAN_AUTHORITY_SCHEMA | typeof HUMAN_AUTHORITY_V2_SCHEMA;
export type HumanPublicIdentity = {
    schema: HumanAuthoritySchema;
    human_id: string;
    algorithm: 'ECDSA-P256';
    public_key_pem: string;
    public_key_fingerprint: string;
};
export type HumanApprovalContext = {
    schema: HumanAuthoritySchema;
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
    network_id?: string;
    device_key_id?: string;
    device_fingerprint?: string;
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
        network_id?: string;
        device_key_id?: string;
        device_fingerprint?: string;
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
    protocol_version?: 'v1' | 'v2';
}): HumanAuthorityProvider;
export declare function verifyHumanApprovalContext(input: {
    identity: HumanPublicIdentity;
    context: HumanApprovalContext;
    now?: string;
    require_v2?: boolean;
}): boolean;
export {};
