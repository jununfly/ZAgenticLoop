export const OPN_CONNECTION_READ_MODEL_SCHEMA = 'zj-loop.opn_connection_read_model.v1';
export function createOpnConnectionReadModel(input) {
    if (!input.network_id.trim())
        throw new Error('opn-connection-network-id-required');
    if (!input.local_node.node_id.trim())
        throw new Error('opn-connection-local-node-required');
    const peers = input.peers.map((peer) => ({
        request_id: peer.request_id,
        node_id: peer.node_id,
        status: peer.status,
        capabilities: [...(peer.approved_capabilities.length ? peer.approved_capabilities : peer.requested_capabilities)],
        endpoint: peer.endpoint ?? 'unknown',
        expires_at: peer.expires_at,
        next_action: peer.status === 'approved' ? 'ready-for-co-work' : peer.status === 'pending' ? 'human-approval-required' : peer.status === 'expired' ? 're-submit-pairing' : peer.status === 'rejected' ? 'request-rejected' : 'inspect-projection-conflict',
    }));
    const status = peers.some((peer) => peer.status === 'approved') ? 'connected' : peers.some((peer) => peer.status === 'pending') ? 'pending' : peers.some((peer) => peer.status === 'projection-conflict') ? 'blocked' : 'disconnected';
    return { schema: OPN_CONNECTION_READ_MODEL_SCHEMA, network_id: input.network_id, status, local_node: { ...input.local_node }, peers, side_effects_executed: false };
}
