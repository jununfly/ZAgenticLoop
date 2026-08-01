import type { LocalProcessAdapter } from './local-process-adapter.js';
import { type CodexAgentRunResult } from './codex-agent-provider-adapter.js';
export declare const REAL_AGENT_DOGFOOD_PROVIDER_REGISTRY_SCHEMA: "zj-loop.real_agent_dogfood_provider_registry.v1";
export type RealAgentDogfoodProvider = {
    provider_id: 'codex';
    adapter_version: 'codex-agent-provider.v1';
    run(input: {
        cwd: string;
        prompt: string;
        executable: string;
    }): Promise<CodexAgentRunResult>;
};
export declare function createRealAgentDogfoodProvider(input: {
    provider_id: string;
    executable: string;
    process_adapter: Pick<LocalProcessAdapter, 'launch'>;
}): RealAgentDogfoodProvider;
