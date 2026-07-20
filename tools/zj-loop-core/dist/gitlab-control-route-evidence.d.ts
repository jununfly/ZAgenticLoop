import { HumanHandoff } from './human-handoff.js';
export declare const GITLAB_CONTROL_ROUTE_EVIDENCE_SCHEMA = "zj-loop.gitlab_control_route_evidence.v1";
export declare const GITLAB_CONTROL_SIGNAL_SOURCE = "gitlab-protocol";
export declare const GITLAB_CONTROL_ROUTES: readonly ["human", "ignore"];
export type GitLabControlRouteEvidenceInput = {
    projectPath: string;
    orchestrationId: string;
    routeId: string;
    reason: string;
    signal: {
        source: string;
        signal_id: string;
        project: string;
    };
    requestedSideEffect?: string;
};
export type GitLabControlRouteEvidence = {
    schema: typeof GITLAB_CONTROL_ROUTE_EVIDENCE_SCHEMA;
    status: 'completed' | 'blocked';
    reason?: string;
    route_id: string;
    provider: 'gitlab';
    project: string;
    signal: GitLabControlRouteEvidenceInput['signal'];
    outcome?: 'human-handoff' | 'suppressed';
    side_effects_executed: false;
    artifact: HumanHandoff | Record<string, unknown> | null;
    recovery: {
        status: 'resumable' | 'new-request';
        resume_command: string[];
    };
    verification: {
        passed: boolean;
        checks: string[];
    };
    compatibility_fingerprint: string;
    next_steps: string[][];
};
export declare function buildGitLabControlRouteEvidence(input: GitLabControlRouteEvidenceInput): GitLabControlRouteEvidence;
