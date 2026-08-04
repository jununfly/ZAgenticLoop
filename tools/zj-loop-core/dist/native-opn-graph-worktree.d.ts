import { type BoundedReconciliationPlan } from './bounded-reconciliation.js';
import { type HumanSigner, type HumanSignerIdentity, type HumanSignature } from './human-signer.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import type { RealAgentDogfoodWorktreeResult } from './real-agent-dogfood-worktree.js';
export declare const NATIVE_OPN_GRAPH_TARGET_WORKTREE_SCHEMA: "zj-loop.native_opn_graph_target_worktree.v1";
export declare const NATIVE_OPN_GRAPH_TARGET_WORKTREE_CLEANUP_SCHEMA: "zj-loop.native_opn_graph_target_worktree_cleanup.v1";
export declare const NATIVE_OPN_GRAPH_TARGET_WORKTREE_MANUAL_CLEANUP_SCHEMA: "zj-loop.native_opn_graph_target_worktree_manual_cleanup.v1";
export declare const NATIVE_OPN_GRAPH_TARGET_WORKTREE_PROJECTION_EVENT_SCHEMA: "zj-loop.native_opn_graph_target_worktree_projection_event.v1";
export type NativeOpnGraphTargetWorktreeBinding = {
    schema: typeof NATIVE_OPN_GRAPH_TARGET_WORKTREE_SCHEMA;
    network_id: string;
    graph_id: string;
    execution_id: string;
    target_worktree_ref: string;
    worktree_path: string;
    branch: string;
    base_commit: string;
    preparation_status: 'prepared' | 'reused';
    cleanup_status: 'pending';
    binding_digest: string;
    side_effects_executed: false;
};
export type NativeOpnGraphTargetWorktreeCleanupEvidence = {
    schema: typeof NATIVE_OPN_GRAPH_TARGET_WORKTREE_CLEANUP_SCHEMA;
    network_id: string;
    graph_id: string;
    execution_id: string;
    target_worktree_ref: string;
    worktree_path: string;
    status: 'closed' | 'outcome-uncertain' | 'cleanup-unresolved';
    reason: string;
    observed_at: string;
    source: 'real-agent-dogfood-closeout';
    source_event_id: string;
    evidence_digest: string;
    side_effects_executed: false;
};
export type NativeOpnGraphTargetWorktreeManualCleanupEvidence = {
    schema: typeof NATIVE_OPN_GRAPH_TARGET_WORKTREE_MANUAL_CLEANUP_SCHEMA;
    network_id: string;
    graph_id: string;
    execution_id: string;
    target_worktree_ref: string;
    worktree_path: string;
    source_event_id: string;
    observed_absent: true;
    human_id: string;
    signer_fingerprint: string;
    cleaned_at: string;
    reason: string;
    canonical_payload_digest: string;
    signature: HumanSignature;
    side_effects_executed: false;
};
export type NativeOpnGraphTargetWorktreeProjectionResult = {
    schema: typeof NATIVE_OPN_GRAPH_TARGET_WORKTREE_PROJECTION_EVENT_SCHEMA;
    status: 'recorded' | 'duplicate' | 'conflict';
    event_id: string;
    side_effects_executed: false;
    revision?: number;
    current_revision?: number;
    reason?: string;
};
export declare function createNativeOpnGraphTargetWorktreeBinding(input: {
    network_id: string;
    graph_id: string;
    prepared: RealAgentDogfoodWorktreeResult;
}): NativeOpnGraphTargetWorktreeBinding;
export declare function nativeOpnGraphTargetWorktreeBindingDigest(value: NativeOpnGraphTargetWorktreeBinding): string;
export declare function createNativeOpnGraphTargetWorktreeCleanupEvidence(input: {
    binding: NativeOpnGraphTargetWorktreeBinding;
    status: 'closed' | 'outcome-uncertain' | 'cleanup-unresolved';
    worktree_path: string;
    reason: string;
    observed_at: string;
    source_event_id: string;
}): NativeOpnGraphTargetWorktreeCleanupEvidence;
export declare function createNativeOpnGraphTargetWorktreeCleanupEvidenceFromDogfoodCloseout(input: {
    binding: NativeOpnGraphTargetWorktreeBinding;
    closeout_fact: {
        event_id: string;
        status: 'closed' | 'outcome-uncertain';
        worktree_path: string;
        reason: string;
        occurred_at: string;
    };
    reconciliation_exhausted?: boolean;
}): NativeOpnGraphTargetWorktreeCleanupEvidence;
export declare function createNativeOpnGraphTargetWorktreeCleanupReconciliationPlan(input: {
    binding: NativeOpnGraphTargetWorktreeBinding;
    attempt: number;
    outcome_digest: string;
    max_queries: number;
    deadline: string;
    observed_fact_digests: string[];
}): BoundedReconciliationPlan;
export declare function createNativeOpnGraphTargetWorktreeManualCleanupEvidence(input: {
    signer: HumanSigner;
    binding: NativeOpnGraphTargetWorktreeBinding;
    source_event_id: string;
    worktree_path: string;
    reason: string;
    cleaned_at: string;
}): Promise<NativeOpnGraphTargetWorktreeManualCleanupEvidence>;
export declare function validateNativeOpnGraphTargetWorktreeManualCleanupEvidence(input: {
    evidence: NativeOpnGraphTargetWorktreeManualCleanupEvidence;
    binding: NativeOpnGraphTargetWorktreeBinding;
    identity: HumanSignerIdentity;
}): {
    status: 'valid' | 'blocked';
    errors: string[];
};
export declare function evaluateNativeOpnGraphTargetWorktreeManualCleanupCloseout(input: {
    evidence: NativeOpnGraphTargetWorktreeManualCleanupEvidence;
    binding: NativeOpnGraphTargetWorktreeBinding;
    identity: HumanSignerIdentity;
    observed: {
        worktree_path_exists?: boolean;
        worktree_registered?: boolean;
    };
}): {
    status: 'closed' | 'blocked' | 'outcome-uncertain';
    side_effects_executed: false;
    reason?: string;
};
type GraphCleanupEvidence = NativeOpnGraphTargetWorktreeCleanupEvidence | NativeOpnGraphTargetWorktreeManualCleanupEvidence;
export declare function recordNativeOpnGraphTargetWorktreeProjection(input: {
    stateStore: SqliteStateStore;
    expected_revision: number;
    evidence: GraphCleanupEvidence;
    now: string;
}): Promise<NativeOpnGraphTargetWorktreeProjectionResult>;
export {};
