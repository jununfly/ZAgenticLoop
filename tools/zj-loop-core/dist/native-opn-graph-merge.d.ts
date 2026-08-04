import type { NativeOpnTracerMergeAuthorization } from './native-opn-tracer-aggregation.js';
export { nativeOpnTracerMergeAuthorizationDigest } from './review-handoff.js';
type GitResult = {
    status: number;
    stdout: string;
    stderr?: string;
};
type GitRunner = (args: string[]) => Promise<GitResult>;
export type NativeOpnGraphMergeAdmission = {
    status: 'ready' | 'blocked' | 'outcome-uncertain';
    side_effects_executed: false;
    reason?: 'human-acceptance-binding-invalid' | 'target-ref-mismatch' | 'target-worktree-ref-mismatch' | 'source-not-reachable' | 'fast-forward-not-possible' | 'target-not-clean' | 'scope-digest-mismatch' | 'merge-observation-uncertain';
};
export type NativeOpnGraphMergeAdapter = {
    observe: () => Promise<Parameters<typeof evaluateNativeOpnGraphMergeAdmission>[0]['observed']>;
    execute: (input: {
        authorization: NativeOpnTracerMergeAuthorization;
        expected_target_head: string;
    }) => Promise<{
        status: 'merged' | 'blocked' | 'outcome-uncertain';
        target_head?: string;
        side_effects_executed: boolean;
        reason?: string;
    }>;
};
export declare function evaluateNativeOpnGraphMergeAdmission(input: {
    authorization: NativeOpnTracerMergeAuthorization;
    human_acceptance: {
        decision: 'accepted' | string;
        merge_authorization_digest?: string;
    };
    observed: {
        target_ref?: string;
        target_worktree_ref?: string;
        target_head?: string;
        source_commit_reachable?: boolean;
        fast_forward_possible?: boolean;
        target_clean?: boolean;
        scope_digest?: string;
    };
}): NativeOpnGraphMergeAdmission;
export type NativeOpnGraphMergeExecution = {
    status: 'merged' | 'blocked' | 'outcome-uncertain';
    side_effects_executed: boolean;
    target_head?: string;
    reason?: string;
};
export declare function executeNativeOpnGraphMerge(input: {
    authorization: NativeOpnTracerMergeAuthorization;
    human_acceptance: {
        decision: 'accepted' | string;
        merge_authorization_digest?: string;
    };
    adapter: NativeOpnGraphMergeAdapter;
}): Promise<NativeOpnGraphMergeExecution>;
export type NativeOpnGraphPostMergeGate = {
    status: 'passed' | 'blocked' | 'outcome-uncertain';
    side_effects_executed: false;
    reason?: string;
};
export declare function evaluateNativeOpnGraphPostMergeGate(input: {
    authorization: NativeOpnTracerMergeAuthorization;
    observed: {
        target_ref?: string;
        target_head?: string;
        source_commit_sha?: string;
        fast_forward_confirmed?: boolean;
        target_clean?: boolean;
        scope_digest?: string;
        diff_check_passed?: boolean;
        project_verification?: 'passed' | 'failed' | 'unknown';
    };
}): NativeOpnGraphPostMergeGate;
export declare function createLocalGitNativeOpnGraphMergeAdapter(input: {
    repo_root: string;
    target_worktree_ref: string;
    authorization: NativeOpnTracerMergeAuthorization;
    scope_digest: string;
    runGit?: GitRunner;
}): NativeOpnGraphMergeAdapter;
