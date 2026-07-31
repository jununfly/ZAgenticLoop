export const RECOVERY_DECISION_SCHEMA = 'zj-loop.recovery_decision.v1';
const ACTIONS = ['adopt', 'reconcile', 'compensate', 'abandon'];
function text(value, error) {
    if (typeof value !== 'string' || !value.trim())
        throw new Error(error);
    return value;
}
function revision(value) {
    if (!Number.isInteger(value) || value < 1)
        throw new Error('recovery-decision-plan-revision-invalid');
    return value;
}
function clone(value) {
    return structuredClone(value);
}
export function createRecoveryDecision(input) {
    if (input.side_effects_executed !== false)
        throw new Error('recovery-decision-side-effects-invalid');
    if (!ACTIONS.includes(input.recovery_action))
        throw new Error('recovery-decision-action-invalid');
    return {
        schema: RECOVERY_DECISION_SCHEMA,
        recovery_decision_id: text(input.recovery_decision_id, 'recovery-decision-id-required'),
        event_id: text(input.event_id, 'recovery-decision-event-id-required'),
        plan_id: text(input.plan_id, 'recovery-decision-plan-id-required'),
        plan_revision: revision(input.plan_revision),
        parent_execution_id: text(input.parent_execution_id, 'recovery-decision-parent-execution-required'),
        uncertainty_evidence_id: text(input.uncertainty_evidence_id, 'recovery-decision-evidence-required'),
        recovery_action: input.recovery_action,
        recovery_reason: text(input.recovery_reason, 'recovery-decision-reason-required'),
        decision_digest: text(input.decision_digest, 'recovery-decision-digest-required'),
        human_id: text(input.human_id, 'recovery-decision-human-id-required'),
        device_id: text(input.device_id, 'recovery-decision-device-id-required'),
        session_id: text(input.session_id, 'recovery-decision-session-id-required'),
        authentication_method: text(input.authentication_method, 'recovery-decision-authentication-method-required'),
        decided_at: text(input.decided_at, 'recovery-decision-decided-at-required'),
        side_effects_executed: false,
        lifecycle_status: 'recovery-required',
        ...(input.signature === undefined ? {} : { signature: clone(input.signature) }),
    };
}
function result(input) {
    return { schema: RECOVERY_DECISION_SCHEMA, lifecycle_status: 'recovery-decision-recorded', side_effects_executed: false, ...input };
}
export function createRecoveryDecisionCoordinator(input) {
    const parentExecutionId = text(input.parent_execution_id, 'recovery-decision-parent-execution-required');
    const planId = text(input.plan_id, 'recovery-decision-plan-id-required');
    const planRevision = revision(input.plan_revision);
    let winner = null;
    return {
        submitDecision(decision) {
            if (decision.schema !== RECOVERY_DECISION_SCHEMA || decision.parent_execution_id !== parentExecutionId || decision.plan_id !== planId)
                throw new Error('recovery-decision-binding-invalid');
            if (decision.plan_revision !== planRevision)
                return result({ status: 'stale-decision' });
            if (winner) {
                const status = winner.decision_digest === decision.decision_digest ? 'duplicate' : 'conflict';
                return result({ status, current_decision: clone(winner) });
            }
            winner = clone(decision);
            return result({ status: 'accepted', decision: clone(decision) });
        },
        getDecision() {
            return winner ? clone(winner) : null;
        },
    };
}
