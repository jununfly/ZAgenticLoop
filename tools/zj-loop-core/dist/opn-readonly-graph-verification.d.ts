export declare const OPN_READ_ONLY_GRAPH_VERIFICATION_RESULT_SCHEMA: "zj-loop.opn_read_only_graph_verification_result.v1";
type Digest = `sha256:${string}`;
export type OpnReadOnlyGraphVerificationResult = {
    schema: typeof OPN_READ_ONLY_GRAPH_VERIFICATION_RESULT_SCHEMA;
    graph_id: string;
    network_id: string;
    plan_id: string;
    plan_revision: number;
    task_id: string;
    plan_digest: Digest;
    source_evidence_ref: Digest;
    verification_evidence_ref: Digest;
    verifier_node_id: string;
    status: 'passed' | 'blocked' | 'outcome-uncertain';
    result_digest: Digest;
    side_effects_executed: false;
};
export declare function createOpnReadOnlyGraphVerificationResult(input: Omit<OpnReadOnlyGraphVerificationResult, 'schema' | 'result_digest' | 'side_effects_executed'>): OpnReadOnlyGraphVerificationResult;
export declare function validateOpnReadOnlyGraphVerificationResult(value: unknown): {
    status: 'valid';
} | {
    status: 'blocked';
    reason: string;
};
export {};
