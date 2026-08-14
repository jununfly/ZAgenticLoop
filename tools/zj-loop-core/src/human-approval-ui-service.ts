import { installOpnEndpointService, opnWebUiServiceLabel, uninstallOpnEndpointService, type OpnEndpointServiceSpec } from './opn-endpoint-service.js';

export type HumanApprovalUiServiceSpec = OpnEndpointServiceSpec;

export { opnWebUiServiceLabel };

export async function installHumanApprovalUiService(spec: HumanApprovalUiServiceSpec, platform: NodeJS.Platform = process.platform) {
  return installOpnEndpointService({ ...spec, log_name: spec.log_name ?? 'human-approval-ui.log' }, platform);
}

export async function uninstallHumanApprovalUiService(label: string, platform: NodeJS.Platform = process.platform) {
  return uninstallOpnEndpointService(label, platform);
}
