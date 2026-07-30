import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
export const DISPATCH_INTENT_SCHEMA = 'zj-loop.dispatch_intent.v1';
const KEYS = ['schema', 'protocol_version', 'intent_id', 'network_id', 'plan_id', 'plan_revision', 'plan_digest', 'task_id', 'node_id', 'assigned_node', 'grant_digest', 'claim_event_id', 'dispatch_event_id', 'authorized_by', 'issued_at', 'expires_at', 'session_ttl_ms', 'capabilities', 'resource_scope', 'intent_digest'];
function record(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function text(value) { return typeof value === 'string' && value.length > 0; }
function list(value) { return Array.isArray(value) && value.every(text); }
function issue(code, path, message) { return { code, path, message, blocking: true }; }
function digestValue(intent) { const { intent_digest: _, ...unsigned } = intent; const json = canonicalize(unsigned); if (typeof json !== 'string')
    throw new Error('dispatch-intent-canonicalization-invalid'); return `sha256:${createHash('sha256').update(json).digest('hex')}`; }
export function createDispatchIntent(input) {
    const value = { schema: DISPATCH_INTENT_SCHEMA, protocol_version: 'dispatch-intent.v1', ...input, capabilities: [...new Set(input.capabilities)].sort(), resource_scope: [...new Set(input.resource_scope)].sort(), intent_digest: 'sha256:' + '0'.repeat(64) };
    value.intent_digest = digestValue(value);
    const errors = validateDispatchIntent(value);
    if (errors.status === 'blocked' && errors.errors.some((error) => error.code === 'schema-unknown-field'))
        throw new Error('dispatch-intent-schema-invalid');
    if (errors.status === 'blocked')
        throw new Error('dispatch-intent-invalid');
    return value;
}
export function dispatchIntentDigest(intent) { return digestValue(intent); }
export function validateDispatchIntent(intent) {
    const errors = [];
    if (!record(intent) || Object.keys(intent).some((key) => !KEYS.includes(key)))
        return { status: 'blocked', errors: [issue('schema-unknown-field', '$', 'DispatchIntent schema is closed')], intent_digest: '' };
    for (const key of ['schema', 'protocol_version', 'intent_id', 'network_id', 'plan_id', 'plan_digest', 'task_id', 'node_id', 'assigned_node', 'grant_digest', 'claim_event_id', 'dispatch_event_id', 'authorized_by', 'issued_at', 'expires_at', 'intent_digest'])
        if (!text(intent[key]))
            errors.push(issue('schema-required-field-missing', `$.${key}`, `${key} is required`));
    if (intent.schema !== DISPATCH_INTENT_SCHEMA || intent.protocol_version !== 'dispatch-intent.v1')
        errors.push(issue('protocol-version-invalid', '$.protocol_version', 'unsupported DispatchIntent protocol'));
    if (!Number.isInteger(intent.plan_revision) || Number(intent.plan_revision) < 1)
        errors.push(issue('plan-revision-invalid', '$.plan_revision', 'plan revision must be positive'));
    if (!/^sha256:[0-9a-f]{64}$/.test(String(intent.plan_digest)) || !/^sha256:[0-9a-f]{64}$/.test(String(intent.grant_digest)) || !/^sha256:[0-9a-f]{64}$/.test(String(intent.intent_digest)))
        errors.push(issue('digest-invalid', '$', 'plan, grant, and intent digests must be sha256 digests'));
    if (!list(intent.capabilities) || !list(intent.resource_scope))
        errors.push(issue('scope-invalid', '$', 'capabilities and resource_scope must be string lists'));
    if (!Number.isInteger(intent.session_ttl_ms) || Number(intent.session_ttl_ms) < 1000 || Number(intent.session_ttl_ms) > 60 * 60 * 1000)
        errors.push(issue('session-ttl-invalid', '$.session_ttl_ms', 'session TTL must be between 1 second and 1 hour'));
    const issued = Date.parse(String(intent.issued_at));
    const expires = Date.parse(String(intent.expires_at));
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued >= expires || (Number.isFinite(issued) && Number.isFinite(expires) && expires - issued > Number(intent.session_ttl_ms)))
        errors.push(issue('intent-time-invalid', '$.expires_at', 'intent validity must be positive and within session TTL'));
    if (errors.length === 0 && intent.intent_digest !== digestValue(intent))
        errors.push(issue('intent-digest-invalid', '$.intent_digest', 'intent digest does not match canonical fields'));
    errors.sort((left, right) => `${left.path}:${left.code}`.localeCompare(`${right.path}:${right.code}`));
    return { status: errors.length === 0 ? 'valid' : 'blocked', errors, intent_digest: text(intent.intent_digest) ? intent.intent_digest : '' };
}
