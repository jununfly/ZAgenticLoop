import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import {
  ORCHESTRATION_PLAN_CANONICALIZATION,
  ORCHESTRATION_PLAN_PROFILE,
  isResourceIsolationStrategy,
  orchestrationPlanProfileSha256,
  type ResourceIsolationStrategy,
} from './protocol-registry.js';

export type OrchestrationNodeRole = 'center' | 'execution' | 'aggregation' | 'verification' | 'review-handoff';
export type OrchestrationEdgeType = 'control' | 'data' | 'verification' | 'recovery';
export type TaskStatus = 'planned' | 'ready' | 'claimed' | 'running' | 'blocked' | 'failed' | 'succeeded' | 'verified' | 'cancelled';

export type ResourceBinding = {
  resource_id: string;
  access_mode: 'read' | 'read-write' | 'append-only';
  isolation_strategy: ResourceIsolationStrategy;
  strategy_reason: string;
  merge_owner: string;
  unknowns: string[];
};

export type OrchestrationCapabilityGrant = {
  grant_id: string;
  network_id: string;
  plan_id: string;
  plan_revision: number;
  event_id: string;
  task_id: string;
  assigned_node: string;
  capabilities: string[];
  resource_scope: string[];
  issued_at: string;
  expires_at: string;
  grant_digest: string;
};

export type OrchestrationTask = {
  task_id: string;
  status: TaskStatus;
  inputs: string[];
  outputs: string[];
  resource_bindings: ResourceBinding[];
  capability_grant: OrchestrationCapabilityGrant;
  verification_conditions: string[];
};

export type OrchestrationNode = { node_id: string; role: OrchestrationNodeRole; assigned_node: string; task: OrchestrationTask };
export type OrchestrationEdge = { edge_id: string; from_node_id: string; to_node_id: string; type: OrchestrationEdgeType; input_ref?: string; output_ref?: string };
export type OrchestrationPlan = {
  schema: 'zj-loop.orchestration_plan.v1';
  protocol_version: 'orchestration-plan.v1';
  plan_id: string;
  plan_revision: number;
  network_id: string;
  event_id: string;
  status: 'draft' | 'preflight-ready' | 'dispatchable' | 'completed' | 'blocked' | 'cancelled';
  canonicalization: typeof ORCHESTRATION_PLAN_CANONICALIZATION;
  canonicalization_profile: typeof ORCHESTRATION_PLAN_PROFILE;
  profile_sha256: string;
  center_node_id: string;
  review_handoff_node_id: string;
  nodes: OrchestrationNode[];
  edges: OrchestrationEdge[];
  plan_digest: string;
};

export type PlanError = { code: string; path: string; message: string; severity: 'error'; blocking: true };
export type PlanValidation = { status: 'valid' | 'blocked'; errors: PlanError[]; plan_digest: string };

const NODE_KEYS = ['node_id', 'role', 'assigned_node', 'task'];
const TASK_KEYS = ['task_id', 'status', 'inputs', 'outputs', 'resource_bindings', 'capability_grant', 'verification_conditions'];
const BINDING_KEYS = ['resource_id', 'access_mode', 'isolation_strategy', 'strategy_reason', 'merge_owner', 'unknowns'];
const GRANT_KEYS = ['grant_id', 'network_id', 'plan_id', 'plan_revision', 'event_id', 'task_id', 'assigned_node', 'capabilities', 'resource_scope', 'issued_at', 'expires_at', 'grant_digest'];
const EDGE_KEYS = ['edge_id', 'from_node_id', 'to_node_id', 'type', 'input_ref', 'output_ref'];
const PLAN_KEYS = ['schema', 'protocol_version', 'plan_id', 'plan_revision', 'network_id', 'event_id', 'status', 'canonicalization', 'canonicalization_profile', 'profile_sha256', 'center_node_id', 'review_handoff_node_id', 'nodes', 'edges', 'plan_digest'];

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).every((key) => allowed.includes(key)); }
function requiredString(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(requiredString); }
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0; }
function error(code: string, path: string, message: string): PlanError { return { code, path, message, severity: 'error', blocking: true }; }

function schemaErrors(plan: unknown): PlanError[] {
  const errors: PlanError[] = [];
  if (!isRecord(plan) || !exactKeys(plan, PLAN_KEYS)) return [error('schema-unknown-field', '$', 'orchestration plan must use the closed schema')];
  for (const key of ['schema', 'protocol_version', 'plan_id', 'network_id', 'event_id', 'canonicalization', 'canonicalization_profile', 'profile_sha256', 'center_node_id', 'review_handoff_node_id', 'plan_digest']) if (!requiredString(plan[key])) errors.push(error('schema-required-field-missing', `$.${key}`, `${key} must be a non-empty string`));
  if (!integer(plan.plan_revision)) errors.push(error('schema-type-invalid', '$.plan_revision', 'plan_revision must be a non-negative integer'));
  const arrays: [string, unknown][] = [['nodes', plan.nodes], ['edges', plan.edges]];
  for (const [key, value] of arrays) if (!Array.isArray(value)) errors.push(error('schema-type-invalid', `$.${key}`, `${key} must be an array`));
  if (!Array.isArray(plan.nodes) || !Array.isArray(plan.edges)) return errors;
  for (let i = 0; i < plan.nodes.length; i += 1) {
    const node = plan.nodes[i];
    if (!isRecord(node) || !exactKeys(node, NODE_KEYS)) { errors.push(error('schema-unknown-field', `$.nodes[${i}]`, 'node schema is closed')); continue; }
    if (!requiredString(node.node_id) || !requiredString(node.role) || !requiredString(node.assigned_node)) errors.push(error('schema-required-field-missing', `$.nodes[${i}]`, 'node identity and role fields are required'));
    if (!isRecord(node.task) || !exactKeys(node.task, TASK_KEYS)) { errors.push(error('schema-unknown-field', `$.nodes[${i}].task`, 'task schema is closed')); continue; }
    const task = node.task;
    for (const key of ['task_id', 'status']) if (!requiredString(task[key])) errors.push(error('schema-required-field-missing', `$.nodes[${i}].task.${key}`, `${key} is required`));
    for (const [key, value] of [['inputs', task.inputs], ['outputs', task.outputs], ['verification_conditions', task.verification_conditions]] as [string, unknown][]) if (!strings(value)) errors.push(error('schema-type-invalid', `$.nodes[${i}].task.${key}`, `${key} must be non-empty strings`));
    if (!Array.isArray(task.resource_bindings)) errors.push(error('schema-type-invalid', `$.nodes[${i}].task.resource_bindings`, 'resource_bindings must be an array'));
    if (!isRecord(task.capability_grant) || !exactKeys(task.capability_grant, GRANT_KEYS)) errors.push(error('schema-unknown-field', `$.nodes[${i}].task.capability_grant`, 'capability grant schema is closed'));
    else {
      for (const key of ['grant_id', 'network_id', 'plan_id', 'event_id', 'task_id', 'assigned_node', 'issued_at', 'expires_at', 'grant_digest']) if (!requiredString(task.capability_grant[key])) errors.push(error('schema-required-field-missing', `$.nodes[${i}].task.capability_grant.${key}`, `${key} is required`));
      if (!integer(task.capability_grant.plan_revision) || !strings(task.capability_grant.capabilities) || !strings(task.capability_grant.resource_scope)) errors.push(error('schema-type-invalid', `$.nodes[${i}].task.capability_grant`, 'grant revision and lists are invalid'));
    }
    if (Array.isArray(task.resource_bindings)) for (let j = 0; j < task.resource_bindings.length; j += 1) {
      const binding = task.resource_bindings[j];
      if (!isRecord(binding) || !exactKeys(binding, BINDING_KEYS)) { errors.push(error('schema-unknown-field', `$.nodes[${i}].task.resource_bindings[${j}]`, 'resource binding schema is closed')); continue; }
      if (!requiredString(binding.resource_id) || !requiredString(binding.access_mode) || !requiredString(binding.isolation_strategy) || !requiredString(binding.strategy_reason) || !requiredString(binding.merge_owner) || !strings(binding.unknowns)) errors.push(error('schema-type-invalid', `$.nodes[${i}].task.resource_bindings[${j}]`, 'resource binding fields are invalid'));
    }
  }
  for (let i = 0; i < plan.edges.length; i += 1) {
    const edge = plan.edges[i];
    if (!isRecord(edge) || !exactKeys(edge, EDGE_KEYS)) { errors.push(error('schema-unknown-field', `$.edges[${i}]`, 'edge schema is closed')); continue; }
    if (!requiredString(edge.edge_id) || !requiredString(edge.from_node_id) || !requiredString(edge.to_node_id) || !requiredString(edge.type)) errors.push(error('schema-required-field-missing', `$.edges[${i}]`, 'edge identity and endpoints are required'));
    if (edge.type === 'data' && (!requiredString(edge.input_ref) || !requiredString(edge.output_ref))) errors.push(error('edge-data-reference-missing', `$.edges[${i}]`, 'data edges require input_ref and output_ref'));
  }
  return errors;
}

function digestValue(plan: OrchestrationPlan): string {
  const { plan_digest: _, ...unsigned } = plan;
  const json = canonicalize(unsigned);
  if (typeof json !== 'string') throw new Error('orchestration-plan-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json).digest('hex')}`;
}

export function createOrchestrationPlan(input: unknown): OrchestrationPlan {
  const candidate = isRecord(input) && !Object.prototype.hasOwnProperty.call(input, 'plan_digest') ? { ...input, plan_digest: 'sha256:' + '0'.repeat(64) } : input;
  const errors = schemaErrors(candidate);
  if (errors.length > 0) throw new Error('orchestration-plan-schema-invalid');
  const plan = structuredClone(candidate) as OrchestrationPlan;
  if (plan.canonicalization_profile !== ORCHESTRATION_PLAN_PROFILE) throw new Error('orchestration-plan-schema-invalid');
  for (const node of plan.nodes) {
    if (node.role !== 'aggregation') continue;
    node.task.inputs = plan.edges.filter((edge) => edge.to_node_id === node.node_id && edge.type === 'data' && typeof edge.output_ref === 'string').map((edge) => edge.output_ref as string).sort();
  }
  plan.plan_digest = digestValue(plan);
  return plan;
}

export function orchestrationPlanDigest(plan: OrchestrationPlan): string { return digestValue(plan); }
export { orchestrationPlanProfileSha256 };

export function validateOrchestrationPlan(plan: OrchestrationPlan): PlanValidation {
  const errors = schemaErrors(plan);
  const add = (code: string, path: string, message: string) => errors.push(error(code, path, message));
  if (errors.length === 0) {
    if (plan.schema !== 'zj-loop.orchestration_plan.v1' || plan.protocol_version !== 'orchestration-plan.v1' || plan.canonicalization !== ORCHESTRATION_PLAN_CANONICALIZATION || plan.canonicalization_profile !== ORCHESTRATION_PLAN_PROFILE || plan.profile_sha256 !== orchestrationPlanProfileSha256()) add('protocol-profile-invalid', '$.profile_sha256', 'protocol profile does not match the immutable registry');
    const ids = new Set<string>();
    for (const node of plan.nodes) {
      if (ids.has(node.node_id)) add('node-id-duplicate', '$.nodes', `duplicate node ${node.node_id}`); ids.add(node.node_id);
      if (!['center', 'execution', 'aggregation', 'verification', 'review-handoff'].includes(node.role)) add('node-role-invalid', `$.nodes.${node.node_id}.role`, 'unsupported node role');
      if (!['planned'].includes(node.task.status)) add('task-initial-state-invalid', `$.nodes.${node.node_id}.task.status`, 'new plans must start tasks in planned state');
      for (const binding of node.task.resource_bindings) if (!isResourceIsolationStrategy(binding.isolation_strategy)) add('resource-isolation-strategy-unknown', `$.resources.${node.node_id}`, 'resource isolation strategy is not in the protocol registry');
    }
    const nodeIds = new Set(plan.nodes.map((node) => node.node_id));
    if (!nodeIds.has(plan.center_node_id)) add('center-node-missing', '$.center_node_id', 'center_node_id must reference a node');
    else if (plan.nodes.find((node) => node.node_id === plan.center_node_id)?.role !== 'center') add('center-node-role-invalid', '$.center_node_id', 'center_node_id must reference a center node');
    if (!nodeIds.has(plan.review_handoff_node_id)) add('review-handoff-node-missing', '$.review_handoff_node_id', 'review_handoff_node_id must reference a node');
    else if (plan.nodes.find((node) => node.node_id === plan.review_handoff_node_id)?.role !== 'review-handoff') add('review-handoff-node-role-invalid', '$.review_handoff_node_id', 'review_handoff_node_id must reference a review-handoff node');
    const adjacency = new Map<string, string[]>();
    for (const edge of plan.edges) {
      if (!nodeIds.has(edge.from_node_id) || !nodeIds.has(edge.to_node_id)) add('edge-node-missing', '$.edges', 'edge references an unknown node');
      if (edge.from_node_id === edge.to_node_id) add('graph-cycle', '$.edges', 'self edge creates a cycle');
      adjacency.set(edge.from_node_id, [...(adjacency.get(edge.from_node_id) ?? []), edge.to_node_id]);
    }
    const visit = (start: string): Set<string> => { const seen = new Set<string>(); const stack = [start]; while (stack.length) { const id = stack.pop() as string; if (seen.has(id)) continue; seen.add(id); stack.push(...(adjacency.get(id) ?? [])); } return seen; };
    const reachable = visit(plan.center_node_id);
    for (const node of plan.nodes) if (!reachable.has(node.node_id)) add('node-unreachable', `$.nodes.${node.node_id}`, 'node is not reachable from center');
    const colors = new Map<string, number>();
    const cycle = (id: string): boolean => { colors.set(id, 1); for (const next of adjacency.get(id) ?? []) { if (colors.get(next) === 1 || (!colors.has(next) && cycle(next))) return true; } colors.set(id, 2); return false; };
    if ([...nodeIds].some((id) => !colors.has(id) && cycle(id))) add('graph-cycle', '$.graph', 'graph must be acyclic');
    const aggregate = plan.nodes.find((node) => node.role === 'aggregation');
    if (aggregate) {
      const expected = plan.edges.filter((edge) => edge.to_node_id === aggregate.node_id && edge.type === 'data').map((edge) => edge.output_ref).filter(requiredString).sort();
      if (expected.length === 0 || expected.join('\u0000') !== aggregate.task.inputs.slice().sort().join('\u0000')) add('aggregation-inputs-incomplete', '$.validation.aggregation', 'aggregation must declare every incoming data artifact');
    }
    if (!errors.some((item) => item.code === 'graph-cycle' || item.code === 'node-unreachable')) for (const node of plan.nodes) if (node.node_id !== plan.review_handoff_node_id && (adjacency.get(node.node_id) ?? []).length === 0) add('node-terminal-invalid', `$.nodes.${node.node_id}`, 'only the review handoff may be a normal terminal');
  }
  if (errors.length === 0 && plan.plan_digest !== digestValue(plan)) add('plan-digest-invalid', '$.plan_digest', 'plan digest does not match canonical plan content');
  errors.sort((left, right) => `${left.path}:${left.code}`.localeCompare(`${right.path}:${right.code}`));
  return { status: errors.length === 0 ? 'valid' : 'blocked', errors, plan_digest: typeof plan.plan_digest === 'string' ? plan.plan_digest : '' };
}
