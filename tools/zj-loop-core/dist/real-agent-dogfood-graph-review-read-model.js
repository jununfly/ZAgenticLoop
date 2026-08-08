import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const REAL_AGENT_DOGFOOD_GRAPH_REVIEW_READ_MODEL_SCHEMA = 'zj-loop.real_agent_dogfood_graph_review_read_model.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
function digest(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('real-agent-dogfood-graph-review-read-model-canonicalization-invalid');
    return `sha256:${createHash('sha256').update(json, 'utf8').digest('hex')}`;
}
function statusOf(replay) {
    if (replay.status === 'outcome-uncertain' || replay.integrity_status === 'incomplete')
        return 'outcome-uncertain';
    if (replay.status === 'blocked')
        return 'blocked';
    if (replay.status === 'passed')
        return 'approved';
    if (replay.lifecycle.status === 'review-pending' && replay.graph.completed_phases.includes('independent_verification') && !replay.graph.completed_phases.includes('human_acceptance'))
        return 'pending-human-review';
    return 'in-progress';
}
export function projectRealAgentDogfoodGraphReviewReadModel(input) {
    const { plan, replay } = input;
    if (!input.network_id.trim() || replay.schema !== 'zj-loop.real_agent_dogfood_graph_replay.v1' || replay.network_id !== input.network_id || replay.dogfood_id !== plan.dogfood_id || replay.execution_id !== plan.execution_id || replay.attempt !== plan.attempt || replay.plan_digest !== plan.plan_digest || !DIGEST.test(replay.read_model_digest))
        throw new Error('real-agent-dogfood-graph-review-read-model-scope-invalid');
    const status = statusOf(replay);
    const blocking_reasons = [...new Set(replay.integrity_failures)].sort();
    if (replay.status === 'blocked' && replay.lifecycle.reason_code)
        blocking_reasons.push(replay.lifecycle.reason_code);
    const uniqueReasons = [...new Set(blocking_reasons)].sort();
    const next_action = status === 'pending-human-review' ? { kind: 'human-review', label: '等待 Human 最终审查' } : status === 'approved' ? { kind: 'done', label: 'Graph 已完成' } : status === 'blocked' || status === 'outcome-uncertain' ? { kind: 'inspect-blocker', label: '检查 Graph 阻塞或不确定事实' } : { kind: 'wait-graph', label: '等待 Graph phase 完成' };
    const unsigned = {
        schema: REAL_AGENT_DOGFOOD_GRAPH_REVIEW_READ_MODEL_SCHEMA,
        status,
        side_effects_executed: false,
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
