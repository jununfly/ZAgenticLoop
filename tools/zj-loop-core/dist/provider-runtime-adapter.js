import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
export const PROVIDER_RUNTIME_ADAPTER_CONTRACT_SCHEMA = 'zj-loop.provider_runtime_adapter_contract.v1';
export const PROVIDER_RESULT_SCHEMA = 'zj-loop.provider_result.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const CONTRACT_KEYS = new Set(['schema', 'adapter_id', 'adapter_version', 'binary_digest', 'argv_policy_digest', 'invocation_digest']);
const RESULT_KEYS = new Set(['schema', 'status', 'success', 'exit_code', 'signal', 'result', 'stdout_digest', 'stderr_digest', 'usage_metadata', 'evidence_refs']);
const MAX_RESULT_BYTES = 64 * 1024;
const MAX_EVIDENCE_REFS = 64;
function canonical(value) {
    const result = canonicalize(value);
    if (typeof result !== 'string')
        throw new Error('provider-runtime-adapter-canonicalization-invalid');
    return result;
}
function digest(value) {
    return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}
function text(value) {
    return typeof value === 'string' && value.length > 0 && !value.includes('\0');
}
export function providerRuntimeAdapterInvocationDigest(input) {
    return digest({ adapter_id: input.adapter_id, adapter_version: input.adapter_version, binary_digest: input.binary_digest, argv_policy_digest: input.argv_policy_digest });
}
export function providerRuntimeAdapterContractDigest(contract) {
    return digest(contract);
}
export function createProviderRuntimeAdapterContract(input) {
    if (!text(input.adapter_id) || !text(input.adapter_version) || !DIGEST.test(input.binary_digest) || !DIGEST.test(input.argv_policy_digest))
        throw new Error('provider-runtime-adapter-contract-invalid');
    const invocation_digest = providerRuntimeAdapterInvocationDigest(input);
    return { schema: PROVIDER_RUNTIME_ADAPTER_CONTRACT_SCHEMA, ...input, invocation_digest };
}
export function validateProviderRuntimeAdapterContract(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { status: 'blocked', reason: 'provider-runtime-adapter-contract-invalid' };
    const contract = value;
    if (Object.keys(contract).some((key) => !CONTRACT_KEYS.has(key)) || contract.schema !== PROVIDER_RUNTIME_ADAPTER_CONTRACT_SCHEMA || !text(contract.adapter_id) || !text(contract.adapter_version) || !DIGEST.test(contract.binary_digest) || !DIGEST.test(contract.argv_policy_digest) || !DIGEST.test(contract.invocation_digest) || contract.invocation_digest !== providerRuntimeAdapterInvocationDigest(contract))
        return { status: 'blocked', reason: 'provider-runtime-adapter-contract-invalid' };
    return { status: 'valid', contract };
}
export function validateProviderResult(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { status: 'blocked', reason: 'provider-result-invalid' };
    const result = value;
    if (Object.keys(result).some((key) => !RESULT_KEYS.has(key)) || result.schema !== PROVIDER_RESULT_SCHEMA || !['completed', 'failed', 'cancelled', 'timed-out'].includes(result.status) || typeof result.success !== 'boolean' || (result.exit_code !== null && !Number.isInteger(result.exit_code)) || (result.signal !== null && !text(result.signal)) || !DIGEST.test(result.stdout_digest) || !DIGEST.test(result.stderr_digest))
        return { status: 'blocked', reason: 'provider-result-invalid' };
    if (result.result !== undefined && (typeof result.result !== 'string' || Buffer.byteLength(result.result, 'utf8') > MAX_RESULT_BYTES))
        return { status: 'blocked', reason: 'provider-result-bounded-result-invalid' };
    if (result.usage_metadata !== undefined && (!result.usage_metadata || Array.isArray(result.usage_metadata) || Object.entries(result.usage_metadata).some(([key, value]) => !text(key) || (typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'number' && !Number.isFinite(value)))))
        return { status: 'blocked', reason: 'provider-result-usage-metadata-invalid' };
    if (result.evidence_refs !== undefined && (!Array.isArray(result.evidence_refs) || result.evidence_refs.length > MAX_EVIDENCE_REFS || result.evidence_refs.some((ref) => !text(ref))))
        return { status: 'blocked', reason: 'provider-result-evidence-refs-invalid' };
    if (result.status === 'completed' && !result.success)
        return { status: 'blocked', reason: 'provider-result-success-mismatch' };
    if (result.status !== 'completed' && result.success)
        return { status: 'blocked', reason: 'provider-result-success-mismatch' };
    return { status: 'valid', result };
}
export function providerResultFromLocalProcess(input) {
    const hash = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
    return {
        schema: PROVIDER_RESULT_SCHEMA,
        status: input.status,
        success: input.success,
        exit_code: input.exit_code,
        signal: input.signal,
        stdout_digest: hash(input.stdout),
        stderr_digest: hash(input.stderr),
    };
}
