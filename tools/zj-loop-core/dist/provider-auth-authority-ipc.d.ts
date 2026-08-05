import { createUnixFramedJsonServer } from './framed-json-unix.js';
import { type ProviderAuthAuthorityRevokeRequest, type ProviderAuthAuthorityRevokeResponse } from './provider-auth-authority-ipc-protocol.js';
export type ProviderAuthAuthorityRevokeClientInput = {
    socket_path: string;
    correlation_id?: string;
    request_id: string;
    network_id: string;
    runtime_id: string;
    runtime_binding: ProviderAuthAuthorityRevokeRequest['runtime_binding'];
    auth_ref_id: string;
    auth_ref_digest: string;
    authority_contract_digest: string;
    revoke_reason: string;
    timeout_ms?: number;
};
export type ProviderAuthAuthorityRevokeClientResult = ProviderAuthAuthorityRevokeResponse | {
    status: 'blocked' | 'outcome-uncertain';
    reason: string;
};
export declare function revokeProviderAuthRefOverIpc(input: ProviderAuthAuthorityRevokeClientInput): Promise<ProviderAuthAuthorityRevokeClientResult>;
export declare function createProviderAuthAuthorityIpcServer(input: {
    socket_path: string;
    correlation_id: string;
    expected_authority_contract_digest: string;
    verify_peer: (socket: import('node:net').Socket) => Promise<boolean> | boolean;
    handle_revoke: (request: ProviderAuthAuthorityRevokeRequest) => Promise<ProviderAuthAuthorityRevokeResponse>;
}): ReturnType<typeof createUnixFramedJsonServer>;
