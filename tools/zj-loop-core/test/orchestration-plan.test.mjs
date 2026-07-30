import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createOrchestrationPlan,
  validateOrchestrationPlan,
  orchestrationPlanDigest,
  orchestrationPlanProfileSha256,
} from '../dist/orchestration-plan.js';

const profile = 'orchestration-plan-v1-2026-07';

function binding(resource_id, isolation_strategy = 'not-applicable', access_mode = 'read') {
  return { resource_id, access_mode, isolation_strategy, strategy_reason: 'fixture-bound', merge_owner: 'human+codex', unknowns: [] };
}

function node(node_id, role, assigned_node, resource_id, capabilities = []) {
  const task_id = `${node_id}-task`;
  return {
    node_id,
    role,
    assigned_node,
    task: {
      task_id,
      status: 'planned',
      inputs: [],
      outputs: [`artifact:${task_id}`],
      resource_bindings: [binding(resource_id, role === 'execution' ? 'git-branch-worktree' : 'not-applicable', role === 'execution' ? 'read-write' : 'read')],
      capability_grant: {
        grant_id: `grant:${task_id}`,
        network_id: 'network-1',
        plan_id: 'plan-1',
        plan_revision: 1,
        event_id: 'event-1',
        task_id,
        assigned_node,
        capabilities,
        resource_scope: [resource_id],
        issued_at: '2026-07-30T00:00:00.000Z',
        expires_at: '2026-07-30T01:00:00.000Z',
        grant_digest: 'sha256:' + '1'.repeat(64),
      },
      verification_conditions: ['output-present'],
    },
  };
}

function unsignedPlan() {
  return {
    schema: 'zj-loop.orchestration_plan.v1',
    protocol_version: 'orchestration-plan.v1',
    plan_id: 'plan-1',
    plan_revision: 1,
    network_id: 'network-1',
    event_id: 'event-1',
    status: 'draft',
    canonicalization: 'jcs-rfc8785',
    canonicalization_profile: profile,
    profile_sha256: orchestrationPlanProfileSha256(),
    center_node_id: 'center',
    review_handoff_node_id: 'handoff',
    nodes: [
      node('center', 'center', 'human+codex', 'resource:center'),
      node('codex', 'execution', 'codex', 'repo:codex', ['artifact.write']),
      node('workbuddy', 'execution', 'workbuddy', 'repo:workbuddy', ['artifact.write']),
      node('aggregate', 'aggregation', 'human+codex', 'resource:aggregate'),
      node('verify', 'verification', 'workbuddy', 'resource:verify', ['artifact.read']),
      node('handoff', 'review-handoff', 'human+codex', 'resource:handoff'),
    ],
    edges: [
      { edge_id: 'edge-1', from_node_id: 'center', to_node_id: 'codex', type: 'control' },
      { edge_id: 'edge-2', from_node_id: 'center', to_node_id: 'workbuddy', type: 'control' },
      { edge_id: 'edge-3', from_node_id: 'codex', to_node_id: 'aggregate', type: 'data', input_ref: 'artifact:codex-task', output_ref: 'artifact:codex-task' },
      { edge_id: 'edge-4', from_node_id: 'workbuddy', to_node_id: 'aggregate', type: 'data', input_ref: 'artifact:workbuddy-task', output_ref: 'artifact:workbuddy-task' },
      { edge_id: 'edge-5', from_node_id: 'aggregate', to_node_id: 'verify', type: 'verification' },
      { edge_id: 'edge-6', from_node_id: 'verify', to_node_id: 'handoff', type: 'control' },
    ],
  };
}

test('OrchestrationPlan creates a deterministic digest for the minimum Graph Atom', () => {
  const plan = createOrchestrationPlan(unsignedPlan());
  assert.match(plan.plan_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(plan.plan_digest, orchestrationPlanDigest(plan));
  assert.deepEqual(validateOrchestrationPlan(plan), { status: 'valid', errors: [], plan_digest: plan.plan_digest });
});

test('Graph validator rejects cycles, orphan nodes, invalid strategies, and incomplete fan-in together', () => {
  const plan = createOrchestrationPlan(unsignedPlan());
  plan.edges.push({ edge_id: 'edge-cycle', from_node_id: 'verify', to_node_id: 'codex', type: 'control' });
  plan.nodes.push(node('orphan', 'execution', 'workbuddy', 'repo:orphan', ['artifact.write']));
  plan.nodes[1].task.resource_bindings[0].isolation_strategy = 'invented-strategy';
  plan.nodes[3].task.inputs = [];
  const result = validateOrchestrationPlan(plan);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.errors.map((error) => error.code), [
    'graph-cycle',
    'node-unreachable',
    'resource-isolation-strategy-unknown',
    'aggregation-inputs-incomplete',
  ]);
  assert.deepEqual(result.errors, [...result.errors].sort((left, right) => `${left.path}:${left.code}`.localeCompare(`${right.path}:${right.code}`)));
});

test('Graph validator rejects unknown fields and invalid task lifecycle transitions', () => {
  const plan = unsignedPlan();
  plan.extra = true;
  assert.throws(() => createOrchestrationPlan(plan), { message: 'orchestration-plan-schema-invalid' });
  const valid = createOrchestrationPlan(unsignedPlan());
  valid.nodes[1].task.status = 'verified';
  const result = validateOrchestrationPlan(valid);
  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.some((error) => error.code === 'task-initial-state-invalid'));
});
