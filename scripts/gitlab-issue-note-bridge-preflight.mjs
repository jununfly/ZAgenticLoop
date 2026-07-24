import { readFile } from 'node:fs/promises';

export const PREFLIGHT_SCHEMA = 'zj-loop.gitlab_issue_note_bridge_verification.v1';
export const PREFLIGHT_EXIT_CODES = Object.freeze({ ready: 0, blocked: 10, uncertain: 20, failed: 30 });

export async function loadManifest(filePath) {
  let value;
  try {
    value = JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    throw new Error('manifest-invalid');
  }
  validateManifest(value);
  return value;
}

export function validateManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('manifest-invalid');
  if (value.schema !== PREFLIGHT_SCHEMA) throw new Error('manifest-schema-invalid');
  const required = [
    'gitlab_api_url',
    'project_path',
    'project_id',
    'hook_id',
    'hook_url',
    'bridge_http_url',
    'pipeline_ref',
    'target_route',
    'marker',
  ];
  for (const key of required) {
    if (typeof value[key] !== 'string' || !value[key].trim()) throw new Error(`manifest-${key}-required`);
  }
  for (const key of ['project_id', 'hook_id']) {
    if (!/^\d+$/.test(value[key])) throw new Error(`manifest-${key}-invalid`);
  }
  for (const key of ['gitlab_api_url', 'hook_url', 'bridge_http_url']) {
    try {
      new URL(value[key]);
    } catch {
      throw new Error(`manifest-${key}-invalid`);
    }
  }
  return value;
}

export async function runPreflight({ config, token, fetchImpl = fetch }) {
  const base = {
    schema: PREFLIGHT_SCHEMA,
    status: 'blocked',
    project_path: config?.project_path ?? null,
    project_id: config?.project_id ?? null,
    hook_id: config?.hook_id ?? null,
    side_effects_executed: false,
  };
  try {
    validateManifest(config);
  } catch (error) {
    return blocked(base, error.message, { manifest: 'failed' });
  }
  if (!token?.trim()) return blocked(base, 'gitlab-token-required', { manifest: 'passed', token: 'missing' });

  const headers = { 'PRIVATE-TOKEN': token };
  const checks = { manifest: 'passed', token: 'configured', project: 'not-checked', hook: 'not-checked', bridge_health: 'not-checked' };
  try {
    const projectResponse = await fetchImpl(`${trimSlash(config.gitlab_api_url)}/projects/${encodeURIComponent(config.project_path)}`, { headers });
    if (projectResponse.status !== 200) return blocked(base, 'project-unavailable', { ...checks, project: `http-${projectResponse.status}` });
    const project = await projectResponse.json();
    if (String(project.id) !== config.project_id || project.path_with_namespace !== config.project_path) {
      return blocked(base, 'project-mismatch', { ...checks, project: 'mismatch' });
    }
    checks.project = 'matched';

    const hookResponse = await fetchImpl(`${trimSlash(config.gitlab_api_url)}/projects/${encodeURIComponent(config.project_id)}/hooks/${encodeURIComponent(config.hook_id)}`, { headers });
    if (hookResponse.status !== 200) return blocked(base, 'hook-unavailable', { ...checks, hook: `http-${hookResponse.status}` });
    const hook = await hookResponse.json();
    if (String(hook.project_id) !== config.project_id || hook.url !== config.hook_url || hook.note_events !== true || hook.enable_ssl_verification !== true) {
      return blocked(base, 'hook-mismatch', { ...checks, hook: 'mismatch' });
    }
    checks.hook = 'matched';

    const healthResponse = await fetchImpl(`${trimSlash(config.bridge_http_url)}/healthz`);
    if (healthResponse.status !== 200) return blocked(base, 'bridge-unavailable', { ...checks, bridge_health: `http-${healthResponse.status}` });
    checks.bridge_health = 'ok';
    return { ...base, status: 'ready', checks, route: { pipeline_ref: config.pipeline_ref, target_route: config.target_route, marker: config.marker } };
  } catch (error) {
    return blocked(base, 'preflight-request-failed', { ...checks, error: error instanceof Error ? error.message : String(error) });
  }
}

function blocked(base, reason, checks) {
  return { ...base, reason, checks };
}

function trimSlash(value) {
  return value.replace(/\/+$/, '');
}

function printResult(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = PREFLIGHT_EXIT_CODES[result.status] ?? PREFLIGHT_EXIT_CODES.failed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const configFlag = process.argv.indexOf('--config');
  const configPath = configFlag >= 0 ? process.argv[configFlag + 1] : undefined;
  if (!configPath) {
    printResult({ schema: PREFLIGHT_SCHEMA, status: 'blocked', reason: 'config-required', side_effects_executed: false });
  } else {
    loadManifest(configPath)
      .then((config) => runPreflight({ config, token: process.env.GITLAB_TOKEN }))
      .then(printResult)
      .catch((error) => printResult({ schema: PREFLIGHT_SCHEMA, status: 'blocked', reason: error.message, side_effects_executed: false }));
  }
}
