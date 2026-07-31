export const RECOVERY_PLAN_REVISION_SCHEMA = 'zj-loop.recovery_plan_revision.v1';
function text(value, error) {
    if (typeof value !== 'string' || !value.trim())
        throw new Error(error);
    return value;
}
function revision(value, error) {
    if (!Number.isInteger(value) || value < 1)
        throw new Error(error);
    return value;
}
export function createRecoveryPlanRevisionRecord(input) {
    if (input.side_effects_executed !== undefined && input.side_effects_executed !== false)
        throw new Error('recovery-plan-revision-side-effects-invalid');
    const parentRevision = revision(input.parent_plan_revision, 'recovery-plan-revision-parent-invalid');
    const planRevision = revision(input.plan_revision, 'recovery-plan-revision-invalid');
    if (planRevision <= parentRevision)
        throw new Error('recovery-plan-revision-must-advance');
    const digest = (value, error) => {
        const candidate = text(value, error);
        if (!/^sha256:[0-9a-f]{64}$/.test(candidate))
            throw new Error(error);
        return candidate;
    };
    return {
        schema: RECOVERY_PLAN_REVISION_SCHEMA,
        recovery_plan_id: text(input.recovery_plan_id, 'recovery-plan-revision-id-required'),
        event_id: text(input.event_id, 'recovery-plan-revision-event-id-required'),
        plan_id: text(input.plan_id, 'recovery-plan-revision-plan-id-required'),
        plan_revision: planRevision,
        parent_plan_id: text(input.parent_plan_id, 'recovery-plan-revision-parent-plan-required'),
        parent_plan_revision: parentRevision,
        parent_execution_id: text(input.parent_execution_id, 'recovery-plan-revision-parent-execution-required'),
        recovery_decision_id: text(input.recovery_decision_id, 'recovery-plan-revision-decision-required'),
        uncertainty_evidence_id: text(input.uncertainty_evidence_id, 'recovery-plan-revision-evidence-required'),
        orchestration_plan_artifact_id: text(input.orchestration_plan_artifact_id, 'recovery-plan-revision-plan-artifact-required'),
        plan_digest: digest(input.plan_digest, 'recovery-plan-revision-plan-digest-invalid'),
        grant_digest: digest(input.grant_digest, 'recovery-plan-revision-grant-digest-invalid'),
        resource_isolation_profile: text(input.resource_isolation_profile, 'recovery-plan-revision-isolation-profile-required'),
        status: 'recovery-planned',
        repreflight_artifact_id: null,
        created_by: text(input.created_by, 'recovery-plan-revision-created-by-required'),
        created_at: text(input.created_at, 'recovery-plan-revision-created-at-required'),
        side_effects_executed: false,
    };
}
export function evaluateRecoveryPlanRevisionReadiness(input) {
    const blocked = (reason) => ({ status: 'blocked', side_effects_executed: false, reason });
    const { record, artifact_id, preflight } = input;
    if (!record.repreflight_artifact_id)
        return blocked('recovery-repreflight-required');
    if (artifact_id !== record.repreflight_artifact_id)
        return blocked('recovery-repreflight-artifact-mismatch');
    if (!preflight || preflight.schema !== 'zj-loop.orchestration_preflight.v1' || preflight.status !== 'execution-ready' || preflight.side_effects_executed !== false)
        return blocked('recovery-repreflight-not-execution-ready');
    if (preflight.plan_id !== record.plan_id || preflight.plan_revision !== record.plan_revision || preflight.plan_digest !== record.plan_digest || preflight.grant_digest !== record.grant_digest)
        return blocked('recovery-repreflight-binding-mismatch');
    return { status: 'execution-ready', side_effects_executed: false };
}
