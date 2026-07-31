export declare const NATIVE_AGENT_EXECUTION_SCHEMA: "zj-loop.native_agent_execution.v1";
export declare const NATIVE_AGENT_EXECUTION_STATUS: {
    readonly received: "received";
    readonly validated: "validated";
    readonly dispatched: "dispatched";
    readonly running: "running";
    readonly succeeded: "succeeded";
    readonly failed: "failed";
    readonly timedOut: "timed-out";
    readonly cancelled: "cancelled";
    readonly blocked: "blocked";
    readonly evidenceRecorded: "evidence-recorded";
    readonly reviewPending: "review-pending";
    readonly accepted: "accepted";
    readonly rejected: "rejected";
};
export type NativeAgentExecutionStatus = typeof NATIVE_AGENT_EXECUTION_STATUS[keyof typeof NATIVE_AGENT_EXECUTION_STATUS];
export type NativeAgentExecutionTransition = {
    from: NativeAgentExecutionStatus;
    to: NativeAgentExecutionStatus;
    at: string;
    reason?: string;
};
export type NativeAgentExecution = {
    schema: typeof NATIVE_AGENT_EXECUTION_SCHEMA;
    execution_id: string;
    task_id: string;
    attempt: number;
    agent_id: string;
    task_digest: string;
    registration_digest: string;
    started_at: string;
    status: NativeAgentExecutionStatus;
    evidence_refs: string[];
    transitions: NativeAgentExecutionTransition[];
};
export declare function createNativeAgentExecution(input: {
    execution_id: string;
    task_id: string;
    attempt: number;
    agent_id: string;
    task_digest: string;
    registration_digest: string;
    started_at: string;
}): NativeAgentExecution;
export declare function transitionNativeAgentExecution(input: {
    execution: NativeAgentExecution;
    status: NativeAgentExecutionStatus;
    at: string;
    evidence_refs?: string[];
    reason?: string;
}): NativeAgentExecution;
