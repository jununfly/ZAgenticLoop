import { createHash } from 'node:crypto';
export const COMPLETION_EVIDENCE_COMPATIBILITY_SCHEMA = 'zj-loop.completion_evidence_compatibility.v1';
export const COMPLETION_EVIDENCE_COMPATIBILITY_DIMENSIONS = [
    'target_digest',
    'route_table_digest',
    'route_digest',
    'adapter_digest',
    'runner_digest',
    'workflow_digest',
    'protocol_digest',
    'verification_digest',
];
export function buildCompletionEvidenceCompatibility(input) {
    const dimensions = Object.fromEntries(COMPLETION_EVIDENCE_COMPATIBILITY_DIMENSIONS.map((dimension) => [dimension, required(input[dimension], dimension)]));
    const base = {
        schema: COMPLETION_EVIDENCE_COMPATIBILITY_SCHEMA,
        target_id: required(input.targetId, 'target_id'),
        route_id: required(input.routeId, 'route_id'),
        adapter_id: required(input.adapterId, 'adapter_id'),
        dimensions,
    };
    return { ...base, fingerprint: digest(stableStringify(base)) };
}
export function deriveCompletionEvidenceFreshness(recorded, current) {
    if (!recorded)
        return freshness('missing', 'missing-fingerprint', []);
    const recordedValid = isValidFingerprint(recorded);
    if (!recordedValid)
        return freshness('stale', 'invalid-fingerprint', []);
    const changedDimensions = COMPLETION_EVIDENCE_COMPATIBILITY_DIMENSIONS.filter((dimension) => recorded.dimensions[dimension] !== current.dimensions[dimension]);
    const identityChanged = recorded.target_id !== current.target_id
        || recorded.route_id !== current.route_id
        || recorded.adapter_id !== current.adapter_id;
    if (identityChanged || changedDimensions.length > 0 || recorded.fingerprint !== current.fingerprint) {
        return freshness('stale', 'relevant-change', changedDimensions);
    }
    return freshness('compatible', 'compatible', []);
}
function freshness(status, reason, changedDimensions) {
    return {
        schema: 'zj-loop.completion_evidence_freshness.v1',
        status,
        reason,
        changed_dimensions: changedDimensions,
        side_effects_executed: false,
    };
}
function isValidFingerprint(value) {
    if (value.schema !== COMPLETION_EVIDENCE_COMPATIBILITY_SCHEMA)
        return false;
    if (!value.target_id || !value.route_id || !value.adapter_id || !value.fingerprint)
        return false;
    const expected = digest(stableStringify({
        schema: value.schema,
        target_id: value.target_id,
        route_id: value.route_id,
        adapter_id: value.adapter_id,
        dimensions: value.dimensions,
    }));
    return expected === value.fingerprint
        && COMPLETION_EVIDENCE_COMPATIBILITY_DIMENSIONS.every((dimension) => typeof value.dimensions?.[dimension] === 'string' && value.dimensions[dimension].length > 0);
}
function required(value, name) {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new Error(`${name} is required`);
    return value;
}
function digest(value) {
    return createHash('sha256').update(value).digest('hex');
}
function stableStringify(value) {
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(',')}]`;
    if (!value || typeof value !== 'object')
        return JSON.stringify(value);
    return `{${Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}
