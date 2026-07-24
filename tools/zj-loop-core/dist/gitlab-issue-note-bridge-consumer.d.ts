export declare const GITLAB_ISSUE_NOTE_BRIDGE_CONSUMER_SCHEMA = "zj-loop.gitlab_issue_note_bridge_consumer.v1";
export declare const GITLAB_PROJECT_REGISTRATION_SCHEMA = "zj-loop.project-registration.v1";
export declare const GITLAB_ISSUE_NOTE_BRIDGE_CONSUMER_EXIT_CODES: {
    readonly completed: 0;
    readonly blocked: 2;
    readonly uncertain: 3;
};
export type GitLabIssueNoteBridgeConsumerResult = {
    schema: typeof GITLAB_ISSUE_NOTE_BRIDGE_CONSUMER_SCHEMA;
    status: 'completed' | 'blocked' | 'uncertain';
    reason?: string;
    project_path: string | null;
    route_id: string | null;
    pipeline: {
        source: string | null;
        ref: string | null;
    };
    binding: {
        event_id: string | null;
        dedupe_key: string | null;
        issue_iid: string | null;
        note_id: string | null;
        envelope_ref: string | null;
    };
    registration: {
        path: string;
        sha256: string | null;
        executor_kind: string | null;
        executor_profile: string | null;
    };
    artifacts: {
        route_decision: string;
        consumer_plan: string;
        result: string;
    };
    side_effects_executed: false;
};
type Environment = Record<string, string | undefined>;
type FetchLike = (input: string, init?: {
    headers?: Record<string, string>;
}) => Promise<{
    status: number;
    json(): Promise<unknown>;
}>;
export declare function runGitLabIssueNoteBridgeConsumer(input: {
    root?: string;
    env?: Environment;
    registrationPath?: string;
    fetchImpl?: FetchLike;
}): Promise<GitLabIssueNoteBridgeConsumerResult>;
export {};
