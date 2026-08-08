import { createRealAgentDogfoodGraphHumanAcceptanceAdapter, type RealAgentDogfoodGraphHumanAcceptanceAdapterResult } from './real-agent-dogfood-graph-human-acceptance-adapter.js';
import type { HumanSignerIdentity } from './human-signer.js';
import type { ReviewHandoffRecord } from './review-handoff.js';
import type { RealAgentDogfoodGraphPlan, } from './real-agent-dogfood-graph-orchestrator.js';
import type { RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import type { HumanAcceptanceRecord } from './human-acceptance.js';

export function createRealAgentDogfoodGraphHumanAcceptanceStateStoreAdapter(input: {
  stateStore: SqliteStateStore;
  plan: RealAgentDogfoodGraphPlan;
  network_id: string;
  plan_id: string;
  plan_revision: number;
  human_id: string;
  identity: HumanSignerIdentity;
  handoff: ReviewHandoffRecord;
  source_phase: RealAgentDogfoodGraphPhaseRecord;
  scope_phase: RealAgentDogfoodGraphPhaseRecord;
  verification_phase: RealAgentDogfoodGraphPhaseRecord;
  evidence_store: Pick<ContentAddressedEvidenceStore, 'put'>;
}): () => Promise<RealAgentDogfoodGraphHumanAcceptanceAdapterResult> {
  return async () => {
    const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'human-acceptance', aggregate_id: input.handoff.event_id })).events.filter((event) => event.event_type === 'human-acceptance.accepted');
    const acceptance = (events.at(-1)?.payload as { acceptance?: HumanAcceptanceRecord } | undefined)?.acceptance;
    if (!acceptance) return { status: 'blocked', reason: 'human-acceptance-fact-unavailable' };
    return createRealAgentDogfoodGraphHumanAcceptanceAdapter({ ...input, acceptance })();
  };
}
