import { type OpnEndpointServiceSpec } from './opn-endpoint-service.js';
export type OpnAgentWorkerServiceSpec = OpnEndpointServiceSpec;
export declare function opnAgentWorkerServiceLabel(network_id: string, node_id: string): string;
export declare function installOpnAgentWorkerService(spec: OpnAgentWorkerServiceSpec, platform?: NodeJS.Platform): Promise<{
    platform: "darwin" | "win32";
    path?: string;
    command?: string[];
}>;
export declare function uninstallOpnAgentWorkerService(label: string, platform?: NodeJS.Platform): Promise<{
    platform: "darwin" | "win32";
    path?: string;
    command?: string[];
}>;
