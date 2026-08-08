import { replayRealAgentDogfoodGraphReadModel } from './real-agent-dogfood-replay.js';
import { projectRealAgentDogfoodGraphReviewReadModel } from './real-agent-dogfood-graph-review-read-model.js';
import { recordRealAgentDogfoodGraphHumanAcceptanceFact } from './real-agent-dogfood-graph-human-acceptance-command.js';
export function createRealAgentDogfoodGraphReviewUpstream(input) {
    if (!input.network_id.trim())
        throw new Error('real-agent-dogfood-graph-review-upstream-network-id-required');
    const project = async (plan) => {
        const lifecycle = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'real-agent-dogfood', aggregate_id: plan.dogfood_id })).events;
        const graph = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'real-agent-dogfood-graph', aggregate_id: plan.dogfood_id })).events;
        const replay = await replayRealAgentDogfoodGraphReadModel({ network_id: input.network_id, plan, lifecycle_events: lifecycle, graph_events: graph, evidenceStore: input.evidenceStore });
        return projectRealAgentDogfoodGraphReviewReadModel({ plan, replay, network_id: input.network_id });
    };
    const findHandoff = async (plan) => {
        const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'review-handoff' })).events;
        for (const event of events.reverse()) {
            const handoff = event.payload.handoff;
            if (handoff?.network_id === input.network_id && handoff.execution_id === plan.execution_id && handoff.plan_revision === plan.attempt && handoff.status === 'accepted')
                return handoff;
        }
        return null;
    };
    return {
        async list() { return { events: await Promise.all(input.plans.map(project)) }; },
        async get({ event_id }) { const plan = input.plans.find((candidate) => candidate.dogfood_id === event_id); return { event: plan ? await project(plan) : null }; },
        async evidence({ event_id }) { const event = await this.get({ event_id }); return { evidence: event.event?.evidence_refs.map((digest) => ({ kind: 'graph-phase-evidence', artifact_id: digest, digest })) ?? [] }; },
        async accept(acceptance) {
            const plan = input.plans.find((candidate) => candidate.dogfood_id === acceptance.event_id);
            if (!plan || acceptance.network_id !== input.network_id || acceptance.plan_digest !== plan.plan_digest || acceptance.plan_revision !== plan.attempt)
                return { status: 'conflict', reason: 'graph-acceptance-scope-conflict', side_effects_executed: false };
            const handoff = await findHandoff(plan);
            if (!handoff)
                return { status: 'blocked', reason: 'graph-human-acceptance-handoff-unavailable', side_effects_executed: false };
            return recordRealAgentDogfoodGraphHumanAcceptanceFact({ stateStore: input.stateStore, plan, network_id: input.network_id, handoff, signer: acceptance.signer, plan_digest: acceptance.plan_digest, accepted_at: acceptance.accepted_at });
        },
    };
}
