import type { DispatchSemanticReview } from './dispatch-semantic-review.js';
export declare const NATIVE_OPN_TRACER_EVIDENCE_SET_SCHEMA: "zj-loop.native_opn_tracer_evidence_set.v1";
export type NativeOpnTracerEvidenceSet = {
    schema: typeof NATIVE_OPN_TRACER_EVIDENCE_SET_SCHEMA;
    fixture_version: string;
    network_id: string;
    event_id: string;
    status: 'passed' | 'blocked';
    side_effects_executed: false;
    plan: {
        plan_id: string;
        plan_revision: number;
        plan_digest: string;
    };
    center: {
        responsibility_unit: 'human' | 'human+agent';
        human_id: string;
    };
    conformance_report_digest: string;
    semantic_review_digest: string;
    evidence_refs: Array<{
        kind: string;
        artifact_id: string;
        content_sha256: string;
    }>;
    relay: {
        receipt_count: number;
        message_ids: string[];
        duplicate_message_ids: string[];
        conflict_message_ids: string[];
        out_of_order: boolean;
    };
    blocking_reasons: string[];
    created_at: string;
    evidence_set_digest: string;
};
type Input = Omit<NativeOpnTracerEvidenceSet, 'schema' | 'status' | 'side_effects_executed' | 'conformance_report_digest' | 'semantic_review_digest' | 'blocking_reasons' | 'evidence_set_digest'> & {
    conformance_report: {
        status: 'passed' | 'blocked';
        report_digest: string;
        network_id: string;
        event_id: string;
        plan: {
            plan_id: string;
            plan_revision: number;
            plan_digest: string;
        };
    };
    semantic_review: Pick<DispatchSemanticReview, 'status' | 'review_digest' | 'intent_digest' | 'aggregation_digest' | 'verification_digest' | 'review_handoff_digest'>;
};
export declare function buildNativeOpnTracerEvidenceSet(input: Input): NativeOpnTracerEvidenceSet;
export declare function nativeOpnTracerEvidenceSetDigest(report: NativeOpnTracerEvidenceSet): string;
export {};
