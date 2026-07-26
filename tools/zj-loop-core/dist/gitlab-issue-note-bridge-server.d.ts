import { type Server } from 'node:http';
import { type GitLabIssueNoteBridgeRoute } from './gitlab-issue-note-bridge.js';
import { type GitLabIssueNoteBridgeTriggerConfig } from './gitlab-issue-note-bridge-trigger.js';
import { type AgentExecutionRequest } from './agent-local-bridge.js';
import { type StateBranchClient } from './agent-local.js';
export declare const GITLAB_ISSUE_NOTE_BRIDGE_HTTP_SCHEMA = "zj-loop.gitlab_issue_note_bridge_http.v1";
export declare const GITLAB_ISSUE_NOTE_BRIDGE_HTTP_PATH = "/gitlab/webhook/issue-note";
export declare const GITLAB_ISSUE_NOTE_BRIDGE_HEALTH_PATH = "/healthz";
export type GitLabIssueNoteBridgeServerConfig = {
    projectPath: string;
    route: GitLabIssueNoteBridgeRoute;
    triggerConfig: GitLabIssueNoteBridgeTriggerConfig;
    webhookSecret: string;
    triggerToken: string;
    root?: string;
    apiBaseUrl?: string;
    maxBodyBytes?: number;
    webhookPath?: string;
    fetchImpl?: typeof fetch;
    now?: () => string;
    agentLocal?: {
        stateToken?: string;
        stateClient?: StateBranchClient;
        resolveRegistration?: (request: AgentExecutionRequest) => Promise<{
            text: string;
            commit: string;
            baseCommit: string;
        }>;
    };
};
export declare function createGitLabIssueNoteBridgeServer(config: GitLabIssueNoteBridgeServerConfig): Server;
