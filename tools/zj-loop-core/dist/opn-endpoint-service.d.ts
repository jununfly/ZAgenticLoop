export type OpnEndpointServiceSpec = {
    label: string;
    executable: string;
    script: string;
    args: string[];
    runtime_dir: string;
    working_directory: string;
};
export declare function createMacOsLaunchdPlist(spec: OpnEndpointServiceSpec): string;
export declare function createWindowsTaskSchedulerCommand(spec: OpnEndpointServiceSpec): {
    create: string[];
    run: string[];
    stop: string[];
    delete: string[];
};
export declare function opnEndpointServiceLabel(network_id: string): string;
export declare function installOpnEndpointService(spec: OpnEndpointServiceSpec, platform?: NodeJS.Platform): Promise<{
    platform: 'darwin' | 'win32';
    path?: string;
    command?: string[];
}>;
export declare function uninstallOpnEndpointService(label: string, platform?: NodeJS.Platform): Promise<{
    platform: 'darwin' | 'win32';
    path?: string;
    command?: string[];
}>;
