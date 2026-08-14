import type { BoundedLoopTask } from './agent-task.js';
export declare const OPN_NODE_UI_SERVICE_TASK_KIND: "opn-node-ui-service-dogfood";
export declare const OPN_NODE_UI_SERVICE_DIAGNOSTIC_SCHEMA: "zj-loop.opn_node_ui_service_diagnostic.v1";
export type DiagnosticEvidence = {
    schema: typeof OPN_NODE_UI_SERVICE_DIAGNOSTIC_SCHEMA;
    network_id: string;
    node_id: string;
    service_label: string;
    platform: 'win32' | 'darwin';
    port: number;
    service_status: {
        before: ServiceSnapshot;
        after: ServiceSnapshot;
    };
    service_command: string | null;
    healthz: CheckResult;
    connection: CheckResult;
    restart_persistence: {
        attempted: true;
        end: CommandResult;
        run: CommandResult;
        healthy_after_restart: boolean;
    };
    status: 'passed' | 'blocked';
    reason?: string;
    evidence_digest: string;
};
export type ServiceSnapshot = {
    status: 'running' | 'stopped' | 'not-found' | 'unknown';
    raw: string;
};
export type CommandResult = {
    status: number | null;
    stdout: string;
    stderr: string;
};
export type CheckResult = {
    status: 'passed' | 'blocked';
    http_status: number | null;
    body: unknown;
    reason?: string;
};
export declare function createOpnNodeUiServiceDiagnosticExecutor(input: {
    network_id: string;
    node_id: string;
    platform?: 'win32' | 'darwin';
    port?: number;
    command?: (command: string, args: string[]) => Promise<CommandResult>;
    fetcher?: typeof fetch;
}): (task: BoundedLoopTask) => Promise<{
    status: "succeeded" | "blocked";
    evidence_refs: string[];
    evidence: DiagnosticEvidence;
    reason?: string;
}>;
