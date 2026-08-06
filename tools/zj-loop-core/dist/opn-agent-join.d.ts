import { type PairingRequest, type PairingRequestProof } from './node-enrollment.js';
export declare const OPN_AGENT_JOIN_SCHEMA: "zj-loop.opn_agent_join.v1";
export type OpnAgentJoinRequest = {
    request: PairingRequest;
    proof: PairingRequestProof;
};
export type OpnAgentJoinResponse = {
    statusCode: number;
    body: unknown;
};
export declare function createOpnAgentJoinRequest(input: {
    request_id: string;
    network_id: string;
    display_name: string;
    agent_kind: string;
    agent_version: string;
    endpoint: string;
    requested_capabilities: string[];
    expires_at: string;
    certificate_pem: string;
    private_key_pem: string;
}): OpnAgentJoinRequest;
export declare function submitOpnAgentJoinRequest(input: {
    endpoint: string;
    server_name?: string;
    ca: string | Buffer;
    cert: string | Buffer;
    key: string | Buffer;
    request: OpnAgentJoinRequest;
    timeout_ms?: number;
}): Promise<OpnAgentJoinResponse>;
