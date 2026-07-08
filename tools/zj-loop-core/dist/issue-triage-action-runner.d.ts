import { RouteStatus } from './route.js';
export declare const ISSUE_TRIAGE_ACTION_REQUEST_SCHEMA = "zj-loop.issue_triage_action_request.v1";
export declare const ALLOWED_TRIAGE_LABELS: readonly string[];
export declare const FIXED_COMMENT_TEMPLATES: readonly string[];
export declare function readIssueTriageActionRequest(path: string): Promise<any>;
export declare function buildIssueTriageActionRequest(overrides?: Record<string, unknown>): any;
export declare function runIssueTriageActionRunner(input: {
    route: RouteStatus;
    request?: any;
    live?: boolean;
    createdAt?: string;
}): {
    kind: string;
    route_id: string;
    dry_run: boolean;
    decision: {
        status: string;
        reason: string;
    };
    evidence: import("./live-runner-contract.js").LiveRunnerEvidence;
    validation: {
        ok: boolean;
        errors: string[];
    };
    run_id: string;
};
