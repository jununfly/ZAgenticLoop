import { type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import { prepareDisposableRealAgentDogfoodVerifierWorktree, type RealAgentDogfoodVerificationCommand } from './real-agent-dogfood-independent-verification.js';
import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
export type RealAgentDogfoodGraphIndependentVerificationAdapterResult = {
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
    stdout: string;
    stderr: string;
    timed_out: boolean;
};
declare function runCommand(cwd: string, command: RealAgentDogfoodVerificationCommand): Promise<CommandObservation>;
export declare function createRealAgentDogfoodGraphIndependentVerificationAdapter(input: {
    plan: RealAgentDogfoodGraphPlan;
    network_id: string;
    verifier_id: string;
    evidence_store: Pick<ContentAddressedEvidenceStore, 'put'>;
    source_phase: RealAgentDogfoodGraphPhaseRecord;
    scope_phase: RealAgentDogfoodGraphPhaseRecord;
    commands: RealAgentDogfoodVerificationCommand[];
    prepare_worktree?: typeof prepareDisposableRealAgentDogfoodVerifierWorktree;
    run_command?: typeof runCommand;
}): () => Promise<RealAgentDogfoodGraphIndependentVerificationAdapterResult>;
export {};
