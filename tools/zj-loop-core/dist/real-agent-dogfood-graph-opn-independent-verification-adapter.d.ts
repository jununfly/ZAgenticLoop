import type { OpnArtifactMetadata, OpnArtifactStore } from './opn-artifact-store.js';
import { type TransportAdapter } from './transport-contract.js';
import { type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
export type RealAgentDogfoodGraphOpnIndependentVerificationAdapterResult = {
    status: 'passed' | 'blocked' | 'outcome-uncertain';
    reason?: string;
    evidence_digest?: string;
    record?: RealAgentDogfoodGraphPhaseRecord;
};
type OpnIndependentVerificationTransport = Pick<TransportAdapter, 'openSession' | 'send' | 'receive' | 'acknowledge' | 'closeSession'>;
export declare function createRealAgentDogfoodGraphOpnIndependentVerificationAdapter(input: {
    plan: RealAgentDogfoodGraphPlan;
    network_id: string;
    coordinator_id: string;
    verifier_id: string;
    transport: OpnIndependentVerificationTransport;
    artifact_store: OpnArtifactStore;
    evidence_store: Pick<ContentAddressedEvidenceStore, 'put'>;
    source_phase: RealAgentDogfoodGraphPhaseRecord;
    scope_phase: RealAgentDogfoodGraphPhaseRecord;
    source_evidence: () => Promise<Buffer>;
    publish_artifact?: (input: {
        bytes: Buffer;
        metadata: OpnArtifactMetadata;
        transfer_id: string;
        target_node_id: string;
    }) => Promise<void>;
    download_artifact?: (artifact_id: string) => Promise<Buffer>;
    poll_attempts?: number;
    poll_delay_ms?: number;
    now?: () => string;
}): () => Promise<RealAgentDogfoodGraphOpnIndependentVerificationAdapterResult>;
export {};
