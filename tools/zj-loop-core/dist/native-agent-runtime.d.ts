import { type AgentRegistration } from './agent-registration.js';
import { type NativeAgentExecution } from './agent-execution.js';
import { type BoundedLoopTask } from './agent-task.js';
import { type TransportEnvelope } from './transport-contract.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const NATIVE_AGENT_RUNTIME_SCHEMA: "zj-loop.native_agent_runtime.v1";
export type NativeAgentExecutorResult = {
    status: 'succeeded' | 'failed' | 'blocked';
    evidence_refs?: string[];
    reason?: string;
};
export type NativeAgentExecutor = (task: BoundedLoopTask) => Promise<NativeAgentExecutorResult>;
export type NativeAgentRuntimeResult = {
    status: 'accepted';
    execution: NativeAgentExecution;
    side_effects_executed: false;
} | {
    status: 'duplicate';
    execution: NativeAgentExecution;
    side_effects_executed: false;
} | {
    status: 'blocked';
    reason: string;
    side_effects_executed: false;
};
export declare function createNativeAgentRuntime(input: {
    stateStore: SqliteStateStore;
    registration: AgentRegistration;
    executor: NativeAgentExecutor;
}): {
    schema: "zj-loop.native_agent_runtime.v1";
    acceptEnvelope: (args: {
        envelope: TransportEnvelope;
        task: BoundedLoopTask;
        now: string;
    }) => Promise<NativeAgentRuntimeResult>;
};
