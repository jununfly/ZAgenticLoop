export declare const NATIVE_OPN_TRACER_CONFORMANCE_REPORT_SCHEMA: "zj-loop.native_opn_tracer_conformance_report.v1";
export type NativeOpnTracerConformanceReport = {
    schema: typeof NATIVE_OPN_TRACER_CONFORMANCE_REPORT_SCHEMA;
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
    phases: Array<{
        name: 'enrollment' | 'preflight' | 'execution' | 'relay' | 'aggregation' | 'verification' | 'review-handoff';
        status: 'passed' | 'blocked';
        reason?: string;
    }>;
    blocking_reasons: string[];
    created_at: string;
    report_digest: string;
};
type Input = Omit<NativeOpnTracerConformanceReport, 'schema' | 'status' | 'side_effects_executed' | 'phases' | 'blocking_reasons' | 'report_digest'> & {
    enrollments: Array<{
        node_id: string;
        network_id: string;
        status: 'enrolled-active' | 'blocked';
    }>;
    preflight: {
        status: 'execution-ready' | 'blocked';
        plan_id: string;
        plan_revision: number;
        plan_digest: string;
    };
    executions: Array<{
        node_id: string;
        execution_id: string;
        status: 'succeeded' | 'blocked';
        execution_digest: string;
    }>;
    relay_receipts: Array<{
        node_id: string;
        message_id: string;
        envelope_digest: string;
        status: 'recorded' | 'blocked';
    }>;
    aggregation: {
        status: 'passed' | 'blocked';
        aggregation_digest: string;
    };
    verification: {
        status: 'passed' | 'blocked';
        verification_digest: string;
        aggregation_digest: string;
        verifier_id: string;
    };
    review_handoff: {
        status: 'accepted' | 'blocked';
        verification_digest: string;
        aggregation_digest: string;
        responsible_party: string;
    };
};
export declare function buildNativeOpnTracerConformanceReport(input: Input): NativeOpnTracerConformanceReport;
export declare function nativeOpnTracerConformanceReportDigest(report: NativeOpnTracerConformanceReport): string;
export {};
