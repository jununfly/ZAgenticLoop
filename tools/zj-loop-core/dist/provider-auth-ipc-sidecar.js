import { validateProviderResult } from './provider-runtime-adapter.js';
import { createProviderAuthIpcFrame } from './provider-auth-ipc-protocol.js';
import { createUnixProviderAuthIpcServer } from './provider-auth-ipc-unix.js';
const LAUNCH_REQUEST_SCHEMA = 'zj-loop.provider_launch_request.v1';
const LAUNCH_RESPONSE_SCHEMA = 'zj-loop.provider_launch_response.v1';
const RESULT_SCHEMA = 'zj-loop.provider_ipc_result.v1';
const CLEANUP_RESPONSE_SCHEMA = 'zj-loop.provider_cleanup_response.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export function createProviderAuthRuntimeIpcSidecar(input) {
    const now = input.now ?? (() => new Date().toISOString());
    const states = new WeakMap();
    const handles = new Map();
    const error = async (connection, frame, code, sequence, launchHandleDigest) => {
        await connection.send(createProviderAuthIpcFrame({ correlation_id: input.correlation_id, sequence, network_id: frame.network_id, node_id: frame.node_id, provider_runtime_id: frame.provider_runtime_id, provider_id: frame.provider_id, execution_id: frame.execution_id, attempt: frame.attempt, kind: 'error', ...(launchHandleDigest ? { launch_handle_digest: launchHandleDigest } : {}), payload: { code } }));
    };
    const server = createUnixProviderAuthIpcServer({ socket_path: input.socket_path, correlation_id: input.correlation_id, verify_peer: () => true, on_frames: async (frames, connection) => {
            const frame = frames[0];
            if (!frame)
                return;
            const state = states.get(connection) ?? { sequence: 1 };
            states.set(connection, state);
            if (frame.kind === 'challenge') {
                const payload = frame.payload;
                if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                    await error(connection, frame, 'provider-auth-ipc-launch-request-invalid', state.sequence++);
                    return;
                }
                const value = payload;
                if (Object.keys(value).some((key) => !['schema', 'auth_ref_digest', 'contract_digest', 'adapter_contract_digest', 'task'].includes(key)) || value.schema !== LAUNCH_REQUEST_SCHEMA || value.auth_ref_digest !== input.auth_ref.ref_digest || value.contract_digest !== input.contract_digest || value.adapter_contract_digest !== input.adapter_contract_digest || !value.task || typeof value.task !== 'object' || Array.isArray(value.task)) {
                    await error(connection, frame, 'provider-auth-ipc-launch-request-invalid', state.sequence++);
                    return;
                }
                let launch;
                try {
                    launch = await input.runtime.launch({ ref: input.auth_ref, network_id: frame.network_id, node_id: frame.node_id, provider_id: frame.provider_id, execution_id: frame.execution_id, attempt: frame.attempt, contract_digest: input.contract_digest, adapter_contract_digest: input.adapter_contract_digest, issued_at: now(), expires_at: input.auth_ref.expires_at });
                }
                catch {
                    await error(connection, frame, 'provider-auth-ipc-launch-failed', state.sequence++);
                    return;
                }
                if (launch.status === 'blocked') {
                    await error(connection, frame, launch.reason, state.sequence++);
                    return;
                }
                const handle = launch.handle;
                state.activeHandle = handle;
                handles.set(handle.handle_digest, handle);
                await connection.send(createProviderAuthIpcFrame({ correlation_id: input.correlation_id, sequence: state.sequence++, network_id: frame.network_id, node_id: frame.node_id, provider_runtime_id: handle.provider_runtime_id, provider_id: handle.provider_id, execution_id: handle.execution_id, attempt: handle.attempt, kind: 'launch-accepted', launch_handle_digest: handle.handle_digest, payload: { schema: LAUNCH_RESPONSE_SCHEMA, status: 'accepted', handle } }));
                try {
                    const result = await input.invoke({ task: value.task, handle });
                    const validation = validateProviderResult(result.provider_result);
                    if (validation.status === 'blocked' || validation.result.status !== result.status || validation.result.success !== result.success)
                        throw new Error('provider-auth-ipc-sidecar-provider-result-invalid');
                    await connection.send(createProviderAuthIpcFrame({ correlation_id: input.correlation_id, sequence: state.sequence++, network_id: handle.network_id, node_id: handle.node_id, provider_runtime_id: handle.provider_runtime_id, provider_id: handle.provider_id, execution_id: handle.execution_id, attempt: handle.attempt, kind: 'stdout', launch_handle_digest: handle.handle_digest, payload: result.stdout }));
                    await connection.send(createProviderAuthIpcFrame({ correlation_id: input.correlation_id, sequence: state.sequence++, network_id: handle.network_id, node_id: handle.node_id, provider_runtime_id: handle.provider_runtime_id, provider_id: handle.provider_id, execution_id: handle.execution_id, attempt: handle.attempt, kind: 'stderr', launch_handle_digest: handle.handle_digest, payload: result.stderr }));
                    await connection.send(createProviderAuthIpcFrame({ correlation_id: input.correlation_id, sequence: state.sequence++, network_id: handle.network_id, node_id: handle.node_id, provider_runtime_id: handle.provider_runtime_id, provider_id: handle.provider_id, execution_id: handle.execution_id, attempt: handle.attempt, kind: 'result', launch_handle_digest: handle.handle_digest, payload: { schema: RESULT_SCHEMA, status: result.status, success: result.success, pid: result.pid, exit_code: result.exit_code, signal: result.signal, provider_result: validation.result } }));
                }
                catch {
                    await error(connection, frame, 'provider-auth-ipc-sidecar-invocation-failed', state.sequence++, handle.handle_digest);
                }
            }
            else if (frame.kind === 'cleanup' && frame.launch_handle_digest && DIGEST.test(frame.launch_handle_digest)) {
                const handle = handles.get(frame.launch_handle_digest);
                if (!handle || handle.handle_digest !== frame.launch_handle_digest) {
                    await error(connection, frame, 'provider-auth-ipc-cleanup-handle-mismatch', 1, frame.launch_handle_digest);
                    return;
                }
                let cleanup;
                try {
                    cleanup = await input.runtime.cleanup({ handle, network_id: frame.network_id, node_id: frame.node_id, provider_id: frame.provider_id, execution_id: frame.execution_id, attempt: frame.attempt, cleaned_at: now() });
                }
                catch {
                    await error(connection, frame, 'provider-auth-ipc-cleanup-failed', 1, handle.handle_digest);
                    return;
                }
                if (cleanup.status === 'blocked') {
                    await error(connection, frame, cleanup.reason, 1, handle.handle_digest);
                    return;
                }
                await connection.send(createProviderAuthIpcFrame({ correlation_id: input.correlation_id, sequence: 1, network_id: handle.network_id, node_id: handle.node_id, provider_runtime_id: handle.provider_runtime_id, provider_id: handle.provider_id, execution_id: handle.execution_id, attempt: handle.attempt, kind: 'cleanup', launch_handle_digest: handle.handle_digest, payload: { schema: CLEANUP_RESPONSE_SCHEMA, status: 'cleaned', cleanup_digest: cleanup.proof.cleanup_digest } }));
                state.activeHandle = undefined;
                handles.delete(handle.handle_digest);
            }
        } });
    return server;
}
