export const RECOVERY_PLAN_REVISION_SCHEMA = 'zj-loop.recovery_plan_revision.v1' as const;

export type RecoveryPlanRevisionRecord = {
  schema: typeof RECOVERY_PLAN_REVISION_SCHEMA;
  recovery_plan_id: string;
  event_id: string;
  plan_id: string;
  plan_revision: number;
  parent_plan_id: string;
  parent_plan_revision: number;
  parent_execution_id: string;
  recovery_decision_id: string;
  uncertainty_evidence_id: string;
  orchestration_plan_artifact_id: string;
  plan_digest: string;
  grant_digest: string;
  resource_isolation_profile: string;
  status: 'recovery-planned';
  repreflight_artifact_id: string | null;
  created_by: string;
  created_at: string;
  side_effects_executed: false;
};

export type RecoveryPlanRevisionReadiness = {
  status: 'execution-ready' | 'blocked';
  side_effects_executed: false;
  reason?: string;
};

function text(value: unknown, error: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(error);
  return value;
}

function revision(value: unknown, error: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(error);
  return value as number;
}

export function createRecoveryPlanRevisionRecord(input: Omit<RecoveryPlanRevisionRecord, 'schema' | 'status' | 'repreflight_artifact_id' | 'side_effects_executed'> & { side_effects_executed?: false }): RecoveryPlanRevisionRecord {
  if (input.side_effects_executed !== undefined && input.side_effects_executed !== false) throw new Error('recovery-plan-revision-side-effects-invalid');
  const parentRevision = revision(input.parent_plan_revision, 'recovery-plan-revision-parent-invalid');
  const planRevision = revision(input.plan_revision, 'recovery-plan-revision-invalid');
  if (planRevision <= parentRevision) throw new Error('recovery-plan-revision-must-advance');
  const digest = (value: unknown, error: string): string => {
    const candidate = text(value, error);
    if (!/^sha256:[0-9a-f]{64}$/.test(candidate)) throw new Error(error);
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

export function evaluateRecoveryPlanRevisionReadiness(input: {
  record: RecoveryPlanRevisionRecord;
  artifact_id?: string;
  preflight?: { schema?: unknown; status?: unknown; side_effects_executed?: unknown; plan_id?: unknown; plan_revision?: unknown; plan_digest?: unknown; grant_digest?: unknown };
}): RecoveryPlanRevisionReadiness {
  const blocked = (reason: string): RecoveryPlanRevisionReadiness => ({ status: 'blocked', side_effects_executed: false, reason });
  const { record, artifact_id, preflight } = input;
  if (!record.repreflight_artifact_id) return blocked('recovery-repreflight-required');
  if (artifact_id !== record.repreflight_artifact_id) return blocked('recovery-repreflight-artifact-mismatch');
  if (!preflight || preflight.schema !== 'zj-loop.orchestration_preflight.v1' || preflight.status !== 'execution-ready' || preflight.side_effects_executed !== false) return blocked('recovery-repreflight-not-execution-ready');
  if (preflight.plan_id !== record.plan_id || preflight.plan_revision !== record.plan_revision || preflight.plan_digest !== record.plan_digest || preflight.grant_digest !== record.grant_digest) return blocked('recovery-repreflight-binding-mismatch');
  return { status: 'execution-ready', side_effects_executed: false };
}
