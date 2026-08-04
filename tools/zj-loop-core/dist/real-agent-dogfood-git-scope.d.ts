import { type CodexWriteScopeResult } from './codex-agent-provider-adapter.js';
export declare const REAL_AGENT_DOGFOOD_GIT_SCOPE_OBSERVATION_SCHEMA: "zj-loop.real_agent_dogfood_git_scope_observation.v1";
export type RealAgentDogfoodGitScopeObservation = {
    schema: typeof REAL_AGENT_DOGFOOD_GIT_SCOPE_OBSERVATION_SCHEMA;
    repo_root: string;
    baseline_commit: string;
    head_commit: string;
    commit_parent: string;
    allowed_files: string[];
    changed_files: string[];
    uncommitted_files: string[];
    diff_check_passed: boolean;
    scope: CodexWriteScopeResult;
    observation_digest: string;
};
export declare function observeRealAgentDogfoodGitScope(input: {
    repo_root: string;
    baseline_commit: string;
    allowed_files: string[];
}): Promise<RealAgentDogfoodGitScopeObservation>;
