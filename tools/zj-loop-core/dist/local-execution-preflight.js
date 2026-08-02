import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const LOCAL_EXECUTION_PREFLIGHT_SCHEMA = 'zj-loop.local_execution_preflight.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[^\s]{1,256}$/;
function canonical(value) { const json = canonicalize(value); if (typeof json !== 'string')
    throw new Error('local-execution-preflight-canonicalization-invalid'); return json; }
function digest(value) { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function validText(value) { return typeof value === 'string' && value.length > 0 && value.length <= 4096; }
function validId(value) { return typeof value === 'string' && ID.test(value); }
function validTimestamp(value) { return validText(value) && Number.isFinite(Date.parse(value)); }
function exactKeys(value) { return Object.keys(value).every((key) => ['schema', 'status', 'side_effects_executed', 'network_id', 'plan_id', 'plan_revision', 'task_id', 'execution_id', 'attempt', 'runner_id', 'registry_revision', 'registry_snapshot_digest', 'capabilities_digest', 'provider_id', 'adapter_version', 'executable', 'executable_digest', 'args', 'argv_digest', 'cwd', 'cwd_digest', 'env_allowlist', 'env_policy_digest', 'sandbox_policy_digest', 'network_policy', 'timeout_ms', 'termination_grace_ms', 'max_stdout_bytes', 'max_stderr_bytes', 'orchestration_preflight_digest', 'issued_at', 'expires_at', 'preflight_digest'].includes(key)); }
function shapeError(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !exactKeys(value))
        return 'local-execution-preflight-schema-invalid';
    const item = value;
    if (item.schema !== LOCAL_EXECUTION_PREFLIGHT_SCHEMA || item.status !== 'execution-ready' || item.side_effects_executed !== false)
        return 'local-execution-preflight-status-invalid';
    for (const key of ['network_id', 'plan_id', 'task_id', 'execution_id', 'provider_id', 'adapter_version'])
        if (!validId(item[key]))
            return `local-execution-preflight-${key}-invalid`;
    if (!Number.isInteger(item.plan_revision) || item.plan_revision < 1 || !Number.isInteger(item.attempt) || item.attempt < 1 || !Number.isInteger(item.registry_revision) || item.registry_revision < 1)
        return 'local-execution-preflight-revision-invalid';
    if (!validId(item.runner_id))
        return 'local-execution-preflight-runner-id-invalid';
    if (!validText(item.executable) || !item.executable.startsWith('/') || item.executable.includes('\0') || !validText(item.cwd) || !item.cwd.startsWith('/') || item.cwd.includes('\0'))
        return 'local-execution-preflight-path-invalid';
    if (!Array.isArray(item.args) || !item.args.every((arg) => typeof arg === 'string' && !arg.includes('\0')))
        return 'local-execution-preflight-args-invalid';
    if (!Array.isArray(item.env_allowlist) || new Set(item.env_allowlist).size !== item.env_allowlist.length || !item.env_allowlist.every((key) => typeof key === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)))
        return 'local-execution-preflight-env-invalid';
    for (const key of ['executable_digest', 'argv_digest', 'cwd_digest', 'env_policy_digest', 'sandbox_policy_digest', 'orchestration_preflight_digest', 'registry_snapshot_digest', 'capabilities_digest', 'preflight_digest'])
        if (typeof item[key] !== 'string' || !DIGEST.test(item[key]))
            return `local-execution-preflight-${key}-invalid`;
    const networkPolicy = item.network_policy;
    if (!networkPolicy || !['network-denied', 'network-allowed'].includes(networkPolicy.mode) || typeof networkPolicy.policy_digest !== 'string' || !DIGEST.test(networkPolicy.policy_digest))
        return 'local-execution-preflight-network-policy-invalid';
    for (const [key, max] of [['timeout_ms', Number.MAX_SAFE_INTEGER], ['termination_grace_ms', Number.MAX_SAFE_INTEGER], ['max_stdout_bytes', 10 * 1024 * 1024], ['max_stderr_bytes', 10 * 1024 * 1024]])
        if (!Number.isInteger(item[key]) || item[key] < 1 || item[key] > max)
            return `local-execution-preflight-${key}-invalid`;
    if (!validTimestamp(item.issued_at) || !validTimestamp(item.expires_at) || Date.parse(item.issued_at) >= Date.parse(item.expires_at))
        return 'local-execution-preflight-time-invalid';
    return null;
}
export function createLocalExecutionPreflight(input) {
    const value = { schema: LOCAL_EXECUTION_PREFLIGHT_SCHEMA, status: 'execution-ready', side_effects_executed: false, ...structuredClone(input), env_allowlist: [...new Set(input.env_allowlist)].sort(), preflight_digest: `sha256:${'0'.repeat(64)}` };
    const error = shapeError(value);
    if (error)
        throw new Error(error);
    const { preflight_digest: _, ...unsigned } = value;
    return { ...unsigned, preflight_digest: digest(unsigned) };
}
export function localExecutionPreflightDigest(value) { const { preflight_digest: _, ...unsigned } = value; return digest(unsigned); }
export function validateLocalExecutionPreflight(value) {
    const error = shapeError(value);
    if (error)
        return { status: 'blocked', reason: error };
    const item = value;
    if (item.preflight_digest !== localExecutionPreflightDigest(item))
        return { status: 'blocked', reason: 'local-execution-preflight-digest-invalid' };
    return { status: 'valid' };
}
