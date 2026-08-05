import { type HumanAcceptanceRecord } from './human-acceptance.js';
import type { HumanSignerIdentity } from './human-signer.js';
import { type ReviewHandoffRecord } from './review-handoff.js';
import { type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
export type RealAgentDogfoodGraphHumanAcceptanceAdapterResult = {
    status: 'passed' | 'blocked' | 'outcome-uncertain';
    reason?: string;
    evidence_digest?: string;
    record?: RealAgentDogfoodGraphPhaseRecord;
};
export declare function createRealAgentDogfoodGraphHumanAcceptanceAdapter(input: {
    plan: RealAgentDogfoodGraphPlan;
    network_id: string;
    plan_id: string;
    plan_revision: number;
    human_id: string;
    identity: HumanSignerIdentity;
    handoff: ReviewHandoffRecord;
    acceptance: HumanAcceptanceRecord;
    source_phase: RealAgentDogfoodGraphPhaseRecord;
    scope_phase: RealAgentDogfoodGraphPhaseRecord;
    verification_phase: RealAgentDogfoodGraphPhaseRecord;
    evidence_store: Pick<ContentAddressedEvidenceStore, 'put'>;
}): () => Promise<RealAgentDogfoodGraphHumanAcceptanceAdapterResult>;
