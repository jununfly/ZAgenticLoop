import type { AddressInfo } from 'node:net';
import type { ServerOptions } from 'node:https';
import type { CredentialClaimService, CredentialIssueService, PairingOwnerAuthenticator } from './pairing-http-server.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const OPN_ENDPOINT_SCHEMA: "zj-loop.opn_endpoint.v1";
export type OpnEndpoint = {
    address: AddressInfo;
    close(): Promise<void>;
};
export declare function createOpnEndpointServer(input: {
    bind: string;
    port: number;
    network_id: string;
    stateStore: SqliteStateStore;
    tls: Pick<ServerOptions, 'key' | 'cert' | 'ca'>;
    ownerAuthenticator?: PairingOwnerAuthenticator | null;
    credentialClaim?: CredentialClaimService | null;
    credentialIssue?: CredentialIssueService | null;
}): Promise<OpnEndpoint>;
export declare function loadOpnEndpointTls(input: {
    key_path: string;
    cert_path: string;
    ca_path: string;
}): Promise<Pick<ServerOptions, 'key' | 'cert' | 'ca'>>;
