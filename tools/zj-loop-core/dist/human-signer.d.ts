export declare const HUMAN_SIGNER_SCHEMA: "zj-loop.human_signer.v1";
export declare const HUMAN_SIGNATURE_SCHEMA: "zj-loop.human_signature.v1";
export type HumanSignerIdentity = {
    schema: typeof HUMAN_SIGNER_SCHEMA;
    human_id: string;
    algorithm: 'ECDSA-P256';
    public_key_pem: string;
    public_key_fingerprint: string;
};
export type HumanSignature = {
    schema: typeof HUMAN_SIGNATURE_SCHEMA;
    algorithm: 'ECDSA-P256';
    public_key_fingerprint: string;
    signature_base64: string;
};
export type HumanSigner = {
    getPublicIdentity(): Promise<HumanSignerIdentity> | HumanSignerIdentity;
    sign(input: {
        payload: Uint8Array;
    }): Promise<HumanSignature>;
};
export declare function createInMemoryHumanSigner(input: {
    human_id: string;
}): HumanSigner;
export declare function verifyHumanSignature(input: {
    identity: HumanSignerIdentity;
    payload: Uint8Array;
    signature: HumanSignature;
}): boolean;
