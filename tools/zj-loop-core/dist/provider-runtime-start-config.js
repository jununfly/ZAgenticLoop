import { validateProviderRuntimeIdentityBinding } from './provider-auth-runtime.js';
export const PROVIDER_RUNTIME_START_CONFIG_SCHEMA = 'zj-loop.provider_runtime_start_config.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PEER_DIGEST = /^[0-9a-f]{64}$/;
const KEYS = new Set(['schema', 'network_id', 'runtime_id', 'provider_ids', 'socket_path', 'correlation_id', 'expected_peer_identity_digest', 'provider_executable', 'working_directory', 'contract_digest', 'adapter_contract_digest', 'runtime_binding', 'state_store_path', 'binding_path', 'macos_helper_path', 'macos_helper_digest', 'artifact_manifest_path', 'runtime_artifact_path', 'helper_artifact_path', 'artifact_profile']);
const SECRET_KEYS = new Set(['secret', 'token', 'password', 'private_key', 'auth_ref', 'credential']);
function text(value) { return typeof value === 'string' && value.trim() !== '' && !value.includes('\0'); }
function absolute(value) { return text(value) && value.startsWith('/'); }
export function validateProviderRuntimeStartConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { status: 'blocked', reason: 'provider-runtime-start-config-invalid' };
    const item = value;
    if ([...Object.keys(item)].some((key) => SECRET_KEYS.has(key)))
        return { status: 'blocked', reason: 'provider-runtime-start-config-secret-field' };
    const artifactFields = [item.artifact_manifest_path, item.runtime_artifact_path, item.helper_artifact_path];
    if (Object.keys(item).some((key) => !KEYS.has(key)) || item.schema !== PROVIDER_RUNTIME_START_CONFIG_SCHEMA || !text(item.network_id) || !text(item.runtime_id) || !Array.isArray(item.provider_ids) || item.provider_ids.length === 0 || !item.provider_ids.every(text) || !absolute(item.socket_path) || !text(item.correlation_id) || !PEER_DIGEST.test(String(item.expected_peer_identity_digest)) || !absolute(item.provider_executable) || !absolute(item.working_directory) || !DIGEST.test(String(item.contract_digest)) || !DIGEST.test(String(item.adapter_contract_digest)) || validateProviderRuntimeIdentityBinding(item.runtime_binding).status === 'blocked' || !absolute(item.state_store_path) || !absolute(item.binding_path) || (item.macos_helper_path !== undefined && !absolute(item.macos_helper_path)) || (item.macos_helper_digest !== undefined && !DIGEST.test(String(item.macos_helper_digest))) || (item.macos_helper_path !== undefined) !== (item.macos_helper_digest !== undefined) || (artifactFields.some((field) => field !== undefined) && (!artifactFields.every(absolute) || (item.artifact_profile !== undefined && item.artifact_profile !== 'development-local' && item.artifact_profile !== 'production'))) || (artifactFields.every((field) => field === undefined) && item.artifact_profile !== undefined))
        return { status: 'blocked', reason: 'provider-runtime-start-config-invalid' };
    return { status: 'valid', config: structuredClone(item) };
}
