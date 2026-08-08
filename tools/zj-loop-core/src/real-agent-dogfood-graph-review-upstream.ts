import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';
import { replayRealAgentDogfoodGraphReadModel } from './real-agent-dogfood-replay.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import { projectRealAgentDogfoodGraphReviewReadModel, type RealAgentDogfoodGraphReviewReadModel } from './real-agent-dogfood-graph-review-read-model.js';
import type { HumanSigner } from './human-signer.js';
import { recordRealAgentDogfoodGraphHumanAcceptanceFact } from './real-agent-dogfood-graph-human-acceptance-command.js';
import type { ReviewHandoffRecord } from './review-handoff.js';

export type RealAgentDogfoodGraphReviewUpstream = {
  list(): Promise<{ events: RealAgentDogfoodGraphReviewReadModel[] }>;
  get(input: { event_id: string }): Promise<{ event: RealAgentDogfoodGraphReviewReadModel | null }>;
  evidence(input: { event_id: string }): Promise<{ evidence: Array<{ kind: string; artifact_id: string; digest: string }> }>;
  accept(input: { network_id: string; event_id: string; plan_id: string; plan_revision: number; plan_digest: string; accepted_at: string; signer: HumanSigner }): Promise<Record<string, unknown>>;
};

export function createRealAgentDogfoodGraphReviewUpstream(input: { stateStore: SqliteStateStore; evidenceStore: Pick<ContentAddressedEvidenceStore, 'readOnly'>; network_id: string; plans: readonly RealAgentDogfoodGraphPlan[] }): RealAgentDogfoodGraphReviewUpstream {
  if (!input.network_id.trim()) throw new Error('real-agent-dogfood-graph-review-upstream-network-id-required');
  const project = async (plan: RealAgentDogfoodGraphPlan): Promise<RealAgentDogfoodGraphReviewReadModel> => {
    const lifecycle = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'real-agent-dogfood', aggregate_id: plan.dogfood_id })).events as unknown as Parameters<typeof replayRealAgentDogfoodGraphReadModel>[0]['lifecycle_events'];
    const graph = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'real-agent-dogfood-graph', aggregate_id: plan.dogfood_id })).events as StateEvent[];
    const replay = await replayRealAgentDogfoodGraphReadModel({ network_id: input.network_id, plan, lifecycle_events: lifecycle as never, graph_events: graph, evidenceStore: input.evidenceStore });
    return projectRealAgentDogfoodGraphReviewReadModel({ plan, replay, network_id: input.network_id });
  };
  const findHandoff = async (plan: RealAgentDogfoodGraphPlan): Promise<ReviewHandoffRecord | null> => {
    const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'review-handoff' })).events;
    for (const event of events.reverse()) {
      const handoff = (event.payload as { handoff?: ReviewHandoffRecord }).handoff;
      if (handoff?.network_id === input.network_id && handoff.execution_id === plan.execution_id && handoff.plan_revision === plan.attempt && handoff.status === 'accepted') return handoff;
    }
    return null;
  };
  return {
    async list() { return { events: await Promise.all(input.plans.map(project)) }; },
    async get({ event_id }) { const plan = input.plans.find((candidate) => candidate.dogfood_id === event_id); return { event: plan ? await project(plan) : null }; },
    async evidence({ event_id }) { const event = await this.get({ event_id }); return { evidence: event.event?.evidence_refs.map((digest) => ({ kind: 'graph-phase-evidence', artifact_id: digest, digest })) ?? [] }; },
    async accept(acceptance) {
      const plan = input.plans.find((candidate) => candidate.dogfood_id === acceptance.event_id);
      if (!plan || acceptance.network_id !== input.network_id || acceptance.plan_digest !== plan.plan_digest || acceptance.plan_revision !== plan.attempt) return { status: 'conflict', reason: 'graph-acceptance-scope-conflict', side_effects_executed: false };
      const handoff = await findHandoff(plan);
      if (!handoff) return { status: 'blocked', reason: 'graph-human-acceptance-handoff-unavailable', side_effects_executed: false };
      return recordRealAgentDogfoodGraphHumanAcceptanceFact({ stateStore: input.stateStore, plan, network_id: input.network_id, handoff, signer: acceptance.signer, plan_digest: acceptance.plan_digest, accepted_at: acceptance.accepted_at });
    },
  };
}
