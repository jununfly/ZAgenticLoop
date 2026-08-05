import { type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
type GitObservation = {
    status: number;
    stdout: string;
    stderr?: string;
};
type GitRunner = (cwd: string, args: string[]) => Promise<GitObservation>;
export type RealAgentDogfoodGraphCleanupAdapterResult = {
    status: 'passed' | 'blocked' | 'outcome-uncertain';
    reason?: string;
    evidence_digest?: string;
    record?: RealAgentDogfoodGraphPhaseRecord;
};
export declare function createRealAgentDogfoodGraphCleanupAdapter(input: {
    plan: RealAgentDogfoodGraphPlan;
    network_id: string;
    verifier_id: string;
    prior_phase: RealAgentDogfoodGraphPhaseRecord;
    repo_root: string;
    target_worktree: string;
    source_worktree: string;
    verifier_worktree: string;
    evidence_store: Pick<ContentAddressedEvidenceStore, 'put'>;
    run_git?: GitRunner;
}): () => Promise<RealAgentDogfoodGraphCleanupAdapterResult>;
export {};
