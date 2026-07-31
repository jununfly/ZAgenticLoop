import { type NativeOpnTracerExecution } from './native-opn-tracer-execution.js';
import type { NativeAgentExecution } from './agent-execution.js';
export declare function buildNativeOpnTracerExecutionFromNativeAgent(input: {
    execution: NativeAgentExecution;
    input_evidence_digests: string[];
    output_evidence_digest?: string;
    network_id: string;
    event_id: string;
    plan_id: string;
    plan_revision: number;
    plan_digest: string;
    recorded_at: string;
}): NativeOpnTracerExecution;
