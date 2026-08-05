import type { ProviderAuthAuthorityStartConfig } from './provider-auth-authority-start-config.js';
import { type ProviderAuthAuthorityStartAssembly } from './provider-auth-authority-start-assembly.js';
export type ProviderAuthAuthorityChild = {
    config: ProviderAuthAuthorityStartConfig;
    assembly: ProviderAuthAuthorityStartAssembly;
    binding: Awaited<ReturnType<ProviderAuthAuthorityStartAssembly['service']['start']>>['binding'];
    shutdown(): Promise<{
        status: 'stopped';
    } | {
        status: 'outcome-uncertain';
        reason: string;
    }>;
};
export declare function startProviderAuthAuthorityChild(input: {
    config_path: string;
    create_peer_gate?: (config: ProviderAuthAuthorityStartConfig) => (socket: import('node:net').Socket) => Promise<boolean> | boolean;
    process_id?: number;
    now?: () => string;
}): Promise<ProviderAuthAuthorityChild>;
export declare function main(argv?: string[]): Promise<number>;
