import { type OpnEndpointServiceSpec } from './opn-endpoint-service.js';
export type OpnNodeUiServiceSpec = OpnEndpointServiceSpec;
export declare function opnNodeUiServiceLabel(network_id: string, node_id: string): string;
export declare function installOpnNodeUiService(spec: OpnNodeUiServiceSpec, platform?: NodeJS.Platform): Promise<{
    platform: "darwin" | "win32";
    path?: string;
    command?: string[];
}>;
export declare function uninstallOpnNodeUiService(label: string, platform?: NodeJS.Platform): Promise<{
    platform: "darwin" | "win32";
    path?: string;
    command?: string[];
}>;
