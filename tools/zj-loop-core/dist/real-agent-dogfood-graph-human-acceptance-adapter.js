import { validateHumanAcceptance } from './human-acceptance.js';
import { validateReviewHandoff } from './review-handoff.js';
import { createRealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export function createRealAgentDogfoodGraphHumanAcceptanceAdapter(input) {
    return async () => {
        if (input.source_phase.phase !== 'source_execution' || input.source_phase.status !== 'passed' || input.scope_phase.phase !== 'scope_observation' || input.scope_phase.status !== 'passed' || input.verification_phase.phase !== 'independent_verification' || input.verification_phase.status !== 'passed')
            return { status: 'blocked', reason: 'human-acceptance-prerequisite-not-passed' };
        if (input.source_phase.network_id !== input.network_id || input.scope_phase.network_id !== input.network_id || input.verification_phase.network_id !== input.network_id || input.source_phase.plan_digest !== input.plan.plan_digest || input.scope_phase.plan_digest !== input.plan.plan_digest || input.verification_phase.plan_digest !== input.plan.plan_digest || input.source_phase.execution_id !== input.plan.execution_id || input.scope_phase.execution_id !== input.plan.execution_id || input.verification_phase.execution_id !== input.plan.execution_id)
            return { status: 'blocked', reason: 'human-acceptance-prerequisite-binding-invalid' };
        if (input.scope_phase.actor_kind !== 'coordinator' && input.scope_phase.actor_kind !== 'trusted-runner' && input.scope_phase.actor_kind !== 'core')
            return { status: 'blocked', reason: 'human-acceptance-scope-actor-invalid' };
        if (input.verification_phase.actor_kind !== 'coordinator' && input.verification_phase.actor_kind !== 'trusted-runner' && input.verification_phase.actor_kind !== 'core')
            return { status: 'blocked', reason: 'human-acceptance-verification-actor-invalid' };
        if (!input.human_id.trim() || input.acceptance.human_id !== input.human_id || input.identity.human_id !== input.human_id)
            return { status: 'blocked', reason: 'human-acceptance-human-binding-invalid' };
        if (input.handoff.status !== 'accepted' || validateReviewHandoff(input.handoff).status !== 'valid')
            return { status: 'blocked', reason: 'human-acceptance-review-handoff-invalid' };
        if (input.handoff.network_id !== input.network_id || input.handoff.execution_id !== input.plan.execution_id || input.handoff.plan_id !== input.plan_id || input.handoff.plan_revision !== input.plan_revision)
            return { status: 'blocked', reason: 'human-acceptance-handoff-binding-invalid' };
        if (input.acceptance.plan_digest !== input.plan.plan_digest || input.acceptance.plan_id !== input.plan_id || input.acceptance.plan_revision !== input.plan_revision || input.acceptance.network_id !== input.network_id || input.acceptance.review_handoff_digest !== input.handoff.handoff_digest || input.acceptance.verification_digest !== input.handoff.verification_digest)
            return { status: 'blocked', reason: 'human-acceptance-plan-binding-invalid' };
        if (!DIGEST.test(input.verification_phase.evidence_digest ?? '') || input.verification_phase.evidence_refs?.[0] !== input.verification_phase.evidence_digest)
            return { status: 'blocked', reason: 'human-acceptance-verification-evidence-binding-invalid' };
        const validation = validateHumanAcceptance({ acceptance: input.acceptance, identity: input.identity, handoff: input.handoff });
        if (validation.status !== 'valid')
            return { status: 'blocked', reason: `human-acceptance-signature-invalid:${validation.errors.join(',') || 'validation-failed'}` };
        const evidencePayload = {
            schema: 'zj-loop.real_agent_dogfood_graph_human_acceptance_evidence.v1',
            network_id: input.network_id,
            execution_id: input.plan.execution_id,
            plan_id: input.plan_id,
            plan_revision: input.plan_revision,
            plan_digest: input.plan.plan_digest,
            human_id: input.human_id,
            acceptance_digest: input.acceptance.canonical_payload_digest,
            review_handoff_digest: input.handoff.handoff_digest,
            handoff_verification_digest: input.handoff.verification_digest,
            independent_verification_evidence_digest: input.verification_phase.evidence_digest,
            merge_authorization_digest: input.acceptance.merge_authorization_digest ?? null,
            decision: input.acceptance.decision,
            accepted_at: input.acceptance.accepted_at,
            status: 'passed',
            reason: 'human-acceptance-verified',
        };
        let evidence;
        try {
            evidence = await input.evidence_store.put({ content: JSON.stringify(evidencePayload), kind: 'real-agent-dogfood-graph-human-acceptance' });
        }
        catch {
            return { status: 'outcome-uncertain', reason: 'human-acceptance-evidence-write-failed' };
        }
        if (!DIGEST.test(evidence.digest))
            return { status: 'outcome-uncertain', reason: 'human-acceptance-evidence-invalid' };
        const record = createRealAgentDogfoodGraphPhaseRecord({ plan: input.plan, network_id: input.network_id, phase: 'human_acceptance', status: 'passed', completed_phases: ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance'], reason: 'human-acceptance-verified', actor_kind: 'human', actor_identity: input.human_id, evidence_digest: evidence.digest, evidence_refs: [evidence.digest] });
        return { status: 'passed', reason: 'human-acceptance-verified', evidence_digest: evidence.digest, record };
    };
}
