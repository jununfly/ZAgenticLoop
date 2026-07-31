import { type NativeOpnTracerEvidence } from './native-opn-tracer.js';
import type { SqliteStateStore } from './sqlite-state-store.js';
export declare const NATIVE_OPN_TRACER_EVIDENCE_RECORDED_SCHEMA: "zj-loop.native_opn_tracer_evidence_recorded.v1";
export type NativeOpnTracerEvidenceFactResult = {
    schema: typeof NATIVE_OPN_TRACER_EVIDENCE_RECORDED_SCHEMA;
    status: 'recorded' | 'duplicate' | 'conflict' | 'blocked';
    event_id: string;
    side_effects_executed: false;
    revision?: number;
    current_revision?: number;
    reason?: string;
};
export declare function recordNativeOpnTracerEvidence(input: {
    stateStore: SqliteStateStore;
    expected_revision: number;
    evidence: NativeOpnTracerEvidence;
    now: string;
}): Promise<NativeOpnTracerEvidenceFactResult>;
