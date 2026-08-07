import { type TransportAdapter, type TransportEnvelope } from './transport-contract.js';
import type { BoundedLoopTask } from './agent-task.js';
import type { OpnArtifactMetadata, OpnArtifactStore } from './opn-artifact-store.js';
import type { NativeAgentRuntimeResult } from './native-agent-runtime.js';
export declare const OPN_AGENT_RESULT_SCHEMA: "zj-loop.opn_agent_result.v1";
type Runtime = {
    acceptEnvelope(input: {
        envelope: TransportEnvelope;
        task: BoundedLoopTask;
        now: string;
    }): Promise<NativeAgentRuntimeResult>;
};
type ProviderRunResult = {
    status: 'completed' | 'failed' | 'cancelled' | 'timed-out';
    success: boolean;
    evidence_refs?: string[];
};
export declare function createProviderBackedNativeAgentExecutor(input: {
    provider: {
        run(request: Record<string, unknown>): Promise<ProviderRunResult>;
    };
    cwd: string;
    provider_kind: 'codex' | 'workbuddy-code';
    prompt?: (task: BoundedLoopTask) => string;
    timeout_ms?: number;
    termination_grace_ms?: number;
    max_stdout_bytes?: number;
    max_stderr_bytes?: number;
}): (task: BoundedLoopTask) => Promise<{
    status: "succeeded" | "failed" | "blocked";
    evidence_refs?: string[];
    reason?: string;
}>;
export declare function createOpnAgentAdapter(input: {
    transport: TransportAdapter;
    runtime: Runtime;
    artifactStore: OpnArtifactStore;
    publishArtifact?: (input: {
        bytes: Buffer;
        metadata: OpnArtifactMetadata;
        transfer_id: string;
        target_node_id: string;
    }) => Promise<void>;
    agent_id: string;
    now?: () => string;
}): {
    processNext(args: {
        session_id: string;
        resolveTask(envelope: TransportEnvelope): Promise<BoundedLoopTask> | BoundedLoopTask;
    }): Promise<{
        status: "empty" | "processed" | "blocked";
        message_id?: string;
        result?: NativeAgentRuntimeResult;
        reason?: string;
        side_effects_executed: false;
    }>;
};
export {};
