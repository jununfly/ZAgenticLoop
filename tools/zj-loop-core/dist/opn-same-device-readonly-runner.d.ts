import { type OpnGraphAtomEnrollmentSnapshot } from './opn-graph-atom-enrollment.js';
export declare const OPN_SAME_DEVICE_READONLY_RUNNER_SCHEMA: "zj-loop.opn_same_device_readonly_runner.v1";
export type ReadonlyAgentProvider = {
    run(input: {
        cwd: string;
        prompt: string;
        executable: string;
        mode: 'read-only';
    }): Promise<{
        status: 'completed' | 'failed' | 'cancelled' | 'timed-out';
        success: boolean;
        pid: number;
        exit_code: number | null;
        signal: string | null;
        stdout: string;
        stderr: string;
        provider?: string;
    }>;
};
export type SameDeviceReadonlyTask = {
    task_id: string;
    node_id: string;
    executable: string;
    cwd: string;
    prompt: string;
    resource_scope: readonly string[];
};
export type SameDeviceReadonlyAgentResult = {
    task_id: string;
    node_id: string;
    status: 'passed' | 'blocked' | 'outcome-uncertain';
    provider_status: string;
    stdout_digest: string;
    stderr_digest: string;
    stdout_bytes: number;
    stderr_bytes: number;
    evidence_digest: string;
    reason?: string;
};
export type SameDeviceReadonlyRunResult = {
    schema: typeof OPN_SAME_DEVICE_READONLY_RUNNER_SCHEMA;
    status: 'passed' | 'blocked' | 'outcome-uncertain';
    network_id: string;
    graph_id: string;
    device_id: string;
    enrollment_digest: string;
    agent_results: SameDeviceReadonlyAgentResult[];
    evidence_digest: string;
    reason?: string;
};
export declare function runSameDeviceReadonlyAgentTasks(input: {
    enrollment: OpnGraphAtomEnrollmentSnapshot;
    tasks: readonly SameDeviceReadonlyTask[];
    providers: ReadonlyMap<string, ReadonlyAgentProvider>;
}): Promise<SameDeviceReadonlyRunResult>;
export declare function validateSameDeviceReadonlyRunResult(value: unknown): {
    status: 'valid';
} | {
    status: 'blocked';
    reason: string;
};
