export declare const DEFAULT_ROUTE_TABLE_PATH = "zj-loop/zj-loop-route-table.yaml";
export type RouteTableRoute = {
    route_id?: string;
    enabled?: boolean;
    request_kind?: string;
    consumer?: string;
    consumer_kind?: string;
    mode?: string;
    execution?: {
        mode?: string;
        side_effect_level?: string;
        completion_forms?: string[];
        recent_success_evidence?: string[];
    };
    maturity?: {
        protocol?: string;
        runner?: string;
    };
    capabilities?: {
        scopes?: string[];
        verifiers?: string[];
        max_side_effect_level?: string;
    };
    match?: Record<string, unknown>;
    guards?: Record<string, unknown>;
    evidence_store?: string;
    enabled_reason?: string;
};
export type RouteTableDocument = {
    schemaVersion?: number;
    kind?: string;
    routes?: RouteTableRoute[];
    disabled_dispatch_routes?: RouteTableRoute[];
};
export type RouteStatus = {
    route_id: string;
    consumer: string;
    consumer_kind: string;
    enabled: boolean;
    request_kind: string;
    execution_mode: string;
    side_effect_level: string;
    completion_forms: string[];
    maturity_protocol: string;
    maturity_runner: string;
    max_side_effect_level: string;
    capability_scopes: string[];
    capability_verifiers: string[];
    recent_success_evidence: string[];
    section: 'routes' | 'disabled_dispatch_routes';
    destructive: boolean;
    side_effecting: boolean;
};
export type RouteDecision = {
    schema: 'zj-loop.route_decision.v1';
    decision_id: string;
    signal_id: string;
    source: string;
    route: string;
    request_kind: string;
    requested_action: 'dispatch' | 'report' | 'ignore';
    target_consumer: string;
    allowed: boolean;
    status: 'pending' | 'denied';
    reason: string;
    evidence: string[];
};
export type RouteChangeResult = {
    route_id: string;
    consumer: string;
    enabled: boolean;
    changed: boolean;
    confirmation_required: boolean;
    destructive: boolean;
    side_effecting: boolean;
    next_steps: string[];
};
export type RouteExecutionValidation = {
    route_id: string;
    valid: boolean;
    errors: string[];
    warnings: string[];
};
export type IssueFixRequestLike = {
    status?: string;
    requested_consumer?: string;
    fix_scope?: {
        scopes?: string[];
        areas?: string[];
    };
    verification_gate?: {
        verifiers?: string[];
        commands?: string[];
    };
    verifier_requirements?: string[];
};
export type ClaimEligibility = {
    allowed: boolean;
    reason: string;
    missing: string[];
};
export declare function loadRouteTable(root: string, routeTablePath?: string): Promise<RouteTableDocument>;
export declare function parseRouteTable(text: string): RouteTableDocument;
export declare function listRoutes(table: RouteTableDocument): RouteStatus[];
export declare function validateRouteExecutionContract(route: RouteStatus): RouteExecutionValidation;
export declare function isRouteLiveReady(route: RouteStatus): boolean;
export declare function canClaimRequest(input: {
    route: RouteStatus;
    request: IssueFixRequestLike;
    consumer?: string;
}): ClaimEligibility;
export declare function findRoute(table: RouteTableDocument, selector: string): RouteStatus;
export declare function buildRouteDecision(input: {
    table: RouteTableDocument;
    selector: string;
    source?: string;
    signalId?: string;
    evidence?: string[];
}): RouteDecision;
export declare function setRouteEnabled(input: {
    root: string;
    selector: string;
    enabled: boolean;
    confirm?: string;
    reason?: string;
    routeTablePath?: string;
}): Promise<RouteChangeResult>;
export declare function expectedConfirmationPhrase(route: RouteStatus): string;
