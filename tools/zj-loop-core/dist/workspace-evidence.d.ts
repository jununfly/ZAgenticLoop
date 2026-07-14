export declare const WORKSPACE_REPORT_EVIDENCE_SCHEMA = "zj-loop.workspace_report_evidence.v1";
export declare const WORKSPACE_DRAFT_EVIDENCE_SCHEMA = "zj-loop.workspace_draft_evidence.v1";
export declare function writeWorkspaceReportEvidence(input: {
    root: string;
    orchestrationId: string;
    routeId: string;
    consumer: string;
    carrierPath: string;
    now: string;
}): Promise<string>;
export declare function writeWorkspaceDraftEvidence(input: {
    root: string;
    orchestrationId: string;
    routeId: string;
    consumer: string;
    carrierPath: string;
    now: string;
}): Promise<string>;
