import { APPROVAL_CANONICALIZATION, APPROVAL_CANONICALIZATION_PROFILE } from './approval-canonicalization.js';
export declare const HUMAN_AUTHORITY_SCHEMA: "zj-loop.human_authority.v1";
export declare const HUMAN_AUTHORITY_V2_SCHEMA: "zj-loop.human_authority.v2";
export declare const HUMAN_AUTHORITY_V2_DOMAIN: "ZJ-LOOP/HUMAN-AUTHORITY/V2\0";
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
    canonicalization?: typeof APPROVAL_CANONICALIZATION;
    canonicalization_profile?: typeof APPROVAL_CANONICALIZATION_PROFILE;
    profile_sha256?: string;
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
export type HumanApprovalVerificationResult = {
    status: 'accepted';
} | {
    status: 'legacy-v2-accepted';
} | {
    status: 'current-v2-accepted';
} | {
    status: 'blocked';
};
export declare function validateHumanAuthorityV2Binding(input: {
    context: string | HumanApprovalContext;
    network_id: string;
    peer_fingerprint: string;
    require_current_v2?: boolean;
}): {
    status: 'allowed';
} | {
    status: 'blocked';
    reason: 'human-authority-v2-required' | 'human-device-binding-mismatch' | 'human-authority-v2-current-required';
};
export declare function canonicalizeHumanAuthorityV1(value: Record<string, string | string[] | undefined>): Uint8Array;
export declare function humanAuthorityV2SigningPayload(input: {
    action: string;
    request_id: string;
    request_digest: string;
    approved_capabilities: string[];
    human_id: string;
    issued_at: string;
    expires_at: string;
    network_id: string;
    device_key_id: string;
    device_fingerprint: string;
}): {
    canonical: Uint8Array;
    signing_payload: Uint8Array;
    payload_digest: string;
    profile_sha256: string;
};
export declare function createInMemoryHumanAuthorityProvider(input: {
    human_id: string;
    protocol_version?: 'v1' | 'v2';
    network_id?: string;
    device_key_id?: string;
    device_fingerprint?: string;
}): HumanAuthorityProvider;
export declare function verifyHumanApprovalContext(input: {
    identity: HumanPublicIdentity;
    context: HumanApprovalContext;
    now?: string;
    require_v2?: boolean;
}): boolean;
export declare function verifyHumanApprovalContextDetailed(input: {
    identity: HumanPublicIdentity;
    context: HumanApprovalContext;
    now?: string;
    require_v2?: boolean;
}): HumanApprovalVerificationResult;
export {};
