import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import type { RealAgentDogfoodGraphReplayReadModel } from './real-agent-dogfood-replay.js';

export const REAL_AGENT_DOGFOOD_GRAPH_REVIEW_READ_MODEL_SCHEMA = 'zj-loop.real_agent_dogfood_graph_review_read_model.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export type RealAgentDogfoodGraphReviewStatus = 'in-progress' | 'pending-human-review' | 'approved' | 'blocked' | 'outcome-uncertain';
export type RealAgentDogfoodGraphReviewReadModel = {
  schema: typeof REAL_AGENT_DOGFOOD_GRAPH_REVIEW_READ_MODEL_SCHEMA;
  status: RealAgentDogfoodGraphReviewStatus;
  side_effects_executed: false;
  network_id: string;
  graph_id: string;
  event: { event_id: string; title: string };
  plan: { plan_id: string; plan_revision: number; plan_digest: string };
  lifecycle: RealAgentDogfoodGraphReplayReadModel['lifecycle'];
  current_phase: RealAgentDogfoodGraphReplayReadModel['graph']['current_phase'];
  phase_status: RealAgentDogfoodGraphReplayReadModel['graph']['phase_status'];
  completed_phases: RealAgentDogfoodGraphReplayReadModel['graph']['completed_phases'];
  next_phase: RealAgentDogfoodGraphReplayReadModel['graph']['next_phase'];
  evidence_refs: string[];
  blocking_reasons: string[];
  next_action: { kind: 'wait-graph' | 'human-review' | 'inspect-blocker' | 'done'; label: string };
  source_replay_digest: string;
  read_model_digest: string;
};

function digest(value: Omit<RealAgentDogfoodGraphReviewReadModel, 'read_model_digest'>): string {
  const json = canonicalize(value);
  if (typeof json !== 'string') throw new Error('real-agent-dogfood-graph-review-read-model-canonicalization-invalid');
  return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}

function statusOf(replay: RealAgentDogfoodGraphReplayReadModel): RealAgentDogfoodGraphReviewStatus {
  if (replay.status === 'outcome-uncertain' || replay.integrity_status === 'incomplete') return 'outcome-uncertain';
  if (replay.status === 'blocked') return 'blocked';
  if (replay.status === 'passed') return 'approved';
  if (replay.lifecycle.status === 'review-pending' && replay.graph.completed_phases.includes('independent_verification') && !replay.graph.completed_phases.includes('human_acceptance')) return 'pending-human-review';
  return 'in-progress';
}

export function projectRealAgentDogfoodGraphReviewReadModel(input: { plan: RealAgentDogfoodGraphPlan; replay: RealAgentDogfoodGraphReplayReadModel; network_id: string }): RealAgentDogfoodGraphReviewReadModel {
  const { plan, replay } = input;
  if (!input.network_id.trim() || replay.schema !== 'zj-loop.real_agent_dogfood_graph_replay.v1' || replay.network_id !== input.network_id || replay.dogfood_id !== plan.dogfood_id || replay.execution_id !== plan.execution_id || replay.attempt !== plan.attempt || replay.plan_digest !== plan.plan_digest || !DIGEST.test(replay.read_model_digest)) throw new Error('real-agent-dogfood-graph-review-read-model-scope-invalid');
  const status = statusOf(replay);
  const blocking_reasons = [...new Set(replay.integrity_failures)].sort();
  if (replay.status === 'blocked' && replay.lifecycle.reason_code) blocking_reasons.push(replay.lifecycle.reason_code);
  const uniqueReasons = [...new Set(blocking_reasons)].sort();
  const next_action = status === 'pending-human-review' ? { kind: 'human-review' as const, label: '等待 Human 最终审查' } : status === 'approved' ? { kind: 'done' as const, label: 'Graph 已完成' } : status === 'blocked' || status === 'outcome-uncertain' ? { kind: 'inspect-blocker' as const, label: '检查 Graph 阻塞或不确定事实' } : { kind: 'wait-graph' as const, label: '等待 Graph phase 完成' };
  const unsigned = {
    schema: REAL_AGENT_DOGFOOD_GRAPH_REVIEW_READ_MODEL_SCHEMA,
    status,
    side_effects_executed: false as const,
    network_id: input.network_id,
    graph_id: plan.dogfood_id,
    event: { event_id: plan.dogfood_id, title: plan.goal },
    plan: { plan_id: plan.execution_id, plan_revision: plan.attempt, plan_digest: plan.plan_digest },
    lifecycle: { ...replay.lifecycle },
    current_phase: replay.graph.current_phase,
    phase_status: replay.graph.phase_status,
    completed_phases: [...replay.graph.completed_phases],
    next_phase: replay.graph.next_phase,
    evidence_refs: [...replay.graph.evidence_refs].sort(),
    blocking_reasons: uniqueReasons,
    next_action,
    source_replay_digest: replay.read_model_digest,
  };
  return Object.freeze({ ...unsigned, read_model_digest: digest(unsigned) });
}
