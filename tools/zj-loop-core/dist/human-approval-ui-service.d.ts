import { opnWebUiServiceLabel, type OpnEndpointServiceSpec } from './opn-endpoint-service.js';
export type HumanApprovalUiServiceSpec = OpnEndpointServiceSpec;
export { opnWebUiServiceLabel };
export declare function installHumanApprovalUiService(spec: HumanApprovalUiServiceSpec, platform?: NodeJS.Platform): Promise<{
    platform: "darwin" | "win32";
    path?: string;
    command?: string[];
}>;
export declare function uninstallHumanApprovalUiService(label: string, platform?: NodeJS.Platform): Promise<{
    platform: "darwin" | "win32";
    path?: string;
    command?: string[];
}>;
