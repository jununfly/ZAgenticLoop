export declare const DEFAULT_ROUTE_TABLE_PATH = "zj-loop/zj-loop-route-table.yaml";
export type RouteTableRoute = {
    route_id?: string;
    enabled?: boolean;
    request_kind?: string;
    consumer?: string;
    mode?: string;
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
    enabled: boolean;
    request_kind: string;
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
export declare function loadRouteTable(root: string, routeTablePath?: string): Promise<RouteTableDocument>;
export declare function parseRouteTable(text: string): RouteTableDocument;
export declare function listRoutes(table: RouteTableDocument): RouteStatus[];
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
