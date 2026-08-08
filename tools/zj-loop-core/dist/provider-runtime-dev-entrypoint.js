import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInMemoryProviderAuthRuntime, validateProviderAuthRef } from './provider-auth-runtime.js';
import { createProviderAuthRuntimeIpcLauncher } from './provider-auth-runtime-ipc-launcher.js';
import { createProviderRuntimeAdapterContract, providerRuntimeAdapterContractDigest } from './provider-runtime-adapter.js';
import { createProviderRuntimeServiceBinding, persistProviderRuntimeServiceBinding, validateProviderRuntimeServiceBinding } from './provider-runtime-service-binding.js';
import { createInMemoryTrustedRunnerPeerIdentityVerifier } from './trusted-runner-peer-identity.js';
export const PROVIDER_RUNTIME_DEV_BINDING_SCHEMA = 'zj-loop.provider_runtime_dev_binding.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
function canonical(value) {
    const result = canonicalize(value);
    if (typeof result !== 'string')
        throw new Error('provider-runtime-dev-canonicalization-invalid');
    return result;
}
function digest(value) {
    return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`;
}
function fileDigest(bytes) {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
function absolute(value) { return value.startsWith('/'); }
export function validateProviderRuntimeDevBinding(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { status: 'blocked', reason: 'provider-runtime-dev-binding-invalid' };
    const item = value;
    if (item.schema !== PROVIDER_RUNTIME_DEV_BINDING_SCHEMA || item.profile !== 'development-local' || item.warning !== 'development-only-in-memory-auth-authority' || typeof item.auth_ref_path !== 'string' || !absolute(item.auth_ref_path) || typeof item.correlation_id !== 'string' || item.correlation_id.trim() === '' || typeof item.dev_binding_path !== 'string' || !absolute(item.dev_binding_path) || !item.binding || typeof item.binding !== 'object')
        return { status: 'blocked', reason: 'provider-runtime-dev-binding-invalid' };
    if (validateProviderRuntimeServiceBinding(item.binding).status === 'blocked')
        return { status: 'blocked', reason: 'provider-runtime-dev-service-binding-invalid' };
    if (validateProviderAuthRef(item.auth_ref).status === 'blocked' || !DIGEST.test(String(item.auth_ref.ref_digest)))
        return { status: 'blocked', reason: 'provider-runtime-dev-auth-ref-invalid' };
    return { status: 'valid', binding: item };
}
function validateConfig(input) {
    if (input.profile !== 'development-local')
        throw new Error('provider-runtime-dev-profile-required');
    if (![input.network_id, input.runtime_id, input.provider_id, input.node_id, input.execution_id, input.provider_secret].every((value) => typeof value === 'string' && value.trim() !== '' && !value.includes('\0')))
        throw new Error('provider-runtime-dev-config-invalid');
    if (!Number.isInteger(input.attempt) || input.attempt < 1)
        throw new Error('provider-runtime-dev-attempt-invalid');
    if (![input.socket_path, input.binding_path, input.auth_ref_path, input.provider_executable, input.working_directory].every(absolute))
        throw new Error('provider-runtime-dev-path-invalid');
    if (input.auth_ref_ttl_ms !== undefined && (!Number.isInteger(input.auth_ref_ttl_ms) || input.auth_ref_ttl_ms < 1 || input.auth_ref_ttl_ms > 24 * 60 * 60 * 1000))
        throw new Error('provider-runtime-dev-auth-ref-ttl-invalid');
    if (input.provider_auth_env !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.provider_auth_env))
        throw new Error('provider-runtime-dev-provider-auth-env-invalid');
}
export function createDevelopmentProviderRuntime(input, options = {}) {
    validateConfig(input);
    const now = options.now ?? (() => new Date().toISOString());
    const peerDigest = options.peer_identity_digest ?? 'a'.repeat(64);
    if (!/^[0-9a-f]{64}$/.test(peerDigest))
        throw new Error('provider-runtime-dev-peer-identity-digest-invalid');
    const peerIdentity = { schema: 'zj-loop.trusted_runner_peer_identity.v1', platform: process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux', kind: process.platform === 'darwin' ? 'process-audit' : process.platform === 'win32' ? 'named-pipe-token' : 'peer-credentials', identity_digest: peerDigest, process_id: options.peer_process_id ?? null };
    const runtimeBinding = {
        runtime_identity_fingerprint: digest({ runtime_id: input.runtime_id, profile: input.profile, platform: process.platform }),
        runtime_manifest_digest: digest({ runtime_id: input.runtime_id, provider_id: input.provider_id, executable: input.provider_executable }),
        provider_capabilities_digest: digest({ provider_id: input.provider_id, capabilities: ['read-only', 'write-enabled'] }),
    };
    let launcher;
    let started = false;
    let binding;
    let devBinding;
    const correlationId = `${input.runtime_id}:dev`;
    const devBindingPath = path.join(path.dirname(input.binding_path), 'provider-runtime-dev-binding.json');
    return {
        async start() {
            if (started)
                throw new Error('provider-runtime-dev-already-started');
            const executableBytes = await readFile(input.provider_executable);
            const adapterContract = createProviderRuntimeAdapterContract({ adapter_id: 'codex-agent-provider', adapter_version: 'dev', binary_digest: fileDigest(executableBytes), argv_policy_digest: digest({ mode: 'bounded-codex-exec' }) });
            const contractDigest = digest({ schema: 'zj-loop.provider_runtime_contract.v1', runtime_id: input.runtime_id, runtimeBinding });
            const adapterDigest = providerRuntimeAdapterContractDigest(adapterContract);
            const runtime = createInMemoryProviderAuthRuntime({ runtime_id: input.runtime_id, provider_ids: [input.provider_id], runtime_binding: runtimeBinding, now });
            const issued = await runtime.issueRef({ network_id: input.network_id, node_id: input.node_id, provider_id: input.provider_id, execution_id: input.execution_id, attempt: input.attempt, audience: input.runtime_id, scope: ['provider.execute'], secret: input.provider_secret, issued_at: now(), expires_at: new Date(Date.parse(now()) + (input.auth_ref_ttl_ms ?? 50 * 60 * 1000)).toISOString(), human_authorized: true });
            if (issued.status === 'blocked')
                throw new Error(issued.reason);
            const providerAuthEnv = input.provider_auth_env ?? 'AICODING_API_KEY';
            launcher = createProviderAuthRuntimeIpcLauncher({ socket_path: input.socket_path, correlation_id: correlationId, expected_peer_identity_digest: peerDigest, verify_peer: createInMemoryTrustedRunnerPeerIdentityVerifier({ identity: peerIdentity }), runtime, auth_ref: issued.ref, contract_digest: contractDigest, adapter_contract_digest: adapterDigest, runtime_binding: runtimeBinding, provider_executable: input.provider_executable, working_directory: input.working_directory, invocation_timeout_ms: input.invocation_timeout_ms, termination_grace_ms: input.termination_grace_ms, env_allowlist: ['PATH', 'HOME', 'TMPDIR', providerAuthEnv], env: { [providerAuthEnv]: input.provider_secret } });
            await launcher.start();
            const readiness = await launcher.readiness();
            if (readiness.status === 'blocked') {
                await launcher.close();
                launcher = undefined;
                throw new Error(readiness.reason);
            }
            binding = createProviderRuntimeServiceBinding({ service_id: input.runtime_id, network_id: input.network_id, socket_path: input.socket_path, provider_id: input.provider_id, provider_executable: input.provider_executable, working_directory: input.working_directory, contract_digest: contractDigest, adapter_contract_digest: adapterDigest, runtime_binding: runtimeBinding, process_identity_digest: digest({ pid: process.pid, runtime_id: input.runtime_id }), pid: process.pid, started_at: now() });
            await persistProviderRuntimeServiceBinding(input.binding_path, binding);
            devBinding = { schema: PROVIDER_RUNTIME_DEV_BINDING_SCHEMA, profile: 'development-local', binding, auth_ref: issued.ref, auth_ref_path: input.auth_ref_path, correlation_id: correlationId, dev_binding_path: devBindingPath, warning: 'development-only-in-memory-auth-authority' };
            await mkdir(path.dirname(input.auth_ref_path), { recursive: true, mode: 0o700 });
            await writeFile(input.auth_ref_path, `${JSON.stringify({ schema: 'zj-loop.provider_runtime_dev_auth_ref.v1', auth_ref: issued.ref })}\n`, { mode: 0o600 });
            await chmod(input.auth_ref_path, 0o600);
            await writeFile(devBindingPath, `${JSON.stringify(devBinding, null, 2)}\n`, { mode: 0o600 });
            await chmod(devBindingPath, 0o600);
            started = true;
            return { status: 'started', binding, dev_binding: devBinding };
        },
        async close() {
            if (launcher)
                await launcher.close();
            await unlink(input.binding_path).catch(() => undefined);
            await unlink(input.auth_ref_path).catch(() => undefined);
            await unlink(devBindingPath).catch(() => undefined);
            launcher = undefined;
            binding = undefined;
            devBinding = undefined;
            started = false;
        },
    };
}
