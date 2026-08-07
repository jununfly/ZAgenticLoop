import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SqliteStateStore } from './sqlite-state-store.js';
import type { CredentialVerifier } from './sqlite-state-store-server.js';
import { type OpnArtifactMetadata, type OpnArtifactStore } from './opn-artifact-store.js';
export declare const OPN_ARTIFACT_TRANSFER_SCHEMA: "zj-loop.opn_artifact_transfer.v1";
export declare const OPN_ARTIFACT_TRANSFER_AGGREGATE: "opn-artifact-transfer";
export declare const OPN_ARTIFACT_OFFERED_EVENT: "opn.artifact.offered";
export declare const OPN_ARTIFACT_STORED_EVENT: "opn.artifact.stored";
export declare const OPN_ARTIFACT_VERIFIED_EVENT: "opn.artifact.verified";
type TransferRecord = {
    metadata: OpnArtifactMetadata;
    transfer_id: string;
    sender_node_id: string;
    target_node_id: string;
    status: 'offered' | 'stored' | 'verified';
};
export type OpnArtifactTransferHttpService = {
    handle(input: {
        request: IncomingMessage;
        response: ServerResponse;
        node_id: string;
    }): Promise<boolean>;
};
export declare function projectOpnArtifactTransfers(input: {
    stateStore: SqliteStateStore;
    network_id: string;
}): Promise<TransferRecord[]>;
export declare function recordLocalOpnArtifactTransfer(input: {
    network_id: string;
    stateStore: SqliteStateStore;
    artifactStore: OpnArtifactStore;
    bytes: Uint8Array;
    file_name: string;
    media_type: string;
    transfer_id: string;
    sender_node_id: string;
    target_node_id: string;
    now?: string;
}): Promise<{
    metadata: OpnArtifactMetadata;
    status: 'verified';
}>;
export declare function createOpnArtifactTransferHttpService(input: {
    network_id: string;
    stateStore: SqliteStateStore;
    artifactStore: OpnArtifactStore;
    credentialVerifier: CredentialVerifier;
    now?: () => string;
    max_bytes?: number;
}): OpnArtifactTransferHttpService;
export {};
