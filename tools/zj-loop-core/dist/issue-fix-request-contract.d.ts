export declare const ISSUE_FIX_REQUEST_SCHEMA = "zj-loop.issue_fix_request.v1";
export declare const ROUTE_DECISION_SCHEMA = "zj-loop.route_decision.v1";
export declare const ISSUE_FIX_REQUEST_STATUSES: readonly ["requested", "duplicate", "denied", "consumed", "pr_opened", "failed", "completed"];
export declare const ISSUE_FIX_REQUEST_KINDS: readonly ["issue-fix-request", "activation-comment", "workflow-dispatch", "report-only"];
export declare function buildIssueFixRequestComment(request: any): string;
export declare function buildIssueFixRequestLifecycleComment(request: any): string;
export declare function parseIssueFixRequestComments(comments: any[]): {
    commentId: any;
    author: any;
    createdAt: any;
    request: any;
    validation: {
        ok: boolean;
        errors: string[];
    };
}[];
export declare function validateIssueFixRequest(request: any): {
    ok: boolean;
    errors: string[];
};
export declare function resolveIssueFixRequestDedupe(input: {
    existingRequests: any[];
    dedupeKey: string;
}): {
    action: string;
    existing_request_id?: undefined;
    existing_status?: undefined;
    existing_request_url?: undefined;
} | {
    action: string;
    existing_request_id: any;
    existing_status: any;
    existing_request_url: any;
};
export declare function validateIssueFixRequestTransition(fromStatus: string, toStatus: string): {
    ok: boolean;
    errors: string[];
};
export declare function deriveIssueFixRequestState(comments: any[]): {
    requests: any[];
    auditEvents: {
        currentState: string;
        reason: string;
        commentId: any;
        author: any;
        createdAt: any;
        request: any;
        validation: {
            ok: boolean;
            errors: string[];
        };
    }[];
    activeRequests: any[];
    inconsistentRequests: any[];
};
export declare function applyFixConsumerTransition(input: {
    request: any;
    consumerId: string;
    transition: string;
    linkedPr?: string;
    reason?: string;
    at?: string;
}): any;
