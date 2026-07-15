import type { ConsumerRunPlan } from './consumer-runner.js';
import type { SignalEnvelope } from './dispatch-runner.js';
export declare const WORKSPACE_ACTIVATION_REQUEST_SCHEMA = "zj-loop.workspace_activation_request.v1";
export declare const WORKSPACE_ROUTE_DECISION_EVIDENCE_SCHEMA = "zj-loop.workspace_route_decision_evidence.v1";
export declare const WORKSPACE_ROUTE_DECISION_SCHEMA = "zj-loop.workspace_route_decision.v1";
export type WorkspaceRouteDecisionRecord = {
    schema: typeof WORKSPACE_ROUTE_DECISION_SCHEMA;
    adapter_id: 'workspace';
    carrier: {
        kind: 'local-activation-request';
        path: string;
    };
    evidence: {
        kind: 'route-decision-evidence';
        path: string;
    };
};
export declare function writeWorkspaceRouteDecision(input: {
    root: string;
    orchestrationId: string;
    signal: SignalEnvelope;
    consumerRunPlan: ConsumerRunPlan;
    now: string;
}): Promise<WorkspaceRouteDecisionRecord>;
