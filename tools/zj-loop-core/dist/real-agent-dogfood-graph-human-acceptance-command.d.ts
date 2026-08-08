import { type HumanAcceptanceFactResult } from './human-acceptance-fact.js';
import type { HumanSigner } from './human-signer.js';
import type { ReviewHandoffRecord } from './review-handoff.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare function recordRealAgentDogfoodGraphHumanAcceptanceFact(input: {
    stateStore: Pick<SqliteStateStore, 'getRevision' | 'runAtomic'>;
    plan: RealAgentDogfoodGraphPlan;
    network_id: string;
    handoff: ReviewHandoffRecord;
    signer: HumanSigner;
    plan_digest: string;
    accepted_at: string;
}): Promise<HumanAcceptanceFactResult>;
