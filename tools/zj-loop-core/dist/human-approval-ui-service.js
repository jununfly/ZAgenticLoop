import { installOpnEndpointService, opnWebUiServiceLabel, uninstallOpnEndpointService } from './opn-endpoint-service.js';
export { opnWebUiServiceLabel };
export async function installHumanApprovalUiService(spec, platform = process.platform) {
    return installOpnEndpointService({ ...spec, log_name: spec.log_name ?? 'human-approval-ui.log' }, platform);
}
export async function uninstallHumanApprovalUiService(label, platform = process.platform) {
    return uninstallOpnEndpointService(label, platform);
}
