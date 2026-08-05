export const PROVIDER_AUTH_AUTHORITY_START_CONFIG_SCHEMA = 'zj-loop.provider_auth_authority_start_config.v1' as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PEER_DIGEST = /^[0-9a-f]{64}$/;
const KEYS = new Set(['schema', 'network_id', 'socket_path', 'correlation_id', 'expected_peer_identity_digest', 'authority_contract_digest', 'authority_identity_digest', 'state_store_identity_digest', 'state_store_path', 'binding_path', 'process_identity_digest', 'macos_helper_path', 'macos_helper_digest']);
const SECRET_KEYS = new Set(['secret', 'token', 'password', 'private_key', 'auth_ref', 'credential']);

export type ProviderAuthAuthorityStartConfig = {
  schema: typeof PROVIDER_AUTH_AUTHORITY_START_CONFIG_SCHEMA;
  network_id: string;
  socket_path: string;
  correlation_id: string;
  expected_peer_identity_digest: string;
  authority_contract_digest: string;
  authority_identity_digest: string;
  state_store_identity_digest: string;
  state_store_path: string;
  binding_path: string;
  process_identity_digest: string;
  macos_helper_path?: string;
  macos_helper_digest?: string;
};

function text(value: unknown): value is string { return typeof value === 'string' && value.trim() !== '' && !value.includes('\0'); }
function absolute(value: unknown): value is string { return text(value) && value.startsWith('/'); }

export function validateProviderAuthAuthorityStartConfig(value: unknown): { status: 'valid'; config: ProviderAuthAuthorityStartConfig } | { status: 'blocked'; reason: 'provider-auth-authority-start-config-invalid' | 'provider-auth-authority-start-config-secret-field' } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'blocked', reason: 'provider-auth-authority-start-config-invalid' };
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some((key) => SECRET_KEYS.has(key))) return { status: 'blocked', reason: 'provider-auth-authority-start-config-secret-field' };
  if (Object.keys(item).some((key) => !KEYS.has(key)) || item.schema !== PROVIDER_AUTH_AUTHORITY_START_CONFIG_SCHEMA || !text(item.network_id) || !absolute(item.socket_path) || !text(item.correlation_id) || !PEER_DIGEST.test(String(item.expected_peer_identity_digest)) || !DIGEST.test(String(item.authority_contract_digest)) || !DIGEST.test(String(item.authority_identity_digest)) || !DIGEST.test(String(item.state_store_identity_digest)) || !absolute(item.state_store_path) || !absolute(item.binding_path) || !DIGEST.test(String(item.process_identity_digest)) || (item.macos_helper_path !== undefined && !absolute(item.macos_helper_path)) || (item.macos_helper_digest !== undefined && !DIGEST.test(String(item.macos_helper_digest))) || (item.macos_helper_path !== undefined) !== (item.macos_helper_digest !== undefined)) return { status: 'blocked', reason: 'provider-auth-authority-start-config-invalid' };
  return { status: 'valid', config: structuredClone(item) as ProviderAuthAuthorityStartConfig };
}
