export declare const BOUNDED_LOOP_TASK_SCHEMA: "zj-loop.bounded_loop_task.v1";
export type BoundedLoopTask = {
    schema: typeof BOUNDED_LOOP_TASK_SCHEMA;
    task_id: string;
    execution_id: string;
    attempt: number;
    task_kind: string;
    objective: string;
    success_criteria: string[];
    input_artifact_refs: string[];
    dependency_refs: string[];
    resource_isolation: {
        status: 'declared' | 'not-applicable';
        bindings: Array<{
            resource_id: string;
            strategy: string;
            evidence_refs: string[];
        }>;
    };
    budget: {
        timeout_ms: number;
        max_iterations: number;
    };
    expected_evidence_kinds: string[];
    idempotency_key: string;
    cancellation: {
        mode: 'cooperative';
        token: string;
    };
    task_digest: string;
};
type BoundedLoopTaskInput = Omit<BoundedLoopTask, 'schema' | 'task_digest'>;
export declare function createBoundedLoopTask(input: BoundedLoopTaskInput): BoundedLoopTask;
export declare function boundedLoopTaskDigest(value: BoundedLoopTask): string;
export declare function validateBoundedLoopTask(value: unknown): {
    status: 'valid';
} | {
    status: 'blocked';
    reason: string;
};
export {};
