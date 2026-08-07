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
export type OpnAgentJoinSession = {
    schema: 'zj-loop.opn_agent_join_session.v1';
    request_id: string;
    session_id: string;
    network_id: string;
    node_id: string;
    request_digest: string;
    expires_at: string;
    session_token: string;
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
export declare function fetchOpnAgentJoinStatus(input: {
    endpoint: string;
    server_name?: string;
    ca: string | Buffer;
    cert: string | Buffer;
    key: string | Buffer;
    session: OpnAgentJoinSession;
    timeout_ms?: number;
}): Promise<OpnAgentJoinResponse>;
export declare function claimOpnAgentCredential(input: {
    endpoint: string;
    server_name?: string;
    ca: string | Buffer;
    cert: string | Buffer;
    key: string | Buffer;
    session: OpnAgentJoinSession;
    timeout_ms?: number;
}): Promise<OpnAgentJoinResponse>;
export declare function submitOpnAgentJoinRequest(input: {
    endpoint: string;
    server_name?: string;
    ca: string | Buffer;
    cert: string | Buffer;
    key: string | Buffer;
    request: OpnAgentJoinRequest;
    timeout_ms?: number;
}): Promise<OpnAgentJoinResponse>;
