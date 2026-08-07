import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { validateOpnReadOnlyGraphAtomReviewHandoff, type OpnReadOnlyGraphAtomResult, type OpnReadOnlyGraphAtomStartResult } from './opn-readonly-graph-atom.js';

export const OPN_READ_ONLY_GRAPH_UI_READ_MODEL_SCHEMA = 'zj-loop.opn_read_only_graph_ui_read_model.v1' as const;
type Digest = `sha256:${string}`;
type UiStatus = 'awaiting-verification' | 'pending-human-review' | 'approved' | 'rejected' | 'blocked' | 'outcome-uncertain';

export type OpnReadOnlyGraphUiReadModel = {
  schema: typeof OPN_READ_ONLY_GRAPH_UI_READ_MODEL_SCHEMA;
  status: UiStatus;
  side_effects_executed: false;
  graph_id: string;
  network_id: string;
  plan_digest: Digest;
  phases: OpnReadOnlyGraphAtomResult['phases'];
  source_evidence_ref?: Digest;
  verification_evidence_ref?: Digest;
  verification_request?: { message_id: string; target_node_id: string; envelope_digest: Digest };
  decision?: { decision: 'approved' | 'rejected'; reason: string; human_id: string };
  blocking_reasons: string[];
  next_action: { kind: 'wait-agent2' | 'human-review' | 'done' | 'inspect-blocker'; label: string };
  read_model_digest: Digest;
};

function digest(value: Omit<OpnReadOnlyGraphUiReadModel, 'read_model_digest'>): Digest {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('opn-read-only-graph-ui-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}

function validDigest(value: unknown): value is Digest { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }

export function projectOpnReadOnlyGraphUiReadModel(input: { graph_id: string; network_id: string; result: OpnReadOnlyGraphAtomStartResult }): OpnReadOnlyGraphUiReadModel {
  if (!input.graph_id.trim() || !input.network_id.trim() || !input.result || !validDigest(input.result.plan_digest) || input.result.side_effects_executed !== false || !Array.isArray(input.result.phases)) throw new Error('opn-read-only-graph-ui-facts-invalid');
  const result = input.result;
  const pending = result.status === 'awaiting-verification' ? result : undefined;
  const handoff = 'review_handoff' in result ? result.review_handoff : undefined;
  if (handoff && validateOpnReadOnlyGraphAtomReviewHandoff(handoff).status === 'blocked') throw new Error('opn-read-only-graph-ui-handoff-invalid');
  const status: UiStatus = pending ? 'awaiting-verification' : handoff?.status === 'pending' ? 'pending-human-review' : handoff?.status === 'approved' ? 'approved' : handoff?.status === 'rejected' ? 'rejected' : result.status === 'passed' ? 'approved' : result.status;
  const blocking_reasons = 'reason' in result && result.reason ? [result.reason] : handoff?.status === 'rejected' ? ['human-rejected'] : [];
  const next_action = status === 'awaiting-verification' ? { kind: 'wait-agent2' as const, label: '等待 Agent2 独立验证' } : status === 'pending-human-review' ? { kind: 'human-review' as const, label: '等待 Human 最终审查' } : status === 'approved' ? { kind: 'done' as const, label: 'Graph Atom 已批准' } : status === 'rejected' ? { kind: 'done' as const, label: 'Graph Atom 已拒绝' } : { kind: 'inspect-blocker' as const, label: '检查阻塞原因' };
  if (pending && !validDigest(pending.verification_request.envelope_digest)) throw new Error('opn-read-only-graph-ui-transport-digest-invalid');
  const unsigned = { schema: OPN_READ_ONLY_GRAPH_UI_READ_MODEL_SCHEMA, status, side_effects_executed: false as const, graph_id: input.graph_id, network_id: input.network_id, plan_digest: result.plan_digest, phases: result.phases.map((phase) => ({ ...phase })), ...(pending ? { source_evidence_ref: pending.source_evidence_ref, verification_request: { message_id: pending.verification_request.message_id, target_node_id: pending.verification_request.target_node_id, envelope_digest: pending.verification_request.envelope_digest as Digest } } : {}), ...(handoff ? { source_evidence_ref: handoff.source_evidence_ref, verification_evidence_ref: handoff.verification_evidence_ref, ...(handoff.decision ? { decision: { ...handoff.decision } } : {}) } : {}), blocking_reasons, next_action };
  return { ...unsigned, read_model_digest: digest(unsigned) };
}
