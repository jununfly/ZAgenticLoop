import type { OpnEndpointRuntimeConfig } from './opn-endpoint-supervisor.js';
export declare const OPN_ENDPOINT_CONFIG_SCHEMA: "zj-loop.opn_endpoint_config.v1";
export declare const OPN_ENDPOINT_CONFIG_FILE: "opn-endpoint.json";
export type OpnEndpointConfigFile = OpnEndpointRuntimeConfig & {
    schema: typeof OPN_ENDPOINT_CONFIG_SCHEMA;
};
export declare function opnEndpointIdentityDir(input?: string): string;
export declare function opnEndpointConfigPath(identity_dir: string): string;
export declare function validateOpnEndpointConfig(value: unknown, identity_dir: string): OpnEndpointRuntimeConfig;
export declare function loadOpnEndpointConfig(identity_dir?: string): Promise<OpnEndpointRuntimeConfig>;
export declare function writeOpnEndpointConfig(identity_dir: string, config: OpnEndpointRuntimeConfig): Promise<string>;
