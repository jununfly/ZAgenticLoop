import canonicalize from 'canonicalize';
import { createRecoveryPlanRevisionRecord } from './recovery-plan-revision.js';
export const RECOVERY_PLAN_REVISION_FACT_SCHEMA = 'zj-loop.recovery_plan_revision_fact.v1';
export async function persistRecoveryPlanRevisionRecord(input) {
    const record = createRecoveryPlanRevisionRecord(input.record);
    const json = canonicalize(record);
    if (typeof json !== 'string')
        throw new Error('recovery-plan-revision-artifact-invalid');
    const artifact = await input.artifactStore.putArtifact({
        network_id: input.network_id,
        content: new TextEncoder().encode(json),
        content_type: 'application/vnd.zj-loop.recovery-plan-revision+json',
        now: input.now,
    });
    const event = await input.stateStore.appendEvent({
        network_id: input.network_id,
        expected_revision: input.expected_revision,
        now: input.now,
        event: {
            event_id: `recovery-plan-revision-created:${record.recovery_plan_id}`,
            aggregate_type: 'recovery-plan',
            aggregate_id: record.recovery_plan_id,
            event_type: 'recovery.plan-revision.created',
            occurred_at: record.created_at,
            payload: {
                schema: RECOVERY_PLAN_REVISION_FACT_SCHEMA,
                network_id: input.network_id,
                recovery_plan_id: record.recovery_plan_id,
                event_id: record.event_id,
                plan_id: record.plan_id,
                plan_revision: record.plan_revision,
                plan_digest: record.plan_digest,
                grant_digest: record.grant_digest,
                recovery_decision_id: record.recovery_decision_id,
                parent_execution_id: record.parent_execution_id,
                artifact_id: artifact.metadata.artifact_id,
                artifact_sha256: artifact.metadata.content_sha256,
                status: record.status,
                side_effects_executed: false,
            },
        },
    });
    return {
        status: event.status,
        artifact_id: artifact.metadata.artifact_id,
        artifact_sha256: artifact.metadata.content_sha256,
        ...(event.revision === undefined ? {} : { state_revision: event.revision }),
        current_revision: event.current_revision,
        ...(event.reason === undefined ? {} : { reason: event.reason }),
    };
}
