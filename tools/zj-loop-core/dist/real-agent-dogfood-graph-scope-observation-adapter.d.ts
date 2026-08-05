import { type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import { observeRealAgentDogfoodGitScope } from './real-agent-dogfood-git-scope.js';
import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
export type RealAgentDogfoodGraphScopeObservationAdapterResult = {
    status: 'passed' | 'blocked' | 'outcome-uncertain';
    reason?: string;
    evidence_digest?: string;
    record?: RealAgentDogfoodGraphPhaseRecord;
};
export declare function createRealAgentDogfoodGraphScopeObservationAdapter(input: {
    plan: RealAgentDogfoodGraphPlan;
    network_id: string;
    coordinator_id: string;
    evidence_store: Pick<ContentAddressedEvidenceStore, 'put'>;
    source_phase: RealAgentDogfoodGraphPhaseRecord;
    observe?: typeof observeRealAgentDogfoodGitScope;
}): () => Promise<RealAgentDogfoodGraphScopeObservationAdapterResult>;
