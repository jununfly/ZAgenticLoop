import { type HumanSigner, type HumanSignerIdentity, type HumanSignature } from './human-signer.js';
import type { RealAgentDogfoodLifecycle } from './real-agent-dogfood-lifecycle.js';
import type { SqliteStateStore, StateEvent } from './sqlite-state-store.js';
export declare const REAL_AGENT_DOGFOOD_CLOSEOUT_SCHEMA: "zj-loop.real_agent_dogfood_closeout.v1";
export declare const REAL_AGENT_DOGFOOD_CLOSEOUT_EVENT_SCHEMA: "zj-loop.real_agent_dogfood_closeout_event.v1";
export declare const REAL_AGENT_DOGFOOD_CLOSEOUT_AGGREGATE_TYPE: "real-agent-dogfood-closeout";
export type RealAgentDogfoodCloseout = {
    schema: typeof REAL_AGENT_DOGFOOD_CLOSEOUT_SCHEMA;
    network_id: string;
    dogfood_id: string;
    execution_id: string;
    attempt: number;
    lifecycle_status: 'accepted' | 'rejected';
    lifecycle_digest: string;
    worktree_path: string;
    human_id: string;
    signer_fingerprint: string;
    reason: string;
    closed_at: string;
    canonical_payload_digest: string;
    signature: HumanSignature;
    side_effects_executed: false;
};
export declare function createRealAgentDogfoodCloseout(input: {
    signer: HumanSigner;
    lifecycle: RealAgentDogfoodLifecycle;
    worktree_path: string;
    reason: string;
    closed_at: string;
}): Promise<RealAgentDogfoodCloseout>;
export declare function validateRealAgentDogfoodCloseout(input: {
    closeout: RealAgentDogfoodCloseout;
    identity: HumanSignerIdentity;
    lifecycle: RealAgentDogfoodLifecycle;
}): {
    status: 'valid' | 'blocked';
    errors: string[];
};
export declare function removeRealAgentDogfoodWorktree(input: {
    repo_root: string;
    worktree_path: string;
}): Promise<void>;
export declare function recordRealAgentDogfoodCloseout(input: {
    stateStore: SqliteStateStore;
    lifecycle: RealAgentDogfoodLifecycle;
    closeout: RealAgentDogfoodCloseout;
    identity: HumanSignerIdentity;
    expected_revision: number;
    repo_root: string;
    worktree_path: string;
    now?: string;
}): Promise<{
    status: 'closed';
    revision: number;
    event: StateEvent;
}>;
