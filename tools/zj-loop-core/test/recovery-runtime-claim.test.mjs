import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimRecoveryTask } from '../dist/recovery-runtime-claim.js';
import { createContentAddressedArtifactStore } from '../dist/content-addressed-artifact-store.js';
import { createOrchestrationPlan, orchestrationPlanDigest, orchestrationPlanProfileSha256 } from '../dist/orchestration-plan.js';
import { orchestrationCapabilityGrantDigest } from '../dist/orchestration-preflight.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const record = {
  schema: 'zj-loop.recovery_plan_revision.v1',
  recovery_plan_id: 'recovery-plan-1',
  event_id: 'event-1',
  plan_id: 'plan-2',
  plan_revision: 4,
  parent_plan_id: 'plan-1',
  parent_plan_revision: 3,
  parent_execution_id: 'execution-1',
  recovery_decision_id: 'recovery-1',
  uncertainty_evidence_id: 'evidence-1',
  orchestration_plan_artifact_id: 'artifact-plan-2',
  plan_digest: `sha256:${'a'.repeat(64)}`,
  grant_digest: `sha256:${'b'.repeat(64)}`,
  resource_isolation_profile: 'worktree-per-node-v1',
  status: 'recovery-planned',
  repreflight_artifact_id: null,
  created_by: 'center',
  created_at: '2026-07-31T00:00:00.000Z',
  side_effects_executed: false,
};

test('recovery runtime claim blocks before generic claim without re-preflight', async () => {
  const result = await claimRecoveryTask({
    recovery_record: record,
    parent_execution_id: 'execution-1',
    network_id: 'network-1',
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'recovery-repreflight-required');
  assert.equal(result.side_effects_executed, false);
});

test('recovery runtime claim blocks parent execution binding drift', async () => {
  const result = await claimRecoveryTask({
    recovery_record: record,
    parent_execution_id: 'execution-other',
    network_id: 'network-1',
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'recovery-parent-execution-mismatch');
  assert.equal(result.side_effects_executed, false);
});

test('recovery runtime claim rejects a preflight artifact different from the record binding', async () => {
  const result = await claimRecoveryTask({
    recovery_record: { ...record, repreflight_artifact_id: 'artifact-bound' },
    parent_execution_id: 'execution-1',
    network_id: 'network-1',
    preflight_artifact_id: 'artifact-other',
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'recovery-repreflight-artifact-mismatch');
  assert.equal(result.side_effects_executed, false);
});

test('recovery runtime claim requires a persisted parent execution fact', async () => {
  const result = await claimRecoveryTask({
    recovery_record: { ...record, repreflight_artifact_id: 'artifact-bound' },
    parent_execution_id: 'execution-1',
    network_id: 'network-1',
    preflight_artifact_id: 'artifact-bound',
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'recovery-parent-execution-fact-missing');
  assert.equal(result.side_effects_executed, false);
});

function task(id, assigned_node) {
  return {
    task_id: id,
    status: 'planned',
    inputs: [],
    outputs: [`artifact:${id}`],
    resource_bindings: [{ resource_id: `resource:${id}`, access_mode: 'read', isolation_strategy: 'not-applicable', strategy_reason: 'fixture', merge_owner: 'human', unknowns: [] }],
    capability_grant: {
      grant_id: `grant:${id}`,
      network_id: 'network-1',
      plan_id: 'plan-2',
      plan_revision: 4,
      event_id: 'event-1',
      task_id: id,
      assigned_node,
      capabilities: [],
      resource_scope: [`resource:${id}`],
      issued_at: '2026-07-31T00:00:00.000Z',
      expires_at: '2026-07-31T01:00:00.000Z',
      grant_digest: `sha256:${'0'.repeat(64)}`,
    },
    verification_conditions: ['present'],
  };
}

test('recovery runtime claim delegates a fully bound recovery task to generic claim', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-recovery-claim-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const artifactStore = createContentAddressedArtifactStore({ root: path.join(root, 'artifacts') });
  try {
    const plan = createOrchestrationPlan({
      schema: 'zj-loop.orchestration_plan.v1',
      protocol_version: 'orchestration-plan.v1',
      plan_id: 'plan-2',
      plan_revision: 4,
      network_id: 'network-1',
      event_id: 'event-1',
      status: 'draft',
      canonicalization: 'jcs-rfc8785',
      canonicalization_profile: 'orchestration-plan-v1-2026-07',
      profile_sha256: orchestrationPlanProfileSha256(),
      center_node_id: 'center',
      review_handoff_node_id: 'handoff',
      nodes: [
        { node_id: 'center', role: 'center', assigned_node: 'codex', task: task('center-task', 'codex') },
        { node_id: 'handoff', role: 'review-handoff', assigned_node: 'codex', task: task('handoff-task', 'codex') },
      ],
      edges: [{ edge_id: 'edge-1', from_node_id: 'center', to_node_id: 'handoff', type: 'control' }],
    });
    for (const node of plan.nodes) node.task.capability_grant.grant_digest = orchestrationCapabilityGrantDigest(node.task.capability_grant);
    plan.plan_digest = orchestrationPlanDigest(plan);
    const grant = plan.nodes[0].task.capability_grant;
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-31T00:00:00.000Z' });
    await stateStore.appendEvent({
      network_id: 'network-1',
      expected_revision: 1,
      now: '2026-07-31T00:00:00.000Z',
      event: {
        event_id: 'execution-started-1',
        aggregate_type: 'execution',
        aggregate_id: 'execution-1',
        event_type: 'execution.started',
        occurred_at: '2026-07-31T00:00:00.000Z',
        payload: { schema: 'zj-loop.execution_started.v1', network_id: 'network-1', event_id: 'event-1', execution_id: 'execution-1', plan_id: 'plan-1', plan_revision: 3, grant_digest: `sha256:${'c'.repeat(64)}`, assigned_node: 'codex' },
      },
    });
    const preflight = { schema: 'zj-loop.orchestration_preflight.v1', status: 'execution-ready', side_effects_executed: false, network_id: 'network-1', plan_id: 'plan-2', plan_revision: 4, plan_digest: plan.plan_digest, grant_digest: grant.grant_digest, expires_at: '2026-07-31T01:00:00.000Z', errors: [], task_grants: [{ task_id: grant.task_id, node_id: 'center', capabilities: [], resource_scope: grant.resource_scope, grant_digest: grant.grant_digest }], isolation: [] };
    const stored = await artifactStore.putArtifact({ network_id: 'network-1', content: new TextEncoder().encode(JSON.stringify(preflight)), content_type: 'application/json', now: '2026-07-31T00:00:00.000Z' });
    const recoveryRecord = { ...record, plan_id: 'plan-2', plan_revision: 4, parent_plan_id: 'plan-1', parent_plan_revision: 3, plan_digest: plan.plan_digest, grant_digest: grant.grant_digest, repreflight_artifact_id: stored.metadata.artifact_id };
    const result = await claimRecoveryTask({ recovery_record: recoveryRecord, parent_execution_id: 'execution-1', network_id: 'network-1', stateStore, artifactStore, expected_revision: 2, preflight_artifact_id: stored.metadata.artifact_id, plan, task_id: 'center-task', node_id: 'center', enrollment: { node_id: 'codex', network_id: 'network-1', status: 'approved', capability_ceiling: [] }, now: '2026-07-31T00:30:00.000Z' });
    assert.equal(result.status, 'claimed', result.reason);
    assert.equal(result.side_effects_executed, false);
    const retry = await claimRecoveryTask({ recovery_record: recoveryRecord, parent_execution_id: 'execution-1', network_id: 'network-1', stateStore, artifactStore, expected_revision: 3, preflight_artifact_id: stored.metadata.artifact_id, plan, task_id: 'center-task', node_id: 'center', enrollment: { node_id: 'codex', network_id: 'network-1', status: 'approved', capability_ceiling: [] }, now: '2026-07-31T00:30:01.000Z' });
    assert.equal(retry.status, 'duplicate', retry.reason);
    assert.equal(retry.side_effects_executed, false);
    const events = await stateStore.readEvents({ network_id: 'network-1', after_revision: 2 });
    assert.equal(events.events.length, 1);
    assert.equal(events.events[0].event_type, 'task.claimed');
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
