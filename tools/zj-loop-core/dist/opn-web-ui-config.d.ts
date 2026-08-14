export declare const OPN_WEB_UI_CONFIG_SCHEMA: "zj-loop.opn_web_ui_config.v1";
export declare const OPN_WEB_UI_CONFIG_FILE: "opn-web-ui.json";
export type OpnWebUiConfig = {
    network_id: string;
    pairing_endpoint: string;
    owner_token_file: string;
    human_id: string;
    device_key_id: string;
    key_tag?: string;
    helper_path?: string;
    signer_key?: string;
    ca: string;
    client_cert: string;
    client_key: string;
    state_store: string;
    port: number;
    runtime_dir: string;
    graph_plan?: string;
    graph_evidence_store?: string;
    graph_plan_digest?: string;
};
export type OpnWebUiConfigFile = OpnWebUiConfig & {
    schema: typeof OPN_WEB_UI_CONFIG_SCHEMA;
};
export declare function opnWebUiIdentityDir(input?: string): string;
export declare function opnWebUiConfigPath(identity_dir: string): string;
export declare function validateOpnWebUiConfig(value: unknown, identity_dir: string): OpnWebUiConfig;
export declare function loadOpnWebUiConfig(identity_dir?: string): Promise<OpnWebUiConfig>;
export declare function writeOpnWebUiConfig(identity_dir: string, config: OpnWebUiConfig): Promise<string>;
