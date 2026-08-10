import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
export const OPN_ENDPOINT_CONFIG_SCHEMA = 'zj-loop.opn_endpoint_config.v1';
export const OPN_ENDPOINT_CONFIG_FILE = 'opn-endpoint.json';
function required(value, name) {
    if (typeof value !== 'string' || !value.trim())
        throw new Error(`opn-endpoint-config-${name}-required`);
    return value.trim();
}
function absolute(value, name) {
    const resolved = path.resolve(required(value, name));
    return resolved;
}
export function opnEndpointIdentityDir(input) {
    const value = input?.trim() || process.env.OPN_IDENTITY_DIR?.trim();
    if (value)
        return path.resolve(value);
    return path.join(os.homedir(), '.zj-loop', 'identity');
}
export function opnEndpointConfigPath(identity_dir) {
    return path.join(opnEndpointIdentityDir(identity_dir), OPN_ENDPOINT_CONFIG_FILE);
}
export function validateOpnEndpointConfig(value, identity_dir) {
    if (!value || typeof value !== 'object')
        throw new Error('opn-endpoint-config-invalid');
    const item = value;
    if (item.schema !== OPN_ENDPOINT_CONFIG_SCHEMA)
        throw new Error('opn-endpoint-config-schema-invalid');
    if (!Number.isInteger(item.port) || (item.port ?? 0) < 1 || (item.port ?? 0) > 65535)
        throw new Error('opn-endpoint-config-port-invalid');
    const root = opnEndpointIdentityDir(identity_dir);
    const resolvePath = (value, name) => path.isAbsolute(required(value, name)) ? String(value) : path.resolve(root, String(value));
    return {
        bind: required(item.bind, 'bind'),
        port: item.port,
        network_id: required(item.network_id, 'network-id'),
        state_store: resolvePath(item.state_store, 'state-store'),
        server_key: resolvePath(item.server_key, 'server-key'),
        server_cert: resolvePath(item.server_cert, 'server-cert'),
        client_ca: resolvePath(item.client_ca, 'client-ca'),
        artifact_store: item.artifact_store === undefined ? undefined : resolvePath(item.artifact_store, 'artifact-store'),
        owner_human_id: item.owner_human_id === undefined ? undefined : required(item.owner_human_id, 'owner-human-id'),
        owner_public_key: item.owner_public_key === undefined ? undefined : resolvePath(item.owner_public_key, 'owner-public-key'),
        owner_token: item.owner_token === undefined ? undefined : required(item.owner_token, 'owner-token'),
        session_ttl_minutes: item.session_ttl_minutes === undefined ? 50 : item.session_ttl_minutes,
    };
}
export async function loadOpnEndpointConfig(identity_dir) {
    const root = opnEndpointIdentityDir(identity_dir);
    return validateOpnEndpointConfig(JSON.parse(await readFile(opnEndpointConfigPath(root), 'utf8')), root);
}
export async function writeOpnEndpointConfig(identity_dir, config) {
    const root = opnEndpointIdentityDir(identity_dir);
    await mkdir(root, { recursive: true });
    const pathname = opnEndpointConfigPath(root);
    const value = { schema: OPN_ENDPOINT_CONFIG_SCHEMA, ...config };
    await writeFile(pathname, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    return pathname;
}
