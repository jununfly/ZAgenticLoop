import { createSqliteStateStore } from './sqlite-state-store.js';
import { createProviderAuthAuthorityIpcServer } from './provider-auth-authority-ipc.js';
import { createProviderAuthStateStoreRevocationAuthority } from './provider-auth-revocation-authority.js';
import { createProviderAuthAuthorityForegroundService } from './provider-auth-authority-foreground-service.js';
import { validateProviderAuthAuthorityStartConfig } from './provider-auth-authority-start-config.js';
export function createProviderAuthAuthorityStartAssembly(input) {
    const stateStore = createSqliteStateStore({ filename: input.state_store_path });
    const authority = createProviderAuthStateStoreRevocationAuthority({ state_store: stateStore, network_id: input.network_id, authority_identity_digest: input.authority_identity_digest, max_revision_retries: input.max_revision_retries, now: input.now });
    const server = createProviderAuthAuthorityIpcServer({ socket_path: input.socket_path, correlation_id: input.correlation_id, expected_authority_contract_digest: input.authority_contract_digest, verify_peer: input.verify_peer, handle_revoke: (request) => authority.revoke(request) });
    const launcher = {
        async start() { await server.start(); },
        async readiness() { return { status: 'ready', socket_path: input.socket_path }; },
        async close() { await server.close(); },
    };
    const service = createProviderAuthAuthorityForegroundService({ launcher, binding_path: input.binding_path, process_id: input.process_id, now: input.now, binding: { service_id: `provider-auth-authority:${input.network_id}`, network_id: input.network_id, socket_path: input.socket_path, authority_contract_digest: input.authority_contract_digest, state_store_identity_digest: input.state_store_identity_digest, state_store_path: input.state_store_path, process_identity_digest: input.process_identity_digest } });
    return { service, state_store: stateStore, async close() { await stateStore.close(); } };
}
export function createProviderAuthAuthorityStartAssemblyFromConfig(input) {
    const checked = validateProviderAuthAuthorityStartConfig(input.config);
    if (checked.status === 'blocked')
        throw new Error(checked.reason);
    const config = checked.config;
    return createProviderAuthAuthorityStartAssembly({ ...config, verify_peer: input.verify_peer, process_id: input.process_id, now: input.now, max_revision_retries: input.max_revision_retries });
}
