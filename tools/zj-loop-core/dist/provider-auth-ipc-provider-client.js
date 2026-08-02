import { randomUUID } from 'node:crypto';
import { connectUnixProviderAuthIpc } from './provider-auth-ipc-unix.js';
import { createProviderAuthIpcFrame } from './provider-auth-ipc-protocol.js';
import { validateProviderLaunchHandle } from './provider-auth-runtime.js';
import { validateProviderResult } from './provider-runtime-adapter.js';
const LAUNCH_REQUEST_SCHEMA = 'zj-loop.provider_launch_request.v1';
const LAUNCH_RESPONSE_SCHEMA = 'zj-loop.provider_launch_response.v1';
const RESULT_SCHEMA = 'zj-loop.provider_ipc_result.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export function createProviderRuntimeIpcProvider(input) {
    let launch_handle;
    return {
        async run(request) {
            if (!request.cwd || !request.executable)
                throw new Error('provider-runtime-ipc-provider-resource-invalid');
            if (!DIGEST.test(input.auth_ref_digest) || !DIGEST.test(input.contract_digest) || !DIGEST.test(input.adapter_contract_digest))
                throw new Error('provider-runtime-ipc-provider-contract-invalid');
            const timeout = input.timeout_ms ?? 15_000;
            if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120_000)
                throw new Error('provider-runtime-ipc-provider-timeout-invalid');
            const correlation_id = input.correlation_id ?? `provider-${randomUUID()}`;
            const stdout = [];
            const stderr = [];
            let resolveTerminal = () => undefined;
            let rejectTerminal = () => undefined;
            const terminal = new Promise((resolve, reject) => { resolveTerminal = resolve; rejectTerminal = reject; });
            let connection;
            let timer;
            try {
                connection = await connectUnixProviderAuthIpc({ socket_path: input.socket_path, correlation_id, timeout_ms: timeout, on_frames: (frames) => {
                        for (const frame of frames) {
                            if (frame.network_id !== input.network_id || frame.node_id !== input.node_id || frame.provider_runtime_id !== input.provider_runtime_id || frame.provider_id !== input.provider_id || frame.execution_id !== input.execution_id || frame.attempt !== input.attempt) {
                                rejectTerminal(new Error('provider-runtime-ipc-provider-binding-mismatch'));
                                return;
                            }
                            if (frame.kind === 'launch-accepted' || frame.kind === 'stdout' || frame.kind === 'stderr' || frame.kind === 'result' || frame.kind === 'error' || frame.kind === 'exit') {
                                if (frame.kind !== 'error' && frame.launch_handle_digest === undefined) {
                                    rejectTerminal(new Error('provider-runtime-ipc-provider-handle-mismatch'));
                                    return;
                                }
                                if (frame.kind === 'error' && launch_handle && frame.launch_handle_digest !== launch_handle.handle_digest) {
                                    rejectTerminal(new Error('provider-runtime-ipc-provider-handle-mismatch'));
                                    return;
                                }
                            }
                            if (frame.kind === 'launch-accepted') {
                                if (!frame.payload || typeof frame.payload !== 'object' || Array.isArray(frame.payload)) {
                                    rejectTerminal(new Error('provider-runtime-ipc-launch-response-invalid'));
                                    return;
                                }
                                const payload = frame.payload;
                                if (Object.keys(payload).some((key) => !['schema', 'status', 'handle'].includes(key)) || payload.schema !== LAUNCH_RESPONSE_SCHEMA || payload.status !== 'accepted') {
                                    rejectTerminal(new Error('provider-runtime-ipc-launch-response-invalid'));
                                    return;
                                }
                                const handle = validateProviderLaunchHandle(payload.handle);
                                if (handle.status === 'blocked' || handle.handle.network_id !== input.network_id || handle.handle.node_id !== input.node_id || handle.handle.provider_runtime_id !== input.provider_runtime_id || handle.handle.provider_id !== input.provider_id || handle.handle.execution_id !== input.execution_id || handle.handle.attempt !== input.attempt || handle.handle.adapter_contract_digest !== input.adapter_contract_digest || handle.handle.runtime_identity_fingerprint !== input.runtime_binding.runtime_identity_fingerprint || handle.handle.runtime_manifest_digest !== input.runtime_binding.runtime_manifest_digest || handle.handle.provider_capabilities_digest !== input.runtime_binding.provider_capabilities_digest) {
                                    rejectTerminal(new Error('provider-runtime-ipc-launch-handle-invalid'));
                                    return;
                                }
                                launch_handle = handle.handle;
                            }
                            else if (frame.kind === 'stdout' || frame.kind === 'stderr') {
                                if (typeof frame.payload !== 'string') {
                                    rejectTerminal(new Error('provider-runtime-ipc-output-invalid'));
                                    return;
                                }
                                (frame.kind === 'stdout' ? stdout : stderr).push(frame.payload);
                            }
                            else if (frame.kind === 'result' || frame.kind === 'error' || frame.kind === 'exit')
                                resolveTerminal(frame);
                        }
                    } });
                timer = setTimeout(() => rejectTerminal(new Error('provider-runtime-ipc-provider-timeout')), timeout);
                await connection.send(createProviderAuthIpcFrame({ correlation_id, sequence: 1, network_id: input.network_id, node_id: input.node_id, provider_runtime_id: input.provider_runtime_id, provider_id: input.provider_id, execution_id: input.execution_id, attempt: input.attempt, kind: 'challenge', nonce: randomUUID(), payload: { schema: LAUNCH_REQUEST_SCHEMA, auth_ref_digest: input.auth_ref_digest, contract_digest: input.contract_digest, adapter_contract_digest: input.adapter_contract_digest, ...input.runtime_binding, task: { ...(input.task ?? {}), goal: request.prompt } } }));
                const frame = await terminal;
                if (frame.kind !== 'result') {
                    if (frame.kind === 'error' && frame.payload && typeof frame.payload === 'object' && !Array.isArray(frame.payload) && typeof frame.payload.code === 'string' && frame.payload.code.trim())
                        throw new Error(frame.payload.code);
                    throw new Error(frame.kind === 'error' ? 'provider-runtime-ipc-provider-rejected' : 'provider-runtime-ipc-provider-terminated');
                }
                if (!frame.payload || typeof frame.payload !== 'object' || Array.isArray(frame.payload))
                    throw new Error('provider-runtime-ipc-result-invalid');
                const payload = frame.payload;
                if (Object.keys(payload).some((key) => !['schema', 'status', 'success', 'pid', 'exit_code', 'signal', 'provider_result'].includes(key)) || payload.schema !== RESULT_SCHEMA || typeof payload.status !== 'string' || typeof payload.success !== 'boolean' || !Number.isInteger(payload.pid) || (payload.exit_code !== null && !Number.isInteger(payload.exit_code)) || (payload.signal !== null && typeof payload.signal !== 'string') || !payload.provider_result)
                    throw new Error('provider-runtime-ipc-result-invalid');
                const providerResult = validateProviderResult(payload.provider_result);
                if (providerResult.status === 'blocked')
                    throw new Error('provider-runtime-ipc-provider-result-invalid');
                if (!launch_handle)
                    throw new Error('provider-runtime-ipc-launch-handle-missing');
                if (providerResult.result.status !== payload.status || providerResult.result.success !== payload.success)
                    throw new Error('provider-runtime-ipc-result-status-mismatch');
                return { status: payload.status, success: payload.success, pid: payload.pid, exit_code: payload.exit_code, signal: payload.signal, stdout: stdout.join(''), stderr: stderr.join(''), provider_result: providerResult.result, launch_handle };
            }
            catch (error) {
                throw error instanceof Error ? error : new Error('provider-runtime-ipc-provider-failed');
            }
            finally {
                if (timer)
                    clearTimeout(timer);
                connection?.close();
            }
        },
        getLaunchHandle() { return launch_handle; },
    };
}
