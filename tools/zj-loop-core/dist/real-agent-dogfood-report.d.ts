export declare const REAL_AGENT_DOGFOOD_CONFORMANCE_REPORT_SCHEMA: "zj-loop.real_agent_dogfood_conformance_report.v1";
export type RealAgentDogfoodFileRef = {
    path: string;
    start_line: number;
    end_line: number;
    content_sha256: string;
};
export type RealAgentDogfoodFinding = {
    finding_id: string;
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    category: string;
    claim: string;
    status: 'implemented' | 'partial' | 'missing' | 'risk';
    file_refs: RealAgentDogfoodFileRef[];
    evidence_refs: string[];
    verification_refs: string[];
};
export type RealAgentDogfoodConformanceReport = {
    schema: typeof REAL_AGENT_DOGFOOD_CONFORMANCE_REPORT_SCHEMA;
    scope: {
        repository: string;
        input_commit: string;
        manifest_digest: string;
        worktree_identity: string;
        roadmap_revision: string;
    };
    implemented: RealAgentDogfoodFinding[];
    partial: RealAgentDogfoodFinding[];
    missing: RealAgentDogfoodFinding[];
    risks: RealAgentDogfoodFinding[];
    evidence_refs: string[];
    verification_refs: string[];
    recommendations: string[];
    report_digest: string;
};
export declare const REAL_AGENT_DOGFOOD_RESULT_ENVELOPE_SCHEMA: "zj-loop.real_agent_dogfood_result_envelope.v1";
export type RealAgentDogfoodResultEnvelope = {
    schema: typeof REAL_AGENT_DOGFOOD_RESULT_ENVELOPE_SCHEMA;
    execution: {
        execution_id: string;
        attempt: number;
        provider_id: string;
        adapter_version: string;
    };
    report: RealAgentDogfoodConformanceReport;
    observations: Array<{
        observation_id: string;
        claim: string;
        value_digest: string;
        evidence_refs: string[];
    }>;
    claims: Array<{
        claim_id: string;
        claim: string;
        disposition: 'candidate';
        evidence_refs: string[];
    }>;
    output: {
        events: Array<{
            sequence: number;
            kind: string;
            payload_digest: string;
        }>;
        terminal: {
            outcome: 'success' | 'failure';
            payload_digest: string;
        };
    };
    envelope_digest: string;
};
type ResultEnvelopeInput = Omit<RealAgentDogfoodResultEnvelope, 'schema' | 'envelope_digest'> | RealAgentDogfoodResultEnvelope;
export declare function createRealAgentDogfoodResultEnvelope(input: ResultEnvelopeInput): RealAgentDogfoodResultEnvelope;
export declare function realAgentDogfoodConformanceReportDigest(value: RealAgentDogfoodConformanceReport | Omit<RealAgentDogfoodConformanceReport, 'report_digest'>): string;
export declare function createRealAgentDogfoodConformanceReport(input: Omit<RealAgentDogfoodConformanceReport, 'schema' | 'report_digest'>): RealAgentDogfoodConformanceReport;
export {};
