import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
export const OPN_WEB_UI_CONFIG_SCHEMA = 'zj-loop.opn_web_ui_config.v1';
export const OPN_WEB_UI_CONFIG_FILE = 'opn-web-ui.json';
const CONFIG_KEYS = [
    'schema', 'network_id', 'pairing_endpoint', 'owner_token_file', 'human_id',
    'device_key_id', 'key_tag', 'helper_path', 'ca', 'client_cert', 'client_key',
    'signer_key', 'state_store', 'port', 'runtime_dir', 'graph_plan', 'graph_evidence_store',
    'graph_plan_digest',
];
function required(value, name) {
    if (typeof value !== 'string' || !value.trim())
        throw new Error(`opn-web-ui-config-${name}-required`);
    return value.trim();
}
function identityDir(input) {
    const value = input?.trim() || process.env.OPN_IDENTITY_DIR?.trim();
    return path.resolve(value || path.join(os.homedir(), '.zj-loop', 'identity'));
}
function configPath(identity_dir) {
    return path.join(identityDir(identity_dir), OPN_WEB_UI_CONFIG_FILE);
}
function exactKeys(value) {
    const requiredKeys = CONFIG_KEYS.filter((key) => !['key_tag', 'helper_path', 'signer_key', 'graph_plan', 'graph_evidence_store', 'graph_plan_digest'].includes(key));
    return Object.keys(value).every((key) => CONFIG_KEYS.includes(key))
        && requiredKeys.every((key) => Object.hasOwn(value, key));
}
function containedPath(value, name, root) {
    const raw = required(value, name);
    const resolved = path.resolve(root, raw);
    const relative = path.relative(root, resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
        throw new Error(`opn-web-ui-config-${name}-outside-identity-dir`);
    return resolved;
}
function optionalContainedPath(value, name, root) {
    if (value === undefined)
        return undefined;
    return containedPath(value, name, root);
}
function validateEndpoint(value) {
    const endpoint = required(value, 'pairing-endpoint');
    let parsed;
    try {
        parsed = new URL(endpoint);
    }
    catch {
        throw new Error('opn-web-ui-config-pairing-endpoint-invalid');
    }
    if (parsed.protocol !== 'https:')
        throw new Error('opn-web-ui-config-pairing-endpoint-invalid');
    return endpoint;
}
export function opnWebUiIdentityDir(input) {
    return identityDir(input);
}
export function opnWebUiConfigPath(identity_dir) {
    return configPath(identity_dir);
}
export function validateOpnWebUiConfig(value, identity_dir) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('opn-web-ui-config-invalid');
    const item = value;
    if (!exactKeys(item))
        throw new Error('opn-web-ui-config-field-invalid');
    if (item.schema !== OPN_WEB_UI_CONFIG_SCHEMA)
        throw new Error('opn-web-ui-config-schema-invalid');
    if (!Number.isInteger(item.port) || item.port < 1 || item.port > 65535)
        throw new Error('opn-web-ui-config-port-invalid');
    const root = identityDir(identity_dir);
    const graphPlan = optionalContainedPath(item.graph_plan, 'graph-plan', root);
    const graphEvidenceStore = optionalContainedPath(item.graph_evidence_store, 'graph-evidence-store', root);
    const graphPlanDigest = item.graph_plan_digest === undefined ? undefined : required(item.graph_plan_digest, 'graph-plan-digest');
    if (Boolean(graphPlan) !== Boolean(graphEvidenceStore) || Boolean(graphPlan) !== Boolean(graphPlanDigest))
        throw new Error('opn-web-ui-config-graph-pair-required');
    if (graphPlanDigest && !/^sha256:[0-9a-f]{64}$/.test(graphPlanDigest))
        throw new Error('opn-web-ui-config-graph-plan-digest-invalid');
    const keyTag = item.key_tag === undefined ? undefined : required(item.key_tag, 'key-tag');
    const helperPath = item.helper_path === undefined ? undefined : containedPath(item.helper_path, 'helper-path', root);
    const signerKey = optionalContainedPath(item.signer_key, 'signer-key', root);
    if (signerKey ? (keyTag !== undefined || helperPath !== undefined) : (keyTag === undefined || helperPath === undefined))
        throw new Error('opn-web-ui-config-signer-invalid');
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
        port: item.port,
        runtime_dir: containedPath(item.runtime_dir, 'runtime-dir', root),
        ...(graphPlan ? { graph_plan: graphPlan } : {}),
        ...(graphEvidenceStore ? { graph_evidence_store: graphEvidenceStore } : {}),
        ...(graphPlanDigest ? { graph_plan_digest: graphPlanDigest } : {}),
    };
}
export async function loadOpnWebUiConfig(identity_dir) {
    const root = identityDir(identity_dir);
    return validateOpnWebUiConfig(JSON.parse(await readFile(configPath(root), 'utf8')), root);
}
export async function writeOpnWebUiConfig(identity_dir, config) {
    const root = identityDir(identity_dir);
    await mkdir(root, { recursive: true });
    const pathname = configPath(root);
    const value = { schema: OPN_WEB_UI_CONFIG_SCHEMA, ...config };
    validateOpnWebUiConfig(value, root);
    await writeFile(pathname, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    return pathname;
}
