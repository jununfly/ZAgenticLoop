export declare const EXECUTION_LIFECYCLE_SCHEMA: "zj-loop.execution_lifecycle.v1";
export type ExecutionLifecycleStatus = 'provider-completed' | 'task-verified' | 'review-pending' | 'completed' | 'rejected' | 'blocked';
export type ExecutionLifecycle = {
    schema: typeof EXECUTION_LIFECYCLE_SCHEMA;
    network_id: string;
    execution_id: string;
    attempt: number;
    status: ExecutionLifecycleStatus;
    outcome_digest: string;
    verification_digest?: string;
    review_handoff_digest?: string;
    human_acceptance_digest?: string;
    transitions: Array<{
        from: ExecutionLifecycleStatus;
        to: ExecutionLifecycleStatus;
        reason?: string;
        actor_role: 'system' | 'verifier' | 'human';
    }>;
    lifecycle_digest: string;
};
export declare function createExecutionLifecycle(input: {
    network_id: string;
    execution_id: string;
    attempt: number;
    outcome_digest: string;
}): ExecutionLifecycle;
export declare function transitionExecutionLifecycle(input: {
    lifecycle: ExecutionLifecycle;
    to: ExecutionLifecycleStatus;
    verification_digest?: string;
    review_handoff_digest?: string;
    human_acceptance_digest?: string;
    actor_role?: 'system' | 'verifier' | 'human';
    reason?: string;
}): ExecutionLifecycle;
