import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import { type RealAgentDogfoodGraphReviewReadModel } from './real-agent-dogfood-graph-review-read-model.js';
import type { HumanSigner } from './human-signer.js';
export type RealAgentDogfoodGraphReviewUpstream = {
    list(): Promise<{
        events: RealAgentDogfoodGraphReviewReadModel[];
    }>;
    get(input: {
        event_id: string;
    }): Promise<{
        event: RealAgentDogfoodGraphReviewReadModel | null;
    }>;
    evidence(input: {
        event_id: string;
    }): Promise<{
        evidence: Array<{
            kind: string;
            artifact_id: string;
            digest: string;
        }>;
    }>;
    accept(input: {
        network_id: string;
        event_id: string;
        plan_id: string;
        plan_revision: number;
        plan_digest: string;
        accepted_at: string;
        signer: HumanSigner;
    }): Promise<Record<string, unknown>>;
};
export declare function createRealAgentDogfoodGraphReviewUpstream(input: {
    stateStore: SqliteStateStore;
    evidenceStore: Pick<ContentAddressedEvidenceStore, 'readOnly'>;
    network_id: string;
    plans: readonly RealAgentDogfoodGraphPlan[];
}): RealAgentDogfoodGraphReviewUpstream;
