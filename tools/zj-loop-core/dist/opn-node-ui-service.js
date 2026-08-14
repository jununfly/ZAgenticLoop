import { installOpnEndpointService, uninstallOpnEndpointService } from './opn-endpoint-service.js';
export function opnNodeUiServiceLabel(network_id, node_id) {
    const network = network_id.trim();
    const node = node_id.trim().slice(0, 16);
    if (!network || !node)
        throw new Error('opn-node-ui-service-identity-required');
    return `ZAgenticLoop-OPN-NodeUI-${network}-${node}`;
}
export async function installOpnNodeUiService(spec, platform = process.platform) {
    return installOpnEndpointService({ ...spec, log_name: spec.log_name ?? 'opn-node-ui.log' }, platform);
}
export async function uninstallOpnNodeUiService(label, platform = process.platform) {
    return uninstallOpnEndpointService(label, platform);
}
