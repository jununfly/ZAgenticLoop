#!/usr/bin/env node
import { type ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import { type OpnArtifactMetadata, type OpnArtifactStore } from './opn-artifact-store.js';
import { createRealAgentDogfoodGraphOpnIndependentVerificationAdapter } from './real-agent-dogfood-graph-opn-independent-verification-adapter.js';
import { createRealAgentDogfoodGraphScopeObservationAdapter } from './real-agent-dogfood-graph-scope-observation-adapter.js';
import { type RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import { type SqliteStateStore } from './sqlite-state-store.js';
import type { TransportAdapter } from './transport-contract.js';
export declare const OPN_GRAPH_DOGFOOD_CLI_SCHEMA: "zj-loop.opn_graph_dogfood_cli.v1";
type RunInput = {
    plan: RealAgentDogfoodGraphPlan;
    network_id: string;
    coordinator_id: string;
    verifier_id: string;
    source_bytes: Buffer;
    state_store: SqliteStateStore;
    artifact_store: OpnArtifactStore;
    evidence_store: ContentAddressedEvidenceStore;
    transport: Pick<TransportAdapter, 'openSession' | 'send' | 'receive' | 'acknowledge' | 'closeSession'>;
    publish_artifact?: (input: {
        bytes: Buffer;
        metadata: OpnArtifactMetadata;
        transfer_id: string;
        target_node_id: string;
    }) => Promise<void>;
    download_artifact?: Parameters<typeof createRealAgentDogfoodGraphOpnIndependentVerificationAdapter>[0]['download_artifact'];
};
type ScopeInput = {
    plan: RealAgentDogfoodGraphPlan;
    network_id: string;
    coordinator_id: string;
    state_store: SqliteStateStore;
    evidence_store: ContentAddressedEvidenceStore;
    observe?: Parameters<typeof createRealAgentDogfoodGraphScopeObservationAdapter>[0]['observe'];
};
export declare function runOpnGraphDogfoodScopeObservation(input: ScopeInput): Promise<Record<string, unknown>>;
export declare function runOpnGraphDogfoodVerification(input: RunInput): Promise<Record<string, unknown>>;
export declare function runOpnGraphDogfoodCli(argv?: readonly string[]): Promise<number>;
export {};
