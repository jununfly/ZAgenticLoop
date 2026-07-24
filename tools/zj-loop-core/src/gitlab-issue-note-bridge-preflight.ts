export const GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_SCHEMA = 'zj-loop.gitlab_issue_note_bridge_verification.v1';
export const GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_EXIT_CODES = {
  ready: 0,
  blocked: 10,
  uncertain: 20,
  failed: 30,
} as const;

export type GitLabIssueNoteBridgePreflightManifest = {
  schema: typeof GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_SCHEMA;
  gitlab_api_url: string;
  project_path: string;
  project_id: string;
  hook_id: string;
  hook_url: string;
  bridge_http_url: string;
  pipeline_ref: string;
  target_route: string;
  marker: string;
};

export type GitLabIssueNoteBridgePreflightResult = {
  schema: typeof GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_SCHEMA;
  status: 'ready' | 'blocked' | 'uncertain' | 'failed';
  reason?: string;
  project_path?: string | null;
  project_id?: string | null;
  hook_id?: string | null;
  side_effects_executed: false;
  checks?: Record<string, string>;
  route?: Pick<GitLabIssueNoteBridgePreflightManifest, 'pipeline_ref' | 'target_route' | 'marker'>;
};

type FetchLike = (input: string, init?: { headers?: Record<string, string> }) => Promise<ResponseLike>;
type ResponseLike = { status: number; json(): Promise<unknown> };

export function validateGitLabIssueNoteBridgePreflightManifest(value: unknown): GitLabIssueNoteBridgePreflightManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('manifest-invalid');
  const candidate = value as Record<string, unknown>;
  if (candidate.schema !== GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_SCHEMA) throw new Error('manifest-schema-invalid');
  const required = ['gitlab_api_url', 'project_path', 'project_id', 'hook_id', 'hook_url', 'bridge_http_url', 'pipeline_ref', 'target_route', 'marker'];
  for (const key of required) {
    if (typeof candidate[key] !== 'string' || !candidate[key].trim()) throw new Error(`manifest-${key}-required`);
  }
  for (const key of ['project_id', 'hook_id']) {
    if (!/^\d+$/.test(candidate[key] as string)) throw new Error(`manifest-${key}-invalid`);
  }
  for (const key of ['gitlab_api_url', 'hook_url', 'bridge_http_url']) {
    try {
      new URL(candidate[key] as string);
    } catch {
      throw new Error(`manifest-${key}-invalid`);
    }
  }
  return candidate as unknown as GitLabIssueNoteBridgePreflightManifest;
}

export async function runGitLabIssueNoteBridgePreflight(input: {
  config: unknown;
  token?: string;
  fetchImpl?: FetchLike;
}): Promise<GitLabIssueNoteBridgePreflightResult> {
  const config = input.config as Partial<GitLabIssueNoteBridgePreflightManifest> | null;
  const base = {
    schema: GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_SCHEMA as typeof GITLAB_ISSUE_NOTE_BRIDGE_PREFLIGHT_SCHEMA,
    status: 'blocked' as const,
    project_path: config?.project_path ?? null,
    project_id: config?.project_id ?? null,
    hook_id: config?.hook_id ?? null,
    side_effects_executed: false as const,
  };
  try {
    validateGitLabIssueNoteBridgePreflightManifest(input.config);
  } catch (error) {
    return { ...base, reason: error instanceof Error ? error.message : String(error), checks: { manifest: 'failed' } };
  }
  if (!input.token?.trim()) return { ...base, reason: 'gitlab-token-required', checks: { manifest: 'passed', token: 'missing' } };

  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = { 'PRIVATE-TOKEN': input.token };
  const checks = { manifest: 'passed', token: 'configured', project: 'not-checked', hook: 'not-checked', bridge_health: 'not-checked' };
  try {
    const projectResponse = await fetchImpl(`${trimSlash(config!.gitlab_api_url!)}/projects/${encodeURIComponent(config!.project_path!)}`, { headers });
    if (projectResponse.status !== 200) return { ...base, reason: 'project-unavailable', checks: { ...checks, project: `http-${projectResponse.status}` } };
    const project = await projectResponse.json() as { id?: number | string; path_with_namespace?: string };
    if (String(project.id) !== config!.project_id || project.path_with_namespace !== config!.project_path) return { ...base, reason: 'project-mismatch', checks: { ...checks, project: 'mismatch' } };
    checks.project = 'matched';

    const hookResponse = await fetchImpl(`${trimSlash(config!.gitlab_api_url!)}/projects/${encodeURIComponent(config!.project_id!)}/hooks/${encodeURIComponent(config!.hook_id!)}`, { headers });
    if (hookResponse.status !== 200) return { ...base, reason: 'hook-unavailable', checks: { ...checks, hook: `http-${hookResponse.status}` } };
    const hook = await hookResponse.json() as { project_id?: number | string; url?: string; note_events?: boolean; enable_ssl_verification?: boolean };
    if (String(hook.project_id) !== config!.project_id || hook.url !== config!.hook_url || hook.note_events !== true || hook.enable_ssl_verification !== true) return { ...base, reason: 'hook-mismatch', checks: { ...checks, hook: 'mismatch' } };
    checks.hook = 'matched';

    const healthResponse = await fetchImpl(`${trimSlash(config!.bridge_http_url!)}/healthz`);
    if (healthResponse.status !== 200) return { ...base, reason: 'bridge-unavailable', checks: { ...checks, bridge_health: `http-${healthResponse.status}` } };
    checks.bridge_health = 'ok';
    return { ...base, status: 'ready', checks, route: { pipeline_ref: config!.pipeline_ref!, target_route: config!.target_route!, marker: config!.marker! } };
  } catch (error) {
    return { ...base, reason: 'preflight-request-failed', checks: { ...checks, error: error instanceof Error ? error.message : String(error) } };
  }
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
