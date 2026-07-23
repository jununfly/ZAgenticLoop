const CONFIG_ENV = 'ZJ_LOOP_BRIDGE_CONFIG_JSON';
export function readGitLabIssueNoteBridgeConfig(env) {
    const json = env[CONFIG_ENV]?.trim();
    const parsed = json ? parseJsonConfig(json) : {};
    return {
        projectPath: stringValue(parsed, 'ZJ_LOOP_BRIDGE_PROJECT_PATH', 'project_path') ?? stringValue(env, 'ZJ_LOOP_BRIDGE_PROJECT_PATH'),
        routeId: stringValue(parsed, 'ZJ_LOOP_BRIDGE_ROUTE_ID', 'route_id') ?? stringValue(env, 'ZJ_LOOP_BRIDGE_ROUTE_ID'),
        pipelineRef: stringValue(parsed, 'ZJ_LOOP_BRIDGE_PIPELINE_REF', 'pipeline_ref') ?? stringValue(env, 'ZJ_LOOP_BRIDGE_PIPELINE_REF'),
        targetRoute: stringValue(parsed, 'ZJ_LOOP_BRIDGE_TARGET_ROUTE', 'target_route') ?? stringValue(env, 'ZJ_LOOP_BRIDGE_TARGET_ROUTE'),
        marker: stringValue(parsed, 'ZJ_LOOP_BRIDGE_MARKER', 'marker') ?? stringValue(env, 'ZJ_LOOP_BRIDGE_MARKER'),
        allowedEventType: stringValue(parsed, 'ZJ_LOOP_BRIDGE_ALLOWED_EVENT_TYPE', 'allowed_event_type') ?? stringValue(env, 'ZJ_LOOP_BRIDGE_ALLOWED_EVENT_TYPE'),
        enabled: booleanValue(parsed, 'ZJ_LOOP_BRIDGE_ENABLED', 'enabled') ?? booleanValue(env, 'ZJ_LOOP_BRIDGE_ENABLED'),
        maturity: stringValue(parsed, 'ZJ_LOOP_BRIDGE_MATURITY', 'maturity') ?? stringValue(env, 'ZJ_LOOP_BRIDGE_MATURITY'),
    };
}
function parseJsonConfig(value) {
    let parsed;
    try {
        parsed = JSON.parse(value);
    }
    catch {
        throw new Error(`${CONFIG_ENV}-invalid`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error(`${CONFIG_ENV}-invalid`);
    return parsed;
}
function stringValue(source, ...keys) {
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string' && value.trim())
            return value.trim();
    }
    return undefined;
}
function booleanValue(source, ...keys) {
    for (const key of keys) {
        const value = source[key];
        if (value === true || value === 'true')
            return true;
        if (value === false || value === 'false')
            return false;
    }
    return undefined;
}
