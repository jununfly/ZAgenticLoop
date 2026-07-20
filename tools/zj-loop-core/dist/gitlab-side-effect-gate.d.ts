export declare const GITLAB_CI_SWEEPER_CARRIER_CONFIRMATION = "CREATE_GITLAB_CI_SWEEPER_CARRIER";
export type GitLabSideEffectGateInput = {
    projectPath: string;
    routeFamily: string;
    pipelineSource?: string;
    carrierEnabled?: string | boolean;
    confirmation?: string;
    breakerState?: 'armed' | 'tripped';
};
export declare function buildGitLabCarrierSideEffectGate(input: GitLabSideEffectGateInput): {
    schema: string;
    status: string;
    reason: string;
    audit: {
        project_path: string;
        route_family: string;
        pipeline_source: string | null;
        side_effects_executed: boolean;
    };
    breaker: {
        state: string;
        action: string;
    };
    side_effects_executed?: undefined;
} | {
    schema: string;
    status: string;
    reason: string;
    audit: {
        project_path: string;
        route_family: string;
        pipeline_source: string | null;
        side_effects_executed: boolean;
    };
    breaker: {
        state: string;
        action: string;
    };
    side_effects_executed: boolean;
};
