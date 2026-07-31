export declare const NATIVE_AGENT_EVIDENCE_SCHEMA: "zj-loop.native_agent_evidence.v1";
export type NativeAgentEvidence = {
    schema: typeof NATIVE_AGENT_EVIDENCE_SCHEMA;
    evidence_id: string;
    execution_id: string;
    task_id: string;
    attempt: number;
    agent_id: string;
    kind: string;
    artifact_ref: string;
    content_sha256: string;
    success_criteria: string[];
    observed_at: string;
    status: 'passed' | 'failed' | 'informational';
    side_effects_executed: false;
    evidence_digest: string;
};
export declare function createNativeAgentEvidence(input: Omit<NativeAgentEvidence, 'schema' | 'side_effects_executed' | 'evidence_digest'>): NativeAgentEvidence;
export declare function validateNativeAgentEvidence(value: unknown): {
    status: 'valid';
} | {
    status: 'blocked';
    reason: string;
};
