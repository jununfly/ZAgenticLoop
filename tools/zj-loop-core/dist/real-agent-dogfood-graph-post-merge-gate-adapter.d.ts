import type { NativeOpnTracerMergeAuthorization } from './native-opn-tracer-aggregation.js';
import { type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import type { RealAgentDogfoodVerificationCommand } from './real-agent-dogfood-independent-verification.js';
export type RealAgentDogfoodGraphPostMergeGateAdapterResult = {
    status: 'passed' | 'blocked' | 'outcome-uncertain';
    reason?: string;
    evidence_digest?: string;
    record?: RealAgentDogfoodGraphPhaseRecord;
};
type CommandObservation = {
    id: string;
    executable: string;
    args: string[];
    timeout_ms: number;
    status: 'passed' | 'blocked' | 'outcome-uncertain';
    exit_code: number | null;
    timed_out: boolean;
    stdout_bytes: number;
    stderr_bytes: number;
    stdout_digest: string;
    stderr_digest: string;
};
type GitObservation = {
    status: number;
    stdout: string;
    stderr?: string;
};
type GitRunner = (cwd: string, args: string[]) => Promise<GitObservation>;
declare function runCommand(cwd: string, command: RealAgentDogfoodVerificationCommand): Promise<CommandObservation>;
export declare function createRealAgentDogfoodGraphPostMergeGateAdapter(input: {
    plan: RealAgentDogfoodGraphPlan;
    network_id: string;
    verifier_id: string;
    merge_phase: RealAgentDogfoodGraphPhaseRecord;
    human_acceptance: {
        decision: 'accepted' | string;
        merge_authorization_digest?: string;
    };
    authorization: NativeOpnTracerMergeAuthorization;
    target_worktree: string;
    commands: RealAgentDogfoodVerificationCommand[];
    evidence_store: Pick<ContentAddressedEvidenceStore, 'put'>;
    run_git?: GitRunner;
    run_command?: typeof runCommand;
}): () => Promise<RealAgentDogfoodGraphPostMergeGateAdapterResult>;
export {};
