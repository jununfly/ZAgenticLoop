export declare const PROVIDER_EXECUTABLE_DISCOVERY_SCHEMA: "zj-loop.provider_executable_discovery.v1";
export type ProviderExecutableKind = 'codex' | 'workbuddy-code';
export type ProviderExecutableDiscovery = {
    schema: typeof PROVIDER_EXECUTABLE_DISCOVERY_SCHEMA;
    status: 'found' | 'unavailable';
    provider: ProviderExecutableKind;
    executable?: string;
    source?: 'explicit' | 'path' | 'known-install' | 'bounded-scan';
    checked_paths: string[];
    reason?: 'provider-executable-not-found';
};
type DiscoveryInput = {
    provider: ProviderExecutableKind;
    explicit?: string;
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    path_exists?: (candidate: string) => Promise<boolean>;
    scan_directory?: (root: string, names: Set<string>, max_depth: number) => Promise<string | undefined>;
};
export declare function discoverProviderExecutable(input: DiscoveryInput): Promise<ProviderExecutableDiscovery>;
export {};
