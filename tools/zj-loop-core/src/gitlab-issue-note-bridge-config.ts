export type GitLabIssueNoteBridgeConfig = {
  projectPath?: string;
  routeId?: string;
  pipelineRef?: string;
  targetRoute?: string;
  marker?: string;
  allowedEventType?: string;
  enabled?: boolean;
  maturity?: string;
};

type Environment = Record<string, string | undefined>;

const CONFIG_ENV = 'ZJ_LOOP_BRIDGE_CONFIG_JSON';

export function readGitLabIssueNoteBridgeConfig(env: Environment): GitLabIssueNoteBridgeConfig {
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

function parseJsonConfig(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${CONFIG_ENV}-invalid`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${CONFIG_ENV}-invalid`);
  return parsed as Record<string, unknown>;
}

function stringValue(source: Record<string, unknown> | Environment, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function booleanValue(source: Record<string, unknown> | Environment, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = source[key];
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
  }
  return undefined;
}
