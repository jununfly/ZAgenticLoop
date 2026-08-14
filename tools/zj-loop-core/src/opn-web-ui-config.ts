import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const OPN_WEB_UI_CONFIG_SCHEMA = 'zj-loop.opn_web_ui_config.v1' as const;
export const OPN_WEB_UI_CONFIG_FILE = 'opn-web-ui.json' as const;

const CONFIG_KEYS = [
  'schema', 'network_id', 'pairing_endpoint', 'owner_token_file', 'human_id',
  'device_key_id', 'key_tag', 'helper_path', 'ca', 'client_cert', 'client_key',
  'signer_key', 'state_store', 'port', 'runtime_dir', 'graph_plan', 'graph_evidence_store',
  'graph_plan_digest',
] as const;

export type OpnWebUiConfig = {
  network_id: string;
  pairing_endpoint: string;
  owner_token_file: string;
  human_id: string;
  device_key_id: string;
  key_tag?: string;
  helper_path?: string;
  signer_key?: string;
  ca: string;
  client_cert: string;
  client_key: string;
  state_store: string;
  port: number;
  runtime_dir: string;
  graph_plan?: string;
  graph_evidence_store?: string;
  graph_plan_digest?: string;
};

export type OpnWebUiConfigFile = OpnWebUiConfig & { schema: typeof OPN_WEB_UI_CONFIG_SCHEMA };

function required(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`opn-web-ui-config-${name}-required`);
  return value.trim();
}

function identityDir(input?: string): string {
  const value = input?.trim() || process.env.OPN_IDENTITY_DIR?.trim();
  return path.resolve(value || path.join(os.homedir(), '.zj-loop', 'identity'));
}

function configPath(identity_dir: string): string {
  return path.join(identityDir(identity_dir), OPN_WEB_UI_CONFIG_FILE);
}

function exactKeys(value: Record<string, unknown>): boolean {
  const requiredKeys = CONFIG_KEYS.filter((key) => !['key_tag', 'helper_path', 'signer_key', 'graph_plan', 'graph_evidence_store', 'graph_plan_digest'].includes(key));
  return Object.keys(value).every((key) => CONFIG_KEYS.includes(key as typeof CONFIG_KEYS[number]))
    && requiredKeys.every((key) => Object.hasOwn(value, key));
}

function containedPath(value: unknown, name: string, root: string): string {
  const raw = required(value, name);
  const resolved = path.resolve(root, raw);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`opn-web-ui-config-${name}-outside-identity-dir`);
  return resolved;
}

function optionalContainedPath(value: unknown, name: string, root: string): string | undefined {
  if (value === undefined) return undefined;
  return containedPath(value, name, root);
}

function validateEndpoint(value: unknown): string {
  const endpoint = required(value, 'pairing-endpoint');
  let parsed: URL;
  try { parsed = new URL(endpoint); } catch { throw new Error('opn-web-ui-config-pairing-endpoint-invalid'); }
  if (parsed.protocol !== 'https:') throw new Error('opn-web-ui-config-pairing-endpoint-invalid');
  return endpoint;
}

export function opnWebUiIdentityDir(input?: string): string {
  return identityDir(input);
}

export function opnWebUiConfigPath(identity_dir: string): string {
  return configPath(identity_dir);
}

export function validateOpnWebUiConfig(value: unknown, identity_dir: string): OpnWebUiConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('opn-web-ui-config-invalid');
  const item = value as Record<string, unknown>;
  if (!exactKeys(item)) throw new Error('opn-web-ui-config-field-invalid');
  if (item.schema !== OPN_WEB_UI_CONFIG_SCHEMA) throw new Error('opn-web-ui-config-schema-invalid');
  if (!Number.isInteger(item.port) || (item.port as number) < 1 || (item.port as number) > 65535) throw new Error('opn-web-ui-config-port-invalid');
  const root = identityDir(identity_dir);
  const graphPlan = optionalContainedPath(item.graph_plan, 'graph-plan', root);
  const graphEvidenceStore = optionalContainedPath(item.graph_evidence_store, 'graph-evidence-store', root);
  const graphPlanDigest = item.graph_plan_digest === undefined ? undefined : required(item.graph_plan_digest, 'graph-plan-digest');
  if (Boolean(graphPlan) !== Boolean(graphEvidenceStore) || Boolean(graphPlan) !== Boolean(graphPlanDigest)) throw new Error('opn-web-ui-config-graph-pair-required');
  if (graphPlanDigest && !/^sha256:[0-9a-f]{64}$/.test(graphPlanDigest)) throw new Error('opn-web-ui-config-graph-plan-digest-invalid');
  const keyTag = item.key_tag === undefined ? undefined : required(item.key_tag, 'key-tag');
  const helperPath = item.helper_path === undefined ? undefined : containedPath(item.helper_path, 'helper-path', root);
  const signerKey = optionalContainedPath(item.signer_key, 'signer-key', root);
  if (signerKey ? (keyTag !== undefined || helperPath !== undefined) : (keyTag === undefined || helperPath === undefined)) throw new Error('opn-web-ui-config-signer-invalid');
  return {
    network_id: required(item.network_id, 'network-id'),
    pairing_endpoint: validateEndpoint(item.pairing_endpoint),
    owner_token_file: containedPath(item.owner_token_file, 'owner-token-file', root),
    human_id: required(item.human_id, 'human-id'),
    device_key_id: required(item.device_key_id, 'device-key-id'),
    ...(keyTag ? { key_tag: keyTag } : {}),
    ...(helperPath ? { helper_path: helperPath } : {}),
    ...(signerKey ? { signer_key: signerKey } : {}),
    ca: containedPath(item.ca, 'ca', root),
    client_cert: containedPath(item.client_cert, 'client-cert', root),
    client_key: containedPath(item.client_key, 'client-key', root),
    state_store: containedPath(item.state_store, 'state-store', root),
    port: item.port as number,
    runtime_dir: containedPath(item.runtime_dir, 'runtime-dir', root),
    ...(graphPlan ? { graph_plan: graphPlan } : {}),
    ...(graphEvidenceStore ? { graph_evidence_store: graphEvidenceStore } : {}),
    ...(graphPlanDigest ? { graph_plan_digest: graphPlanDigest } : {}),
  };
}

export async function loadOpnWebUiConfig(identity_dir?: string): Promise<OpnWebUiConfig> {
  const root = identityDir(identity_dir);
  return validateOpnWebUiConfig(JSON.parse(await readFile(configPath(root), 'utf8')), root);
}

export async function writeOpnWebUiConfig(identity_dir: string, config: OpnWebUiConfig): Promise<string> {
  const root = identityDir(identity_dir);
  await mkdir(root, { recursive: true });
  const pathname = configPath(root);
  const value: OpnWebUiConfigFile = { schema: OPN_WEB_UI_CONFIG_SCHEMA, ...config };
  validateOpnWebUiConfig(value, root);
  await writeFile(pathname, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return pathname;
}
