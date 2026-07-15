import { type TriageRoleMapping } from './triage-role-mapping.js';
export declare const GITLAB_ISSUE_TRIAGE_LIVE_SCHEMA = "zj-loop.gitlab_issue_triage_transition_live.v1";
export declare function buildGitLabTrustedTransitionRequest(input: {
    recommendations: any[];
    projectPath: string;
    apiBaseUrl?: string;
    roleMapping: TriageRoleMapping;
    now?: string;
}): {
    status: string;
    reason: string;
    errors: string[];
    request: null;
    skipped_count: number;
    selected_issue_iid?: undefined;
    selected_labels?: undefined;
} | {
    status: string;
    reason: string;
    request: null;
    skipped_count: number;
    errors?: undefined;
    selected_issue_iid?: undefined;
    selected_labels?: undefined;
} | {
    status: string;
    reason: string;
    request: any;
    selected_issue_iid: number;
    selected_labels: any;
    skipped_count: number;
    errors?: undefined;
};
export type GitLabIssueTriageTransitionInput = {
    projectPath: string;
    issueIid: string | number;
    request: any;
    route: any;
    token?: string;
    apiBaseUrl?: string;
    confirmationMode?: 'human-fixed-phrase' | 'trusted-automation';
    confirmationPhrase?: string;
    command?: string;
    actorPermission?: string;
    confirmationAuthority?: string;
    pipelineSource?: string;
    trustedAutomationEnabled?: string;
    labels?: string[];
    roleMapping?: TriageRoleMapping;
    now?: string;
    fetchImpl?: typeof fetch;
};
export declare function executeGitLabIssueTriageTransition(input: GitLabIssueTriageTransitionInput): Promise<{
    schema: string;
    status: string;
    reason: string;
    audit: {
        project_path: string;
        issue_iid: number;
        source_issue_url: string;
        auth_source: string | null;
    };
    note: null;
    handoff: null;
} | {
    schema: string;
    status: string;
    outcome: any;
    audit: any;
    note: any;
    handoff: any;
    plan: {
        decision: any;
        request_id: any;
    };
} | {
    schema: string;
    status: string;
    reason: any;
    audit: any;
    note: {
        id: string | null;
        url: string | null;
        issue_url: string;
    };
    handoff: null;
} | {
    schema: string;
    status: string;
    reason: string;
    audit: {
        project_path: string;
        issue_iid: number;
        source_issue_url: string;
        auth_source: string | null;
    };
    plan: {
        kind: string;
        route_id: string;
        dry_run: boolean;
        decision: {
            status: string;
            reason: string;
            confirmation_mode: string;
        };
        confirmed_transition: {
            schema: string;
            request_id: any;
            status: string;
            reason: string;
            created_at: string;
            source: any;
            category_role: any;
            confirmed_state: any;
            tracker_operations: {
                kind: string;
                role: any;
            }[];
            triage_comment: string | null;
            issue_fix_request: {
                schema: string;
                request_id: string;
                status: string;
                created_at: string;
                source_signal: {
                    source: string;
                    provider: any;
                    repo: any;
                    issue: any;
                    url: any;
                };
                route_decision: {
                    route_id: string;
                    request_kind: string;
                    target_consumer: string;
                    dedupe_key: string;
                };
                dedupe_key: string;
                carrier: {
                    kind: string;
                    reason: string;
                    provider: any;
                    repo: any;
                    issue: any;
                    url: any;
                    independent_issue_allowed: boolean;
                    independent_issue_exception_required: boolean;
                    fallback_exceptions: string[];
                };
                requested_consumer: {
                    consumer_id: string;
                };
                fix_scope: {
                    scopes: string[];
                    areas: string[];
                };
                acceptance_criteria: any[];
                verification_gate: {
                    verifiers: string[];
                    commands: string[];
                };
                failure_policy: {
                    retry: string;
                };
                lifecycle: {
                    status: string;
                    at: string;
                    actor: string;
                }[];
            } | null;
            confirmation: {
                mode: string;
                reason: string;
                human_confirmation_required: boolean;
            };
        };
        evidence: import("./live-runner-contract.js").LiveRunnerEvidence;
        validation: {
            ok: boolean;
            errors: string[];
        };
        run_id: string;
    };
    note: null;
    handoff: null;
}>;
