import { executeNativeOpnGraphMerge, nativeOpnTracerMergeAuthorizationDigest, type NativeOpnGraphMergeAdapter } from './native-opn-graph-merge.js';
import type { NativeOpnTracerMergeAuthorization } from './native-opn-tracer-aggregation.js';
import { createRealAgentDogfoodGraphPhaseRecord, type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';

const DIGEST = /^sha256:[0-9a-f]{64}$/;

export type RealAgentDogfoodGraphMergeAdapterResult = {
  status: 'passed' | 'blocked' | 'outcome-uncertain';
  reason?: string;
  evidence_digest?: string;
  record?: RealAgentDogfoodGraphPhaseRecord;
};

export function createRealAgentDogfoodGraphMergeAdapter(input: {
  plan: RealAgentDogfoodGraphPlan;
  network_id: string;
  coordinator_id: string;
  human_acceptance_phase: RealAgentDogfoodGraphPhaseRecord;
  human_acceptance: { decision: 'accepted' | string; merge_authorization_digest?: string };
  authorization: NativeOpnTracerMergeAuthorization;
  merge_adapter: NativeOpnGraphMergeAdapter;
  evidence_store: Pick<ContentAddressedEvidenceStore, 'put'>;
}): () => Promise<RealAgentDogfoodGraphMergeAdapterResult> {
  return async () => {
    if (input.human_acceptance_phase.phase !== 'human_acceptance' || input.human_acceptance_phase.status !== 'passed' || input.human_acceptance_phase.actor_kind !== 'human' || !input.human_acceptance_phase.actor_identity || input.human_acceptance_phase.network_id !== input.network_id || input.human_acceptance_phase.plan_digest !== input.plan.plan_digest || input.human_acceptance_phase.execution_id !== input.plan.execution_id || !input.human_acceptance_phase.completed_phases.includes('independent_verification')) return { status: 'blocked', reason: 'merge-human-acceptance-prerequisite-invalid' };
    if (input.human_acceptance.decision !== 'accepted' || input.human_acceptance.merge_authorization_digest !== nativeOpnTracerMergeAuthorizationDigest(input.authorization)) return { status: 'blocked', reason: 'human-acceptance-binding-invalid' };

    let execution: Awaited<ReturnType<typeof executeNativeOpnGraphMerge>>;
    try { execution = await executeNativeOpnGraphMerge({ authorization: input.authorization, human_acceptance: input.human_acceptance, adapter: input.merge_adapter }); }
    catch { return { status: 'outcome-uncertain', reason: 'graph-merge-execution-outcome-uncertain' }; }
    const status = execution.status === 'merged' ? 'passed' : execution.status;
    const reason = status === 'passed' ? 'graph-merge-passed' : execution.reason ?? `graph-merge-${status}`;
    const evidencePayload = {
      schema: 'zj-loop.real_agent_dogfood_graph_merge_evidence.v1',
      network_id: input.network_id,
      execution_id: input.plan.execution_id,
      plan_digest: input.plan.plan_digest,
      human_acceptance_evidence_digest: input.human_acceptance_phase.evidence_digest,
      merge_authorization_digest: nativeOpnTracerMergeAuthorizationDigest(input.authorization),
      source_commit_sha: input.authorization.source_commit_sha,
      target_ref: input.authorization.target_ref,
      target_worktree_ref: input.authorization.target_worktree_ref,
      strategy: input.authorization.strategy,
      scope_digest: input.authorization.scope_digest,
      deterministic_gate_digest: input.authorization.deterministic_gate_digest,
      result_status: execution.status,
      target_head: execution.target_head ?? null,
      side_effects_executed: execution.side_effects_executed,
      reason,
    };
    let evidence: { digest: string };
    try { evidence = await input.evidence_store.put({ content: JSON.stringify(evidencePayload), kind: 'real-agent-dogfood-graph-merge' }); }
    catch { return { status: 'outcome-uncertain', reason: 'graph-merge-evidence-write-failed' }; }
    if (!DIGEST.test(evidence.digest)) return { status: 'outcome-uncertain', reason: 'graph-merge-evidence-invalid' };
    const completed_phases = status === 'passed'
      ? ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance', 'merge'] as const
      : ['source_execution', 'scope_observation', 'independent_verification', 'human_acceptance'] as const;
    const record = createRealAgentDogfoodGraphPhaseRecord({ plan: input.plan, network_id: input.network_id, phase: 'merge', status, completed_phases, reason, actor_kind: 'coordinator', actor_identity: input.coordinator_id, evidence_digest: evidence.digest, evidence_refs: [evidence.digest] });
    return { status, reason, evidence_digest: evidence.digest, record };
  };
}
