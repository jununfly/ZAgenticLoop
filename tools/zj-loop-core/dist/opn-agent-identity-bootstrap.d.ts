export declare const OPN_AGENT_IDENTITY_BOOTSTRAP_SCHEMA: "zj-loop.opn_agent_identity_bootstrap.v1";
export type OpnAgentIdentityBootstrapMetadata = {
    schema: typeof OPN_AGENT_IDENTITY_BOOTSTRAP_SCHEMA;
    certificate_status: 'pending';
    algorithm: 'ECDSA-P256';
    display_name: string;
    agent_kind: string;
    agent_version: string;
    private_key_path: string;
    csr_path: string;
    generated_at: string;
};
export type OpnAgentIdentityBootstrapResult = {
    status: 'pending-certificate';
    private_key_path: string;
    csr_path: string;
    metadata_path: string;
    metadata: OpnAgentIdentityBootstrapMetadata;
};
export declare function bootstrapOpnAgentIdentity(input: {
    output_dir: string;
    display_name: string;
    agent_kind: string;
    agent_version: string;
    openssl_bin?: string;
    now?: string;
}): Promise<OpnAgentIdentityBootstrapResult>;
