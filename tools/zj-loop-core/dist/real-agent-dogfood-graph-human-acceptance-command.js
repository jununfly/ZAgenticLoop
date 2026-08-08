import { createHumanAcceptance } from './human-acceptance.js';
import { recordHumanAcceptance } from './human-acceptance-fact.js';
export async function recordRealAgentDogfoodGraphHumanAcceptanceFact(input) {
    if (input.network_id !== input.handoff.network_id || input.handoff.execution_id !== input.plan.execution_id)
        throw new Error('graph-human-acceptance-handoff-binding-invalid');
    if (input.plan_digest !== input.plan.plan_digest)
        throw new Error('graph-human-acceptance-plan-binding-invalid');
    const acceptance = await createHumanAcceptance({ signer: input.signer, handoff: input.handoff, plan_digest: input.plan_digest, accepted_at: input.accepted_at });
    const identity = await Promise.resolve(input.signer.getPublicIdentity());
    return recordHumanAcceptance({ stateStore: input.stateStore, expected_revision: await input.stateStore.getRevision(input.network_id), acceptance, identity, handoff: input.handoff, now: input.accepted_at });
}
