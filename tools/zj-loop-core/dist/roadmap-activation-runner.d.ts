import { RouteStatus } from './route.js';
export declare const ACTIVATION_SCHEMA_VERSION = 1;
export declare const ALLOWED_ACTIVATION_PATTERNS: string[];
export declare const ALLOWED_ACTIVATION_PERMISSIONS: string[];
export declare const DEFAULT_BOUNDED_SLICE_MAX_SLICES = 30;
export declare const ROADMAP_ACTIVATION_LOOP_MARKER = "zj-loop.generated.roadmap-activation";
export declare const ACTIVATION_KINDS: {
    readonly request: "zj-loop.activation-request";
    readonly consumed: "zj-loop.activation-consumed";
    readonly failed: "zj-loop.activation-failed";
    readonly denied: "zj-loop.activation-denied";
    readonly duplicate: "zj-loop.activation-duplicate";
    readonly resumeExisting: "zj-loop.activation-resume-existing";
    readonly resumeBlocked: "zj-loop.activation-resume-blocked";
    readonly unsupportedPattern: "zj-loop.unsupported-pattern";
};
export declare function readActivationComments(path: string): Promise<any>;
export declare function parseStartCommand(commandText: string): {
    ok: boolean;
    reason: string;
    commandText: string;
    pattern?: undefined;
} | {
    ok: boolean;
    reason: string;
    commandText: string;
    pattern: string;
} | {
    ok: boolean;
    commandText: string;
    pattern: string;
    reason?: undefined;
};
export declare function isAllowedActivationPermission(permission: string): boolean;
export declare function parseStructuredActivationComments(comments: any[]): {
    commentId: any;
    author: any;
    createdAt: any;
    fields: Record<string, string>;
}[];
export declare function deriveActivationState(comments: any[], options?: {
    sourceIssue?: string | number;
    pattern?: string;
}): {
    requests: any[];
    auditEvents: any[];
    pendingRequests: any[];
    inconsistentRequests: any[];
};
export declare function evaluateActivationCommand(input: {
    commandText: string;
    requestedByPermission: string;
    sourceIssue: string | number;
    comments?: any[];
}): {
    action: string;
    pattern: string | undefined;
    reason: string | undefined;
    inconsistentRequestIds?: undefined;
    existingRequestId?: undefined;
    consumedCommentId?: undefined;
    missingResumeAnchors?: undefined;
    resumeAnchors?: undefined;
} | {
    action: string;
    pattern: string | undefined;
    reason: string;
    inconsistentRequestIds: any[];
    existingRequestId?: undefined;
    consumedCommentId?: undefined;
    missingResumeAnchors?: undefined;
    resumeAnchors?: undefined;
} | {
    action: string;
    pattern: string | undefined;
    existingRequestId: any;
    reason?: undefined;
    inconsistentRequestIds?: undefined;
    consumedCommentId?: undefined;
    missingResumeAnchors?: undefined;
    resumeAnchors?: undefined;
} | {
    action: string;
    pattern: string | undefined;
    reason: string;
    existingRequestId: any;
    consumedCommentId: any;
    missingResumeAnchors: string[];
    inconsistentRequestIds?: undefined;
    resumeAnchors?: undefined;
} | {
    action: string;
    pattern: string | undefined;
    existingRequestId: any;
    consumedCommentId: any;
    resumeAnchors: {
        roadmapBranch: string;
        roadmapFile: string;
        roadmapView: string;
        nextAction: string;
    };
    reason?: undefined;
    inconsistentRequestIds?: undefined;
    missingResumeAnchors?: undefined;
} | {
    action: string;
    pattern: string | undefined;
    reason?: undefined;
    inconsistentRequestIds?: undefined;
    existingRequestId?: undefined;
    consumedCommentId?: undefined;
    missingResumeAnchors?: undefined;
    resumeAnchors?: undefined;
};
export declare function dispatchRoadmapActivationCommand(input: {
    route: RouteStatus;
    commandText: string;
    requestedBy: string;
    requestedByPermission: string;
    sourceIssue: string | number;
    commandCommentId: string | number;
    comments?: any[];
    now?: string;
    requestId?: string;
}): {
    action: string;
    routeDecision: {
        schema: string;
        decision_id: string;
        source_signal_id: string;
        signal_id: string;
        source: string;
        subject: string;
        priority: string;
        state: string;
        route: string;
        request_kind: string;
        requested_action: string;
        target_consumer: string;
        allowed: boolean;
        status: string;
        guards: {
            route_enabled: boolean;
            request_kind_allowed: boolean;
            permission_allowed: boolean;
            consumer_allowed: boolean;
        };
        risk: string;
        confidence: string;
        evidence: string[];
        producer: string;
        dedupe_key: string;
        reason: any;
        source_run_id: string;
        created_at: string;
    };
    commentBody: string;
    reason?: undefined;
} | {
    action: string;
    routeDecision: {
        schema: string;
        decision_id: string;
        source_signal_id: string;
        signal_id: string;
        source: string;
        subject: string;
        priority: string;
        state: string;
        route: string;
        request_kind: string;
        requested_action: string;
        target_consumer: string;
        allowed: boolean;
        status: string;
        guards: {
            route_enabled: boolean;
            request_kind_allowed: boolean;
            permission_allowed: boolean;
            consumer_allowed: boolean;
        };
        risk: string;
        confidence: string;
        evidence: string[];
        producer: string;
        dedupe_key: string;
        reason: any;
        source_run_id: string;
        created_at: string;
    };
    commentBody: null;
    reason?: undefined;
} | {
    action: string;
    routeDecision: {
        schema: string;
        decision_id: string;
        source_signal_id: string;
        signal_id: string;
        source: string;
        subject: string;
        priority: string;
        state: string;
        route: string;
        request_kind: string;
        requested_action: string;
        target_consumer: string;
        allowed: boolean;
        status: string;
        guards: {
            route_enabled: boolean;
            request_kind_allowed: boolean;
            permission_allowed: boolean;
            consumer_allowed: boolean;
        };
        risk: string;
        confidence: string;
        evidence: string[];
        producer: string;
        dedupe_key: string;
        reason: any;
        source_run_id: string;
        created_at: string;
    };
    reason: string;
    commentBody: string;
} | {
    action: string;
    routeDecision: {
        schema: string;
        decision_id: string;
        source_signal_id: string;
        signal_id: string;
        source: string;
        subject: string;
        priority: string;
        state: string;
        route: string;
        request_kind: string;
        requested_action: string;
        target_consumer: string;
        allowed: boolean;
        status: string;
        guards: {
            route_enabled: boolean;
            request_kind_allowed: boolean;
            permission_allowed: boolean;
            consumer_allowed: boolean;
        };
        risk: string;
        confidence: string;
        evidence: string[];
        producer: string;
        dedupe_key: string;
        reason: any;
        source_run_id: string;
        created_at: string;
    };
    commentBody: null;
    reason: string | undefined;
};
export declare function buildRoadmapActivationRouteDecision(input: {
    route?: RouteStatus;
    commandText: string;
    requestedByPermission: string;
    sourceIssue: string | number;
    producer?: string;
    sourceRunId?: string;
}): {
    schema: string;
    decision_id: string;
    source_signal_id: string;
    signal_id: string;
    source: string;
    subject: string;
    priority: string;
    state: string;
    route: string;
    request_kind: string;
    requested_action: string;
    target_consumer: string;
    allowed: boolean;
    status: string;
    guards: {
        route_enabled: boolean;
        request_kind_allowed: boolean;
        permission_allowed: boolean;
        consumer_allowed: boolean;
    };
    risk: string;
    confidence: string;
    evidence: string[];
    producer: string;
    dedupe_key: string;
    reason: any;
    source_run_id: string;
    created_at: string;
};
export declare function buildActivationRequestComment(input: any): string;
export declare function buildActivationRequestId(input: {
    sourceIssue: string | number;
    commandCommentId: string | number;
    commandText: string;
}): string;
export declare function buildRoadmapActivationBranchName(input: {
    activationRequestId: string;
    title?: string;
    sourceIssue?: string | number;
}): string;
export declare function buildRoadmapActivationPrTitle(input: {
    title?: string;
    sourceIssue?: string | number;
}): string;
export type RoadmapActivationReviewProvider = 'github' | 'gitlab';
export declare function buildRoadmapActivationReviewTitle(input: {
    provider?: RoadmapActivationReviewProvider;
    title?: string;
    sourceIssue?: string | number;
}): string;
export declare function buildRoadmapActivationReviewContract(input: {
    provider: RoadmapActivationReviewProvider;
    activationRequestId: string;
    sourceIssue?: string | number;
    sourceCommentId?: string | number;
    sourceIssueUrl: string;
    sourceCommentUrl: string;
    routeId?: string;
    consumerId?: string;
    branchName: string;
    lifecycleState: RoadmapActivationLifecycleState;
    closeoutContract: {
        activationCarrierIssue?: string | number;
        branchName?: string;
        processRoadmapPath?: string;
    };
}): string;
export declare function buildRoadmapActivationPrContract(input: {
    activationRequestId: string;
    sourceIssue?: string | number;
    sourceCommentId?: string | number;
    sourceIssueUrl: string;
    sourceCommentUrl: string;
    routeId?: string;
    consumerId?: string;
    branchName: string;
    lifecycleState: RoadmapActivationLifecycleState;
    closeoutContract: {
        activationCarrierIssue?: string | number;
        branchName?: string;
        processRoadmapPath?: string;
    };
}): string;
export declare function executeGitLabRoadmapActivation(input: {
    contractPlan: any;
    projectPath?: string;
    apiBaseUrl?: string;
    token?: string;
    targetBranch?: string;
    draft?: boolean;
    live?: boolean;
    fetchImpl?: typeof fetch;
}): Promise<{
    status: string;
    execution_allowed: boolean;
    schema: string;
    provider: string;
    dry_run: boolean;
    activation_request_id: string;
    project_path: string;
    branch_name: string;
    target_branch: string;
    review_kind: string;
    draft: boolean;
    mr_title: string;
    mr_description: string;
    refusals: any[];
    operations: ({
        kind: string;
        branch: string;
        target: string;
        source_branch?: undefined;
        target_branch?: undefined;
    } | {
        kind: string;
        source_branch: string;
        target_branch: string;
        branch?: undefined;
        target?: undefined;
    } | {
        kind: string;
        source_branch: string;
        branch?: undefined;
        target?: undefined;
        target_branch?: undefined;
    })[];
} | {
    status: string;
    execution_allowed: boolean;
    live_operations: any[];
    schema: string;
    provider: string;
    dry_run: boolean;
    activation_request_id: string;
    project_path: string;
    branch_name: string;
    target_branch: string;
    review_kind: string;
    draft: boolean;
    mr_title: string;
    mr_description: string;
    refusals: any[];
    operations: ({
        kind: string;
        branch: string;
        target: string;
        source_branch?: undefined;
        target_branch?: undefined;
    } | {
        kind: string;
        source_branch: string;
        target_branch: string;
        branch?: undefined;
        target?: undefined;
    } | {
        kind: string;
        source_branch: string;
        branch?: undefined;
        target?: undefined;
        target_branch?: undefined;
    })[];
} | {
    status: string;
    execution_allowed: boolean;
    merge_request_iid: any;
    merge_request_url: any;
    live_operations: any[];
    schema: string;
    provider: string;
    dry_run: boolean;
    activation_request_id: string;
    project_path: string;
    branch_name: string;
    target_branch: string;
    review_kind: string;
    draft: boolean;
    mr_title: string;
    mr_description: string;
    refusals: any[];
    operations: ({
        kind: string;
        branch: string;
        target: string;
        source_branch?: undefined;
        target_branch?: undefined;
    } | {
        kind: string;
        source_branch: string;
        target_branch: string;
        branch?: undefined;
        target?: undefined;
    } | {
        kind: string;
        source_branch: string;
        branch?: undefined;
        target?: undefined;
        target_branch?: undefined;
    })[];
}>;
export declare function buildRoadmapBoundedSlicePack(input: {
    activationRequestId: string;
    roadmapPath: string;
    branchName: string;
    maxSlices?: number;
    leafSlices?: any[];
    allowedPaths?: string[];
    verificationCommands?: string[];
}): {
    schema: string;
    activation_request_id: string;
    run_mode: string;
    max_slices: number;
    branch_name: string;
    roadmap_path: string;
    status: string;
    selected_slices: {
        slice_id: string;
        title: string;
        parent_id: string;
        status: string;
        allowed_paths: any;
        verification_commands: any;
        commit_intent: string;
    }[];
    continuation_conditions: string[];
    stop_conditions: string[];
    result_requirements: string[];
    next_steps: string[];
};
export declare function verifyRoadmapBoundedSliceResult(input: {
    pack: any;
    result: any;
}): {
    schema: string;
    status: string;
    errors: string[];
    checked_slices: any;
    max_slices: number;
};
export type RoadmapActivationLifecycleState = 'requested' | 'consumed' | 'running' | 'blocked' | 'failed' | 'completed' | 'merged';
export declare function classifyRoadmapActivationLifecycleTransition(input: {
    currentState?: string;
    nextState: string;
    verificationFailureKind?: 'technical' | 'decision' | 'red-contract-test';
}): {
    allowed: boolean;
    state: string;
    nextState: string;
    reason: string;
};
export declare function hasRoadmapActivationLoopMarker(input: {
    body?: string;
    author?: string;
}): boolean;
export declare function renderRoadmapActivationWorkflowSummary(input: {
    action: string;
    routeDecision: any;
    activationRequestId?: string;
    branchName?: string;
    nextSteps?: string[];
}): string;
export declare function buildActivationConsumedComment(input: any): string;
export declare function buildActivationFailedComment(input: any): string;
