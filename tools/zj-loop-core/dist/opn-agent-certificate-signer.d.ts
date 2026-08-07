export declare const OPN_AGENT_CERTIFICATE_SIGNER_SCHEMA: "zj-loop.opn_agent_certificate_signer.v1";
export type OpnAgentCertificateSignResult = {
    schema: typeof OPN_AGENT_CERTIFICATE_SIGNER_SCHEMA;
    status: 'signed';
    certificate_path: string;
    serial_path: string;
};
export declare function signOpnAgentCertificate(input: {
    csr_path: string;
    ca_key_path: string;
    ca_cert_path: string;
    output_cert_path: string;
    serial_path?: string;
    days?: number;
    openssl_bin?: string;
}): Promise<OpnAgentCertificateSignResult>;
