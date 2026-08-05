import { randomUUID } from 'node:crypto';
import { connectUnixFramedJson, createUnixFramedJsonServer } from './framed-json-unix.js';
import { createProviderAuthAuthorityIpcFrame, createProviderAuthAuthorityRevokeRequest, createProviderAuthAuthorityRevokeResponse, validateProviderAuthAuthorityIpcFrame } from './provider-auth-authority-ipc-protocol.js';
const CHALLENGE_SCHEMA = 'zj-loop.provider_auth_authority_challenge.v1';
const ERROR_SCHEMA = 'zj-loop.provider_auth_authority_error.v1';
export async function revokeProviderAuthRefOverIpc(input) {
    const correlation_id = input.correlation_id ?? `authority-${randomUUID()}`;
    let connection;
    let resolveResponse = () => undefined;
    const response = new Promise((resolve) => { resolveResponse = resolve; });
    try {
        connection = await connectUnixFramedJson({ socket_path: input.socket_path, correlation_id, timeout_ms: input.timeout_ms, validate: validateProviderAuthAuthorityIpcFrame, on_frames: (frames) => {
                const frame = frames.find((candidate) => candidate.kind === 'revoke-response' || candidate.kind === 'error');
                if (!frame)
                    return;
                if (frame.kind === 'error') {
                    const errorPayload = frame.payload;
                    const reason = typeof errorPayload?.reason === 'string' ? errorPayload.reason : 'provider-auth-authority-error';
                    resolveResponse({ status: 'blocked', reason });
                    return;
                }
                const payload = frame.payload;
                const request = createProviderAuthAuthorityRevokeRequest({ request_id: input.request_id, network_id: input.network_id, runtime_id: input.runtime_id, runtime_binding: input.runtime_binding, auth_ref_id: input.auth_ref_id, auth_ref_digest: input.auth_ref_digest, authority_contract_digest: input.authority_contract_digest, revoke_reason: input.revoke_reason });
                if (payload.request_id !== request.request_id || payload.network_id !== request.network_id || payload.runtime_id !== request.runtime_id || payload.request_digest !== request.request_digest) {
                    resolveResponse({ status: 'outcome-uncertain', reason: 'provider-auth-authority-response-binding-mismatch' });
                    return;
                }
                resolveResponse(payload);
            } });
        const nonce = randomUUID();
        await connection.send(createProviderAuthAuthorityIpcFrame({ correlation_id, sequence: 1, kind: 'challenge', nonce, payload: { schema: CHALLENGE_SCHEMA, nonce } }));
        const request = createProviderAuthAuthorityRevokeRequest({ request_id: input.request_id, network_id: input.network_id, runtime_id: input.runtime_id, runtime_binding: input.runtime_binding, auth_ref_id: input.auth_ref_id, auth_ref_digest: input.auth_ref_digest, authority_contract_digest: input.authority_contract_digest, revoke_reason: input.revoke_reason });
        await connection.send(createProviderAuthAuthorityIpcFrame({ correlation_id, sequence: 2, kind: 'revoke-request', payload: request }));
        return await Promise.race([response, new Promise((resolve) => setTimeout(() => resolve({ status: 'outcome-uncertain', reason: 'provider-auth-authority-timeout' }), input.timeout_ms ?? 5_000))]);
    }
    catch {
        return { status: 'outcome-uncertain', reason: 'provider-auth-authority-ipc-unavailable' };
    }
    finally {
        connection?.close();
    }
}
export function createProviderAuthAuthorityIpcServer(input) {
    const states = new WeakMap();
    return createUnixFramedJsonServer({ socket_path: input.socket_path, correlation_id: input.correlation_id, verify_peer: input.verify_peer, validate: validateProviderAuthAuthorityIpcFrame, on_frames: async (frames, connection) => {
            const state = states.get(connection) ?? { challenged: false, nonce: '', responded: false };
            states.set(connection, state);
            for (const frame of frames) {
                if (state.responded) {
                    connection.close();
                    return;
                }
                if (frame.kind === 'challenge') {
                    if (state.challenged || !frame.nonce || typeof frame.payload?.schema !== 'string' || frame.payload.schema !== CHALLENGE_SCHEMA || frame.payload.nonce !== frame.nonce) {
                        connection.close();
                        return;
                    }
                    state.challenged = true;
                    state.nonce = frame.nonce;
                    continue;
                }
                if (frame.kind !== 'revoke-request' || !state.challenged) {
                    connection.close();
                    return;
                }
                const request = frame.payload;
                if (request.authority_contract_digest !== input.expected_authority_contract_digest) {
                    await connection.send(createProviderAuthAuthorityIpcFrame({ correlation_id: frame.correlation_id, sequence: 1, kind: 'error', payload: { schema: ERROR_SCHEMA, reason: 'provider-auth-authority-contract-mismatch' } }));
                    state.responded = true;
                    return;
                }
                const result = await input.handle_revoke(request);
                await connection.send(createProviderAuthAuthorityIpcFrame({ correlation_id: frame.correlation_id, sequence: 1, kind: 'revoke-response', payload: createProviderAuthAuthorityRevokeResponse(result) }));
                state.responded = true;
            }
        } });
}
