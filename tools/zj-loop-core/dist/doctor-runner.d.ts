export type LoopDoctorFinding = {
    kind: 'route-ambiguity' | 'protocol-repair' | 'hard-stop';
    count: number;
    severity: 'info' | 'warning' | 'error';
    recommendation: string;
};
export type LoopDoctorReport = {
    schema: 'zj-loop.diagnostic_report.v1';
    schema_version: 1;
    emit_signal: boolean;
    total_runs: number;
    findings: LoopDoctorFinding[];
    signal?: {
        schema: 'zj-loop.signal.v1';
        source: 'zj-loop-doctor';
        diagnostic_report: Omit<LoopDoctorReport, 'signal'>;
    };
};
export declare function buildLoopDoctorReport(input?: {
    root?: string;
    emitSignal?: boolean;
}): Promise<LoopDoctorReport>;
