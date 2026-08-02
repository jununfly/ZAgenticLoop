import { randomUUID } from 'node:crypto';
import { connectUnixProviderAuthIpc } from './provider-auth-ipc-unix.js';
import { createProviderAuthIpcFrame } from './provider-auth-ipc-protocol.js';
import { validateProviderLaunchHandle } from './provider-auth-runtime.js';
const CLEANUP_REQUEST_SCHEMA = 'zj-loop.provider_cleanup_request.v1';
const CLEANUP_RESPONSE_SCHEMA = 'zj-loop.provider_cleanup_response.v1';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export function createProviderRuntimeIpcCleanupCoordinator(input) {
    return async () => {
        const handle = validateProviderLaunchHandle(input.handle);
        if (handle.status === 'blocked')
            return { status: 'uncertain', reason: handle.reason };
        if (handle.handle.network_id !== input.network_id || handle.handle.node_id !== input.node_id || handle.handle.provider_id !== input.provider_id || handle.handle.execution_id !== input.execution_id || handle.handle.attempt !== input.attempt)
            return { status: 'uncertain', reason: 'provider-runtime-cleanup-binding-mismatch' };
        const timeout = input.timeout_ms ?? 5_000;
        if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60_000)
            return { status: 'uncertain', reason: 'provider-runtime-cleanup-timeout-invalid' };
        const correlation_id = input.correlation_id ?? `cleanup-${randomUUID()}`;
        let connection;
        let timer;
        try {
            let resolveResponse = () => undefined;
            let rejectResponse = () => undefined;
            const response = new Promise((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject; });
            connection = await connectUnixProviderAuthIpc({ socket_path: input.socket_path, correlation_id, timeout_ms: timeout, on_frames: (frames) => {
                    const frame = frames.find((candidate) => candidate.kind === 'cleanup');
                    if (frame)
                        resolveResponse(frame);
                } });
            timer = setTimeout(() => rejectResponse(new Error('provider-runtime-cleanup-timeout')), timeout);
            await connection.send(createProviderRuntimeCleanupRequest({ correlation_id, handle: handle.handle, network_id: input.network_id, node_id: input.node_id, provider_id: input.provider_id, execution_id: input.execution_id, attempt: input.attempt, cleaned_at: input.cleaned_at ?? new Date().toISOString() }));
            const frame = await response;
            if (frame.network_id !== input.network_id || frame.node_id !== input.node_id || frame.provider_id !== input.provider_id || frame.execution_id !== input.execution_id || frame.attempt !== input.attempt || frame.launch_handle_digest !== handle.handle.handle_digest)
                return { status: 'uncertain', reason: 'provider-runtime-cleanup-response-binding-mismatch' };
            if (!frame.payload || typeof frame.payload !== 'object' || Array.isArray(frame.payload))
                return { status: 'uncertain', reason: 'provider-runtime-cleanup-response-invalid' };
            const payload = frame.payload;
            if (payload.schema !== CLEANUP_RESPONSE_SCHEMA)
                return { status: 'uncertain', reason: 'provider-runtime-cleanup-response-invalid' };
            if (payload.status !== 'cleaned' || typeof payload.cleanup_digest !== 'string' || !DIGEST.test(payload.cleanup_digest))
                return { status: 'uncertain', reason: typeof payload.reason === 'string' && payload.reason.trim() ? payload.reason : 'provider-runtime-cleanup-not-proven' };
            return { status: 'cleaned', proof_digest: payload.cleanup_digest };
        }
        catch (error) {
            return { status: 'uncertain', reason: error instanceof Error && error.message === 'provider-runtime-cleanup-timeout' ? 'provider-runtime-cleanup-timeout' : 'provider-runtime-cleanup-ipc-unavailable' };
        }
        finally {
            if (timer)
                clearTimeout(timer);
            connection?.close();
        }
    };
}
export function createProviderRuntimeCleanupRequest(input) {
    return createProviderAuthIpcFrame({
        correlation_id: input.correlation_id,
        sequence: input.sequence ?? 1,
        network_id: input.network_id,
        node_id: input.node_id,
        provider_runtime_id: input.handle.provider_runtime_id,
        provider_id: input.provider_id,
        execution_id: input.execution_id,
        attempt: input.attempt,
        kind: 'cleanup',
        launch_handle_digest: input.handle.handle_digest,
        payload: { schema: CLEANUP_REQUEST_SCHEMA, handle_id: input.handle.handle_id, cleaned_at: input.cleaned_at },
    });
}
