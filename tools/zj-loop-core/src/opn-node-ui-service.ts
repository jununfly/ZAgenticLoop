import { installOpnEndpointService, uninstallOpnEndpointService, type OpnEndpointServiceSpec } from './opn-endpoint-service.js';

export type OpnNodeUiServiceSpec = OpnEndpointServiceSpec;

export function opnNodeUiServiceLabel(network_id: string, node_id: string): string {
  const network = network_id.trim();
  const node = node_id.trim().slice(0, 16);
  if (!network || !node) throw new Error('opn-node-ui-service-identity-required');
  return `ZAgenticLoop-OPN-NodeUI-${network}-${node}`;
}

export async function installOpnNodeUiService(spec: OpnNodeUiServiceSpec, platform: NodeJS.Platform = process.platform) {
  return installOpnEndpointService({ ...spec, log_name: spec.log_name ?? 'opn-node-ui.log' }, platform);
}

export async function uninstallOpnNodeUiService(label: string, platform: NodeJS.Platform = process.platform) {
  return uninstallOpnEndpointService(label, platform);
}
