import { createRealAgentDogfoodGraphHumanAcceptanceAdapter } from './real-agent-dogfood-graph-human-acceptance-adapter.js';
export function createRealAgentDogfoodGraphHumanAcceptanceStateStoreAdapter(input) {
    return async () => {
        const events = (await input.stateStore.readEvents({ network_id: input.network_id, aggregate_type: 'human-acceptance', aggregate_id: input.handoff.event_id })).events.filter((event) => event.event_type === 'human-acceptance.accepted');
        const acceptance = events.at(-1)?.payload?.acceptance;
        if (!acceptance)
            return { status: 'blocked', reason: 'human-acceptance-fact-unavailable' };
        return createRealAgentDogfoodGraphHumanAcceptanceAdapter({ ...input, acceptance })();
    };
}
