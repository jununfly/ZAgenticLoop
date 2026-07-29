function conflict() {
    throw new Error('pairing-projection-conflict');
}
function clone(request, requestDigest) {
    return { request_id: request.request_id, network_id: request.network_id, node_id: request.node_id, request_digest: requestDigest, expires_at: request.expires_at, requested_capabilities: [...request.requested_capabilities], status: 'pending', human_id: null, approved_capabilities: [], reason: null };
}
export function projectPairingRequests(input) {
    const projections = new Map();
    const eventIds = new Set();
    for (const record of input.records) {
        if (!record.event_id || eventIds.has(record.event_id))
            conflict();
        eventIds.add(record.event_id);
        if (record.type === 'pairing-requested') {
            if (record.network_id !== input.network_id || record.request.network_id !== input.network_id || projections.has(record.request.request_id))
                conflict();
            const projection = clone(record.request, record.request_digest);
            projections.set(record.request.request_id, projection);
            continue;
        }
        const projection = projections.get(record.request_id);
        if (!projection || record.network_id !== input.network_id || projection.network_id !== input.network_id || projection.request_digest !== record.request_digest)
            continue;
        if (projection.status !== 'pending')
            conflict();
        if (Date.parse(record.occurred_at) > Date.parse(projection.expires_at))
            conflict();
        if (record.type === 'human-approved') {
            projection.status = 'approved';
            projection.human_id = record.human_id;
            projection.approved_capabilities = [...record.approved_capabilities];
        }
        else if (record.type === 'pairing-rejected') {
            projection.status = 'rejected';
            projection.reason = record.reason;
        }
        else if (record.type === 'pairing-expired') {
            projection.status = 'expired';
        }
    }
    const now = Date.parse(input.now ?? new Date().toISOString());
    if (!Number.isFinite(now))
        throw new Error('pairing-projection-time-invalid');
    for (const projection of projections.values())
        if (projection.status === 'pending' && now >= Date.parse(projection.expires_at))
            projection.status = 'expired';
    return [...projections.values()];
}
