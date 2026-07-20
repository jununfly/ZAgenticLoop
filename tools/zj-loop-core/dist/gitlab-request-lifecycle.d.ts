export type GitLabLifecycleAuditInput = {
    projectPath: string;
    issueIid?: string | number;
    requestId?: string;
    claimId?: string;
    consumerId?: string;
    token?: string;
};
export declare function buildGitLabLifecycleAudit(input: GitLabLifecycleAuditInput): {
    auth_source: string | null;
    consumer_id?: string | undefined;
    claim_id?: string | undefined;
    request_id?: string | undefined;
    issue_iid?: number | undefined;
    project_path: string;
};
export declare function validateGitLabRequestSourceBinding(input: {
    request?: any;
    projectPath: string;
    requestId: string;
    consumerId: string;
}): {
    readonly ok: boolean;
    readonly reason: "request-source-mismatch" | null;
};
export declare function buildGitLabLifecycleMarker(marker: string, payload: Record<string, unknown>): string;
export declare function parseGitLabLifecycleMarker(note: {
    body?: unknown;
}, marker: string): any;
