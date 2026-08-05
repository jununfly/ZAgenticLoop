import { type NativeOpnGraphMergeAdapter } from './native-opn-graph-merge.js';
import type { NativeOpnTracerMergeAuthorization } from './native-opn-tracer-aggregation.js';
import { type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
export type RealAgentDogfoodGraphMergeAdapterResult = {
    status: 'passed' | 'blocked' | 'outcome-uncertain';
    reason?: string;
    evidence_digest?: string;
    record?: RealAgentDogfoodGraphPhaseRecord;
};
export declare function createRealAgentDogfoodGraphMergeAdapter(input: {
    plan: RealAgentDogfoodGraphPlan;
    network_id: string;
    coordinator_id: string;
    human_acceptance_phase: RealAgentDogfoodGraphPhaseRecord;
    human_acceptance: {
        decision: 'accepted' | string;
        merge_authorization_digest?: string;
    };
    authorization: NativeOpnTracerMergeAuthorization;
    merge_adapter: NativeOpnGraphMergeAdapter;
    evidence_store: Pick<ContentAddressedEvidenceStore, 'put'>;
}): () => Promise<RealAgentDogfoodGraphMergeAdapterResult>;
