import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
export const PROVIDER_AUTH_AUTHORITY_BINDING_SCHEMA = 'zj-loop.provider_auth_authority_binding.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const KEYS = new Set(['schema', 'service_id', 'network_id', 'socket_path', 'authority_contract_digest', 'state_store_identity_digest', 'state_store_path', 'process_identity_digest', 'pid', 'started_at', 'binding_digest']);
function canonical(value) { const result = canonicalize(value); if (typeof result !== 'string')
    throw new Error('provider-auth-authority-binding-canonicalization-invalid'); return result; }
function digest(value) { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function text(value) { return typeof value === 'string' && value.trim() !== '' && !value.includes('\0'); }
function absolute(value) { return text(value) && value.startsWith('/'); }
export function createProviderAuthAuthorityBinding(input) {
    const unsigned = { schema: PROVIDER_AUTH_AUTHORITY_BINDING_SCHEMA, ...structuredClone(input) };
    const binding = { ...unsigned, binding_digest: digest(unsigned) };
    const checked = validateProviderAuthAuthorityBinding(binding);
    if (checked.status === 'blocked')
        throw new Error(checked.reason);
    return Object.freeze(binding);
}
export function validateProviderAuthAuthorityBinding(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { status: 'blocked', reason: 'provider-auth-authority-binding-invalid' };
    const item = value;
    if (Object.keys(item).some((key) => !KEYS.has(key)) || item.schema !== PROVIDER_AUTH_AUTHORITY_BINDING_SCHEMA || !text(item.service_id) || !text(item.network_id) || !absolute(item.socket_path) || !DIGEST.test(String(item.authority_contract_digest)) || !DIGEST.test(String(item.state_store_identity_digest)) || !absolute(item.state_store_path) || !DIGEST.test(String(item.process_identity_digest)) || !Number.isInteger(item.pid) || item.pid < 1 || !Number.isFinite(Date.parse(String(item.started_at))) || !DIGEST.test(String(item.binding_digest)))
        return { status: 'blocked', reason: 'provider-auth-authority-binding-invalid' };
    const { binding_digest: _, ...unsigned } = item;
    if (digest(unsigned) !== item.binding_digest)
        return { status: 'blocked', reason: 'provider-auth-authority-binding-digest-invalid' };
    return { status: 'valid', binding: item };
}
export async function persistProviderAuthAuthorityBinding(filePath, binding) {
    const checked = validateProviderAuthAuthorityBinding(binding);
    if (checked.status === 'blocked')
        throw new Error(checked.reason);
    if (!absolute(filePath))
        throw new Error('provider-auth-authority-binding-path-invalid');
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    await writeFile(filePath, `${JSON.stringify(binding, null, 2)}\n`, { mode: 0o600 });
    await chmod(filePath, 0o600);
}
export async function readProviderAuthAuthorityBinding(filePath) {
    if (!absolute(filePath))
        throw new Error('provider-auth-authority-binding-path-invalid');
    const value = JSON.parse(await readFile(filePath, 'utf8'));
    const checked = validateProviderAuthAuthorityBinding(value);
    if (checked.status === 'blocked')
        throw new Error(checked.reason);
    return checked.binding;
}
