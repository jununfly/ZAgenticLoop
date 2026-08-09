import type { HumanApprovalContext, HumanPublicIdentity } from './human-authority.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
export type RealAgentDogfoodApprovalRequest = {
    dogfood_id: string;
    execution_id: string;
    attempt: number;
    network_id: string;
    goal: string;
    execution_mode: string;
    allowed_files: string[];
    worktree_path: string;
    summary_digest: string;
    status: 'pending';
};
export type RealAgentDogfoodApprovalUiUpstream = {
    list(): Promise<{
        requests: RealAgentDogfoodApprovalRequest[];
    }>;
    approve(input: {
        request: RealAgentDogfoodApprovalRequest;
        context: HumanApprovalContext;
        identity: HumanPublicIdentity;
    }): Promise<Record<string, unknown>>;
};
export declare function createRealAgentDogfoodApprovalUiUpstream(input: {
    stateStore: Pick<SqliteStateStore, 'readEvents'>;
    evidenceRoot: string;
    network_id: string;
    plans: readonly RealAgentDogfoodGraphPlan[];
    now?: () => string;
}): RealAgentDogfoodApprovalUiUpstream;
