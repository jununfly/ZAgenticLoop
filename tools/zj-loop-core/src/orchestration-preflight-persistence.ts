import canonicalize from 'canonicalize';
import type { ContentAddressedArtifactStore } from './content-addressed-artifact-store.js';
import type { OrchestrationPreflightResult } from './orchestration-preflight.js';
import type { SqliteStateStore } from './sqlite-state-store.js';

export const ORCHESTRATION_PREFLIGHT_FACT_SCHEMA = 'zj-loop.orchestration_preflight_fact.v1' as const;

export type OrchestrationPreflightPersistenceResult = {
  status: 'recorded' | 'duplicate' | 'conflict';
  artifact_id: string;
  artifact_sha256: string;
  state_revision?: number;
  current_revision: number;
  reason?: string;
};

export async function persistOrchestrationPreflight(input: {
  stateStore: SqliteStateStore;
  artifactStore: ContentAddressedArtifactStore;
  network_id: string;
  expected_revision: number;
  event_id: string;
  result: OrchestrationPreflightResult;
  now?: string;
}): Promise<OrchestrationPreflightPersistenceResult> {
  if (!/^sha256:[0-9a-f]{64}$/.test(input.result.plan_digest) || input.result.side_effects_executed !== false) throw new Error('orchestration-preflight-result-invalid');
  const json = canonicalize(input.result);
  if (typeof json !== 'string') throw new Error('orchestration-preflight-artifact-invalid');
  const content = new TextEncoder().encode(json);
  const artifact = await input.artifactStore.putArtifact({ network_id: input.network_id, content, content_type: 'application/vnd.zj-loop.orchestration-preflight+json', now: input.now });
  const event = await input.stateStore.appendEvent({
    network_id: input.network_id,
    expected_revision: input.expected_revision,
    now: input.now,
    event: {
      event_id: input.event_id,
      aggregate_type: 'orchestration-plan',
      aggregate_id: input.result.plan_id,
      event_type: input.result.status === 'execution-ready' ? 'orchestration.preflight.completed' : 'orchestration.preflight.blocked',
      occurred_at: input.now ?? new Date().toISOString(),
      payload: {
        schema: ORCHESTRATION_PREFLIGHT_FACT_SCHEMA,
        network_id: input.network_id,
        plan_id: input.result.plan_id,
        plan_revision: input.result.plan_revision,
        plan_digest: input.result.plan_digest,
        preflight_status: input.result.status,
        artifact_id: artifact.metadata.artifact_id,
        artifact_sha256: artifact.metadata.content_sha256,
        artifact_schema: input.result.schema,
        side_effects_executed: false,
      },
    },
  });
  return { status: event.status, artifact_id: artifact.metadata.artifact_id, artifact_sha256: artifact.metadata.content_sha256, ...(event.revision === undefined ? {} : { state_revision: event.revision }), current_revision: event.current_revision, ...(event.reason === undefined ? {} : { reason: event.reason }) };
}
