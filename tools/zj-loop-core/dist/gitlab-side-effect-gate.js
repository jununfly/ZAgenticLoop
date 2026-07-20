export const GITLAB_CI_SWEEPER_CARRIER_CONFIRMATION = 'CREATE_GITLAB_CI_SWEEPER_CARRIER';
export function buildGitLabCarrierSideEffectGate(input) {
    const audit = {
        project_path: input.projectPath,
        route_family: input.routeFamily,
        pipeline_source: input.pipelineSource ?? null,
        side_effects_executed: false,
    };
    const blocked = (reason, extra = {}) => ({
        schema: 'zj-loop.gitlab_side_effect_gate.v1',
        status: 'blocked',
        reason,
        audit,
        breaker: { state: input.breakerState ?? 'armed', action: 'none' },
        side_effects_executed: false,
        ...extra,
    });
    if (!input.projectPath.trim())
        return blocked('project-path-required');
    if (!input.routeFamily.trim())
        return blocked('route-family-required');
    if (input.breakerState === 'tripped') {
        return blocked('breaker-tripped', { breaker: { state: 'tripped', action: 'human-reset-required' } });
    }
    if (input.pipelineSource !== 'web') {
        return {
            schema: 'zj-loop.gitlab_side_effect_gate.v1',
            status: 'tripped',
            reason: 'automatic-source-forbidden',
            audit,
            breaker: { state: 'tripped', action: 'persist-tripped-state' },
        };
    }
    if (!isEnabled(input.carrierEnabled))
        return blocked('carrier-disabled');
    if (input.confirmation !== GITLAB_CI_SWEEPER_CARRIER_CONFIRMATION) {
        return blocked('confirmation-required', { required_phrase: GITLAB_CI_SWEEPER_CARRIER_CONFIRMATION });
    }
    return {
        schema: 'zj-loop.gitlab_side_effect_gate.v1',
        status: 'allowed',
        reason: 'explicit-web-confirmed-carrier-request',
        audit,
        breaker: { state: 'armed', action: 'none' },
        side_effects_executed: false,
    };
}
function isEnabled(value) {
    return value === true || value === 'true' || value === 'enabled';
}
