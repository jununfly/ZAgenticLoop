import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createContentAddressedArtifactStore } from '../dist/content-addressed-artifact-store.js';
import { createOrchestrationPlan, orchestrationPlanDigest, orchestrationPlanProfileSha256 } from '../dist/orchestration-plan.js';
import { orchestrationCapabilityGrantDigest } from '../dist/orchestration-preflight.js';
import { claimOrchestrationTask } from '../dist/orchestration-runtime-claim.js';
import { createSqliteStateStore } from '../dist/sqlite-state-store.js';

function task(id, assigned_node) {
  return { task_id: id, status: 'planned', inputs: [], outputs: [`artifact:${id}`], resource_bindings: [{ resource_id: `resource:${id}`, access_mode: 'read', isolation_strategy: 'not-applicable', strategy_reason: 'fixture', merge_owner: 'human', unknowns: [] }], capability_grant: { grant_id: `grant:${id}`, network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, event_id: 'event-1', task_id: id, assigned_node, capabilities: [], resource_scope: [`resource:${id}`], issued_at: '2026-07-30T00:00:00.000Z', expires_at: '2026-07-30T01:00:00.000Z', grant_digest: 'sha256:' + '0'.repeat(64) }, verification_conditions: ['present'] };
}

test('runtime claim revalidates persisted context and is idempotent through StateStore CAS', async () => {
  const plan = createOrchestrationPlan({ schema: 'zj-loop.orchestration_plan.v1', protocol_version: 'orchestration-plan.v1', plan_id: 'plan-1', plan_revision: 1, network_id: 'network-1', event_id: 'event-1', status: 'draft', canonicalization: 'jcs-rfc8785', canonicalization_profile: 'orchestration-plan-v1-2026-07', profile_sha256: orchestrationPlanProfileSha256(), center_node_id: 'center', review_handoff_node_id: 'handoff', nodes: [{ node_id: 'center', role: 'center', assigned_node: 'codex', task: task('center-task', 'codex') }, { node_id: 'handoff', role: 'review-handoff', assigned_node: 'codex', task: task('handoff-task', 'codex') }], edges: [{ edge_id: 'edge-1', from_node_id: 'center', to_node_id: 'handoff', type: 'control' }] });
  for (const node of plan.nodes) node.task.capability_grant.grant_digest = orchestrationCapabilityGrantDigest(node.task.capability_grant);
  plan.plan_digest = orchestrationPlanDigest(plan);
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-runtime-claim-'));
  const stateStore = createSqliteStateStore({ filename: path.join(root, 'state.db') });
  const artifactStore = createContentAddressedArtifactStore({ root: path.join(root, 'artifacts') });
  try {
    await stateStore.createNetwork({ network_id: 'network-1', owner_id: 'human-1', now: '2026-07-30T00:00:00.000Z' });
    const grant = plan.nodes[0].task.capability_grant;
    const stored = await artifactStore.putArtifact({ network_id: 'network-1', content: new TextEncoder().encode(JSON.stringify({ schema: 'zj-loop.orchestration_preflight.v1', status: 'execution-ready', side_effects_executed: false, network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: plan.plan_digest, expires_at: '2026-07-30T01:00:00.000Z', errors: [], task_grants: [{ task_id: grant.task_id, node_id: 'center', capabilities: [], resource_scope: grant.resource_scope, grant_digest: grant.grant_digest }], isolation: [] })), content_type: 'application/json', now: '2026-07-30T00:30:00.000Z' });
    const input = { stateStore, artifactStore, network_id: 'network-1', expected_revision: 1, preflight_artifact_id: stored.metadata.artifact_id, plan, task_id: 'center-task', node_id: 'center', enrollment: { node_id: 'codex', network_id: 'network-1', status: 'approved', capability_ceiling: [] }, now: '2026-07-30T00:30:00.000Z' };
    const first = await claimOrchestrationTask(input);
    assert.equal(first.status, 'claimed', first.reason);
    assert.equal(first.revision, 2);
    const second = await claimOrchestrationTask({ ...input, expected_revision: 2 });
    assert.equal(second.status, 'duplicate');
    const events = await stateStore.readEvents({ network_id: 'network-1', after_revision: 1 });
    assert.equal(events.events.length, 1);
    assert.equal(events.events[0].event_type, 'task.claimed');
  } finally {
    await stateStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
