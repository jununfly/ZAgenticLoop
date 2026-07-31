export declare const NATIVE_OPN_TRACER_EVIDENCE_SCHEMA: "zj-loop.native_opn_tracer_evidence.v1";
export type NativeOpnTracerEvidence = {
    schema: typeof NATIVE_OPN_TRACER_EVIDENCE_SCHEMA;
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
    execution_nodes: Array<{
        node_id: string;
        task_id: string;
        execution_id: string;
        status: 'passed' | 'blocked';
        output_evidence_digest: string;
    }>;
    dependency: {
        from_task_id: string;
        to_task_id: string;
        artifact_ref: string;
    };
    resource_isolation: Array<{
        node_id: string;
        resource_id: string;
        strategy: string;
        status: 'verified' | 'blocked';
        isolation_ref: string;
    }>;
    aggregation: {
        status: 'passed' | 'blocked';
        input_evidence_digests: string[];
        output_evidence_digest: string;
    };
    verification: {
        status: 'passed' | 'blocked';
        evidence_digest: string;
    };
    review_handoff: {
        status: 'accepted' | 'blocked';
        responsible_party: string;
    };
    blocking_reasons: string[];
    created_at: string;
    evidence_digest: string;
};
type Input = Omit<NativeOpnTracerEvidence, 'schema' | 'status' | 'side_effects_executed' | 'blocking_reasons' | 'evidence_digest'>;
export declare function buildNativeOpnTracerEvidence(input: Input): NativeOpnTracerEvidence;
export declare function nativeOpnTracerEvidenceDigest(evidence: NativeOpnTracerEvidence): string;
export {};
