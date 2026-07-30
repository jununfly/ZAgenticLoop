import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOrchestrationPlan, orchestrationPlanDigest, orchestrationPlanProfileSha256 } from '../dist/orchestration-plan.js';
import { createOrchestrationPlanApproval } from '../dist/orchestration-plan-approval.js';
import { createInMemoryHumanSigner } from '../dist/human-signer.js';
import { evaluateOrchestrationPreflight, orchestrationCapabilityGrantDigest } from '../dist/orchestration-preflight.js';

function task(id, assigned_node) {
  return { task_id: id, status: 'planned', inputs: [], outputs: [`artifact:${id}`], resource_bindings: [{ resource_id: `resource:${id}`, access_mode: 'read', isolation_strategy: 'not-applicable', strategy_reason: 'fixture', merge_owner: 'human', unknowns: [] }], capability_grant: { grant_id: `grant:${id}`, network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, event_id: 'event-1', task_id: id, assigned_node, capabilities: [], resource_scope: [`resource:${id}`], issued_at: '2026-07-30T00:00:00.000Z', expires_at: '2026-07-30T01:00:00.000Z', grant_digest: 'sha256:' + '1'.repeat(64) }, verification_conditions: ['present'] };
}

test('orchestration preflight blocks without Human approval and has no grants or side effects', () => {
  const plan = createOrchestrationPlan({ schema: 'zj-loop.orchestration_plan.v1', protocol_version: 'orchestration-plan.v1', plan_id: 'plan-1', plan_revision: 1, network_id: 'network-1', event_id: 'event-1', status: 'draft', canonicalization: 'jcs-rfc8785', canonicalization_profile: 'orchestration-plan-v1-2026-07', profile_sha256: orchestrationPlanProfileSha256(), center_node_id: 'center', review_handoff_node_id: 'handoff', nodes: [{ node_id: 'center', role: 'center', assigned_node: 'human', task: task('center-task', 'human') }, { node_id: 'handoff', role: 'review-handoff', assigned_node: 'human', task: task('handoff-task', 'human') }], edges: [{ edge_id: 'edge-1', from_node_id: 'center', to_node_id: 'handoff', type: 'control' }] });
  const result = evaluateOrchestrationPreflight({ plan, enrollment: { human: { node_id: 'human', network_id: 'network-1', status: 'approved', capability_ceiling: [] } }, isolation_evidence: [{ resource_id: 'resource:center-task', strategy: 'not-applicable', status: 'verified', evidence: {} }, { resource_id: 'resource:handoff-task', strategy: 'not-applicable', status: 'verified', evidence: {} }], now: '2026-07-30T00:30:00.000Z' });
  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.some((error) => error.code === 'human-approval-required'));
  assert.deepEqual(result.task_grants, []);
  assert.equal(result.side_effects_executed, false);
});

test('grant digest is canonical and drift is a blocking preflight error', () => {
  const grant = { grant_id: 'grant-1', network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, event_id: 'event-1', task_id: 'task-1', assigned_node: 'codex', capabilities: ['artifact.write'], resource_scope: ['repo:1'], issued_at: '2026-07-30T00:00:00.000Z', expires_at: '2026-07-30T01:00:00.000Z', grant_digest: 'sha256:' + '0'.repeat(64) };
  assert.match(orchestrationCapabilityGrantDigest(grant), /^sha256:[0-9a-f]{64}$/);
});

test('orchestration preflight reaches execution-ready only with complete approval and facts', async () => {
  const plan = createOrchestrationPlan({ schema: 'zj-loop.orchestration_plan.v1', protocol_version: 'orchestration-plan.v1', plan_id: 'plan-1', plan_revision: 1, network_id: 'network-1', event_id: 'event-1', status: 'draft', canonicalization: 'jcs-rfc8785', canonicalization_profile: 'orchestration-plan-v1-2026-07', profile_sha256: orchestrationPlanProfileSha256(), center_node_id: 'center', review_handoff_node_id: 'handoff', nodes: [{ node_id: 'center', role: 'center', assigned_node: 'human', task: task('center-task', 'human') }, { node_id: 'handoff', role: 'review-handoff', assigned_node: 'human', task: task('handoff-task', 'human') }], edges: [{ edge_id: 'edge-1', from_node_id: 'center', to_node_id: 'handoff', type: 'control' }] });
  for (const node of plan.nodes) node.task.capability_grant.grant_digest = orchestrationCapabilityGrantDigest(node.task.capability_grant);
  plan.plan_digest = orchestrationPlanDigest(plan);
  const signer = createInMemoryHumanSigner({ human_id: 'human-1' });
  const identity = await signer.getPublicIdentity();
  const approvalInput = { network_id: 'network-1', plan_id: 'plan-1', plan_revision: 1, plan_digest: plan.plan_digest, request_id: 'approval-1', approved_capabilities: [], issued_at: '2026-07-30T00:00:00.000Z', expires_at: '2026-07-30T01:00:00.000Z', device_key_id: 'device-1', device_fingerprint: 'c'.repeat(64) };
  const approval = await createOrchestrationPlanApproval({ signer, ...approvalInput });
  const result = evaluateOrchestrationPreflight({ plan, approval: { context: approval, identity, expected: approvalInput }, enrollment: { human: { node_id: 'human', network_id: 'network-1', status: 'approved', capability_ceiling: [] } }, isolation_evidence: plan.nodes.map((node) => ({ resource_id: node.task.resource_bindings[0].resource_id, strategy: 'not-applicable', status: 'verified', evidence: {} })), now: '2026-07-30T00:30:00.000Z' });
  assert.equal(result.status, 'execution-ready');
  assert.equal(result.errors.length, 0);
  assert.equal(result.task_grants.length, 2);
  assert.equal(result.side_effects_executed, false);
});
