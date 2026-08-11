import { installOpnEndpointService, uninstallOpnEndpointService } from './opn-endpoint-service.js';
export function opnAgentWorkerServiceLabel(network_id, node_id) {
    const network = network_id.trim();
    const node = node_id.trim().slice(0, 16);
    if (!network || !node)
        throw new Error('opn-agent-worker-service-identity-required');
    return `ZAgenticLoop-OPN-Agent-${network}-${node}`;
}
export async function installOpnAgentWorkerService(spec, platform = process.platform) {
    return installOpnEndpointService(spec, platform);
}
export async function uninstallOpnAgentWorkerService(label, platform = process.platform) {
    return uninstallOpnEndpointService(label, platform);
}
