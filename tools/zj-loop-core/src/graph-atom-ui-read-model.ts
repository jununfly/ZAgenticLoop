import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export const GRAPH_ATOM_UI_READ_MODEL_SCHEMA = 'zj-loop.graph_atom_ui_read_model.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export type GraphAtomUiVariant = 'review-ready' | 'blocked' | 'scope-drift';
export type GraphAtomUiFacts = {
  fixture_variant?: GraphAtomUiVariant;
  network_id: string;
  scope: { network_id: string; event_id: string; plan_id: string; plan_revision: number; plan_digest: string };
  event: { event_id: string; title: string; created_at: string };
  plan: { plan_id: string; plan_revision: number; plan_digest: string };
  center: { responsibility_unit: 'human' | 'human+agent'; human_id: string };
  nodes: Array<{ node_id: string; task_id: string; label: string; assigned_node: string; status: 'succeeded' | 'blocked'; depends_on: string[]; execution: { execution_id: string; execution_digest: string; status: 'succeeded' | 'blocked' }; evidence: Array<{ kind: string; digest: string; artifact_id: string }> }>;
  relay: { status: 'converged' | 'blocked'; receipt_count: number; message_ids: string[] };
  aggregation: { status: 'passed' | 'blocked'; aggregation_digest: string };
  verification: { status: 'passed' | 'blocked'; verification_digest: string; verifier_id: string };
  review_handoff: { status: 'accepted' | 'blocked'; handoff_digest: string; responsible_party: string };
  blocking_reasons: string[];
};
export type GraphAtomUiReadModel = {
  schema: typeof GRAPH_ATOM_UI_READ_MODEL_SCHEMA;
  status: GraphAtomUiVariant;
  side_effects_executed: false;
  network_id: string;
  event: GraphAtomUiFacts['event'];
  plan: GraphAtomUiFacts['plan'];
  center: GraphAtomUiFacts['center'];
  nodes: GraphAtomUiFacts['nodes'];
  relay: GraphAtomUiFacts['relay'];
  aggregation: GraphAtomUiFacts['aggregation'];
  verification: GraphAtomUiFacts['verification'];
  review_handoff: GraphAtomUiFacts['review_handoff'];
  blocking_reasons: string[];
  next_action: { kind: 'human-review' | 'inspect-blocker' | 'reject-scope-drift'; label: string };
  read_model_digest: string;
};

function digest(value: Omit<GraphAtomUiReadModel, 'read_model_digest'>): string { const json = canonicalize(value); if (typeof json !== 'string') throw new Error('graph-atom-ui-read-model-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json).digest('hex')}`; }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function validDigest(value: unknown): boolean { return typeof value === 'string' && DIGEST.test(value); }
function scopeMatches(facts: GraphAtomUiFacts): boolean { return facts.network_id === facts.scope.network_id && facts.event.event_id === facts.scope.event_id && facts.plan.plan_id === facts.scope.plan_id && facts.plan.plan_revision === facts.scope.plan_revision && facts.plan.plan_digest === facts.scope.plan_digest; }
function validateFacts(facts: GraphAtomUiFacts): void {
  if (!text(facts.network_id) || !text(facts.event.title) || !text(facts.event.created_at) || !Number.isInteger(facts.plan.plan_revision) || !validDigest(facts.plan.plan_digest) || !['human', 'human+agent'].includes(facts.center.responsibility_unit) || !text(facts.center.human_id) || facts.nodes.length !== 2) throw new Error('graph-atom-ui-facts-invalid');
  const nodeIds = new Set(facts.nodes.map((node) => node.node_id)); const taskIds = new Set(facts.nodes.map((node) => node.task_id)); const executionDigests = new Set<string>();
  if (nodeIds.size !== facts.nodes.length || taskIds.size !== facts.nodes.length) throw new Error('graph-atom-ui-facts-invalid');
  for (const node of facts.nodes) { if (!text(node.node_id) || !text(node.task_id) || !text(node.label) || !text(node.assigned_node) || !node.depends_on.every((taskId) => taskIds.has(taskId)) || node.depends_on.includes(node.task_id) || !validDigest(node.execution.execution_digest) || executionDigests.has(node.execution.execution_digest) || node.execution.status !== node.status || node.evidence.some((item) => !text(item.kind) || !text(item.artifact_id) || !validDigest(item.digest))) throw new Error('graph-atom-ui-facts-invalid'); executionDigests.add(node.execution.execution_digest); }
  if (facts.relay.receipt_count < 2 || new Set(facts.relay.message_ids).size !== facts.relay.message_ids.length || !validDigest(facts.aggregation.aggregation_digest) || !validDigest(facts.verification.verification_digest) || !validDigest(facts.review_handoff.handoff_digest)) throw new Error('graph-atom-ui-facts-invalid');
}

export function projectGraphAtomUiReadModel(facts: GraphAtomUiFacts): GraphAtomUiReadModel {
  validateFacts(facts);
  const scopeDrift = !scopeMatches(facts);
  const reasons = [...new Set([...facts.blocking_reasons, ...(scopeDrift ? ['scope-digest-mismatch'] : [])])].sort();
  const status: GraphAtomUiVariant = scopeDrift ? 'scope-drift' : facts.blocking_reasons.length > 0 || facts.relay.status !== 'converged' || facts.aggregation.status !== 'passed' || facts.verification.status !== 'passed' || facts.review_handoff.status !== 'accepted' ? 'blocked' : 'review-ready';
  const next_action = status === 'review-ready' ? { kind: 'human-review' as const, label: 'Review overall result' } : status === 'scope-drift' ? { kind: 'reject-scope-drift' as const, label: 'Reject scope drift' } : { kind: 'inspect-blocker' as const, label: 'Inspect blocking reason' };
  const unsigned = { schema: GRAPH_ATOM_UI_READ_MODEL_SCHEMA, status, side_effects_executed: false as const, network_id: facts.network_id, event: { ...facts.event }, plan: { ...facts.plan }, center: { ...facts.center }, nodes: facts.nodes.map((node) => ({ ...node, depends_on: [...node.depends_on], execution: { ...node.execution }, evidence: node.evidence.map((item) => ({ ...item })) })), relay: { ...facts.relay, message_ids: [...facts.relay.message_ids] }, aggregation: { ...facts.aggregation }, verification: { ...facts.verification }, review_handoff: { ...facts.review_handoff }, blocking_reasons: reasons, next_action };
  return { ...unsigned, read_model_digest: digest(unsigned) };
}

export function createGraphAtomUiFixture(variant: GraphAtomUiVariant = 'review-ready'): GraphAtomUiFacts {
  const d = (digit: string) => `sha256:${digit.repeat(64)}`;
  const facts: GraphAtomUiFacts = { fixture_variant: variant, network_id: 'network-graph-atom-1', scope: { network_id: 'network-graph-atom-1', event_id: 'event-graph-atom-1', plan_id: 'plan-graph-atom-1', plan_revision: 1, plan_digest: d('1') }, event: { event_id: 'event-graph-atom-1', title: '双 Agent Graph Atom 可读性验证', created_at: '2026-07-31T12:00:00.000Z' }, plan: { plan_id: 'plan-graph-atom-1', plan_revision: 1, plan_digest: d('1') }, center: { responsibility_unit: 'human+agent', human_id: 'human-1' }, nodes: [{ node_id: 'node-agent-1', task_id: 'task-agent-1', label: 'Agent1：准备输入 Evidence', assigned_node: 'agent-1', status: 'succeeded', depends_on: [], execution: { execution_id: 'execution-agent-1', execution_digest: d('2'), status: 'succeeded' }, evidence: [{ kind: 'execution-output', artifact_id: 'artifact-agent-1', digest: d('3') }] }, { node_id: 'node-agent-2', task_id: 'task-agent-2', label: 'Agent2：消费输入并验证结果', assigned_node: 'agent-2', status: 'succeeded', depends_on: ['task-agent-1'], execution: { execution_id: 'execution-agent-2', execution_digest: d('4'), status: 'succeeded' }, evidence: [{ kind: 'execution-output', artifact_id: 'artifact-agent-2', digest: d('5') }] }], relay: { status: 'converged', receipt_count: 2, message_ids: ['message-agent-1', 'message-agent-2'] }, aggregation: { status: 'passed', aggregation_digest: d('6') }, verification: { status: 'passed', verification_digest: d('7'), verifier_id: 'independent-verifier' }, review_handoff: { status: 'accepted', handoff_digest: d('8'), responsible_party: 'human-1' }, blocking_reasons: [] };
  if (variant === 'blocked') { facts.nodes[1].status = 'blocked'; facts.nodes[1].execution.status = 'blocked'; facts.relay.status = 'blocked'; facts.aggregation.status = 'blocked'; facts.verification.status = 'blocked'; facts.review_handoff.status = 'blocked'; facts.blocking_reasons = ['aggregation-not-passed']; }
  if (variant === 'scope-drift') facts.scope.plan_digest = d('9');
  return facts;
}
