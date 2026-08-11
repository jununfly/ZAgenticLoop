import { installOpnEndpointService, uninstallOpnEndpointService, type OpnEndpointServiceSpec } from './opn-endpoint-service.js';

export type OpnAgentWorkerServiceSpec = OpnEndpointServiceSpec;

export function opnAgentWorkerServiceLabel(network_id: string, node_id: string): string {
  const network = network_id.trim();
  const node = node_id.trim().slice(0, 16);
  if (!network || !node) throw new Error('opn-agent-worker-service-identity-required');
  return `ZAgenticLoop-OPN-Agent-${network}-${node}`;
}

export async function installOpnAgentWorkerService(spec: OpnAgentWorkerServiceSpec, platform: NodeJS.Platform = process.platform) {
  return installOpnEndpointService(spec, platform);
}

export async function uninstallOpnAgentWorkerService(label: string, platform: NodeJS.Platform = process.platform) {
  return uninstallOpnEndpointService(label, platform);
}
