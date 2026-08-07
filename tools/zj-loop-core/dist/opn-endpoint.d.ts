import type { AddressInfo } from 'node:net';
import type { ServerOptions } from 'node:https';
import type { CredentialClaimService, CredentialIssueService, PairingConnectionReadModelService, PairingOwnerAuthenticator } from './pairing-http-server.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import type { CredentialVerifier } from './sqlite-state-store-server.js';
import type { OpnTransportHttpService } from './opn-transport-http-server.js';
import type { TransportAdapter } from './transport-contract.js';
export declare const OPN_ENDPOINT_SCHEMA: "zj-loop.opn_endpoint.v1";
export type OpnEndpoint = {
    address: AddressInfo;
    localTransport: TransportAdapter;
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
    connectionReadModel?: PairingConnectionReadModelService | null;
    local_node?: {
        node_id: string;
        display_name: string;
        agent_kind: string;
        agent_version: string;
    };
    credentialVerifier?: CredentialVerifier | null;
    transport?: OpnTransportHttpService | null;
}): Promise<OpnEndpoint>;
export declare function loadOpnEndpointTls(input: {
    key_path: string;
    cert_path: string;
    ca_path: string;
}): Promise<Pick<ServerOptions, 'key' | 'cert' | 'ca'>>;
