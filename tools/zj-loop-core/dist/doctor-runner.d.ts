export type LoopDoctorFinding = {
    kind: 'route-ambiguity' | 'protocol-repair' | 'hard-stop';
    count: number;
    severity: 'info' | 'warning' | 'error';
    recommendation: string;
};
export type LoopEvidenceArtifact = {
    kind: string;
    path: string;
    route_id?: string;
    status?: string;
    source_ref: {
        path: string;
        field: string;
    };
};
export type LoopRunSummary = {
    run_id: string;
    route_id: string;
    status: string;
    updated_at?: string;
    stop_reason?: string;
    evidence_count: number;
    artifact_count: number;
    source_ref: {
        path: string;
    };
};
export type LoopOrchestrationSummary = {
    orchestration_id: string;
    route_id: string;
    consumer?: string;
    status: string;
    mode?: string;
    provider?: string;
    subject_kind?: string;
    subject_id?: string;
    signal_id?: string;
    updated_at?: string;
    stop_reason?: string;
    source_ref: {
        path: string;
    };
};
export type ClassifiedStopSignal = {
    stop_code: string;
    category: string;
    responsible_layer: string;
    severity: 'info' | 'warning' | 'blocked';
    recoverability: 'automatic_retry_not_allowed' | 'human_action_required' | 'resume_available' | 'choose_route' | 'inspect_required';
    reason: string;
    next_actions: Array<{
        type: string;
        target?: string;
        label: string;
    }>;
    source_ref: {
        path: string;
        field: string;
    };
};
export type LoopDoctorReport = {
    schema: 'zj-loop.diagnostic_report.v1';
    schema_version: 1;
    emit_signal: boolean;
    total_runs: number;
    summary: {
        total_runs: number;
        total_orchestrations: number;
        latest_status: string;
        open_stop_signals_count: number;
        recent_success_count: number;
        route_health: Array<{
            route_id: string;
            total: number;
            stopped: number;
            latest_status: string;
        }>;
        provider_health: Array<{
            provider: string;
            total: number;
            stopped: number;
            latest_status: string;
        }>;
        last_updated_at?: string;
        recommended_next_actions: string[];
    };
    run_summaries: LoopRunSummary[];
    orchestration_summaries: LoopOrchestrationSummary[];
    artifact_index: LoopEvidenceArtifact[];
    linked_items: Array<{
        provider?: string;
        subject_kind?: string;
        subject_id?: string;
        route_id?: string;
        signal_id?: string;
        run_id?: string;
        orchestration_id?: string;
    }>;
    classified_stop_signals: ClassifiedStopSignal[];
    findings: LoopDoctorFinding[];
    signal?: {
        schema: 'zj-loop.signal.v1';
        source: 'zj-loop-doctor';
        diagnostic_report: Omit<LoopDoctorReport, 'signal'>;
    };
};
type LoopDoctorFilters = {
    runId?: string;
    orchestrationId?: string;
    provider?: string;
    subject?: string;
};
export declare function buildLoopDoctorReport(input?: {
    root?: string;
    emitSignal?: boolean;
    filters?: LoopDoctorFilters;
}): Promise<LoopDoctorReport>;
export {};
