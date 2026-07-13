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
    evidence_store?: string;
    readiness: RouteReadiness;
    readiness_reasons: string[];
    install_ready: boolean;
    execution_ready: boolean;
    user_project_ready: boolean;
    section: 'routes' | 'disabled_dispatch_routes';
    destructive: boolean;
    side_effecting: boolean;
    guards: Record<string, unknown>;
    automation_model: RouteAutomationModel;
};
export type RouteAutomationModel = {
    readiness: {
        level: RouteReadiness;
        install_ready: boolean;
        execution_ready: boolean;
        user_project_ready: boolean;
        reasons: string[];
    };
    authorization: {
        route_enabled: boolean;
        dispatch_allowed: boolean;
        execution_allowed: boolean;
        required_confirmation: string | null;
        blocked_reasons: string[];
    };
};
export type RouteReadiness = 'install-ready' | 'execution-ready' | 'dogfood-verified' | 'live-missing-evidence' | 'replayed' | 'designed' | 'missing';
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
export type RouteMaturityPromotionResult = {
    route_id: string;
    consumer: string;
    runner: 'install-ready' | 'execution-ready';
    enabled: boolean;
    changed: boolean;
    confirmation_required: boolean;
    next_steps: string[];
};
export type RoutePromotionEvidenceKey = 'contract-plan' | 'provider-live-side-effect' | 'activation-lifecycle' | 'post-merge-closeout-handoff' | 'request-carrier' | 'claim-lifecycle' | 'live-runner-evidence' | 'verifier-backed-outcome' | 'side-effect-boundary' | 'workflow-dispatch-dogfood';
export type RoutePromotionEvidenceMatch = {
    orchestration_id: string;
    path: string;
    schema?: string;
    kind?: string;
    check_result: 'passed';
};
export type RoutePromotionEvidenceCheck = {
    key: RoutePromotionEvidenceKey;
    satisfied: boolean;
    matches: RoutePromotionEvidenceMatch[];
    missing_reason?: string;
};
export type RoutePromotionGateResult = {
    route_id: string;
    consumer: string;
    target_maturity: 'execution-ready';
    promotable: boolean;
    applied: boolean;
    changed: boolean;
    required_evidence: RoutePromotionEvidenceCheck[];
    missing_evidence: RoutePromotionEvidenceKey[];
    failed_checks: string[];
    next_steps: string[];
    promotion_command: string[];
    apply_result?: RouteMaturityPromotionResult;
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
export declare function promoteRouteMaturity(input: {
    root: string;
    selector: string;
    runner: 'install-ready' | 'execution-ready';
    confirm?: string;
    routeTablePath?: string;
}): Promise<RouteMaturityPromotionResult>;
export declare function evaluateRoutePromotionGate(input: {
    root: string;
    selector: string;
    target: 'execution-ready';
    orchestrationId?: string;
    apply?: boolean;
    confirm?: string;
    routeTablePath?: string;
}): Promise<RoutePromotionGateResult>;
export declare function buildRouteAutomationModel(route: Omit<RouteStatus, 'automation_model'>): RouteAutomationModel;
export declare function classifyRouteReadiness(input: {
    executionMode: string;
    sideEffectLevel: string;
    maturityRunner: string;
    recentSuccessEvidence?: string[];
}): {
    readiness: RouteReadiness;
    reasons: string[];
};
export declare function expectedConfirmationPhrase(route: {
    consumer: string;
    destructive: boolean;
}): string;
export declare function expectedMaturityPromotionPhrase(route: {
    consumer: string;
}, runner: 'install-ready' | 'execution-ready'): string;
