export declare const DUAL_AGENT_ENROLLMENT_EVIDENCE_SCHEMA: "zj-loop.dual_agent_enrollment_evidence.v1";
export type DualAgentEnrollmentEvidence = {
    schema: typeof DUAL_AGENT_ENROLLMENT_EVIDENCE_SCHEMA;
    fixture_version: string;
    network_id: string;
    status: 'passed' | 'blocked';
    side_effects_executed: false;
    nodes: Array<{
        role: 'codex' | 'workbuddy';
        node_id: string;
        certificate_sha256: string;
        agent_kind: string;
        status: string;
    }>;
    scenarios: Array<{
        name: string;
        status: 'passed' | 'blocked';
        reason?: string;
    }>;
    state_store: {
        revision: number;
        event_count: number;
        event_digests: string[];
    };
    created_at: string;
};
export declare function buildDualAgentEnrollmentEvidence(input: {
    network_id: string;
    fixture_version: string;
    nodes: DualAgentEnrollmentEvidence['nodes'];
    scenarios: DualAgentEnrollmentEvidence['scenarios'];
    state_store: {
        revision: number;
        event_count: number;
        event_digests: string[];
    };
    created_at: string;
}): DualAgentEnrollmentEvidence;
export declare function dualAgentEnrollmentEvidenceDigest(evidence: DualAgentEnrollmentEvidence): string;
