import type { LocalProcessAdapter } from './local-process-adapter.js';
import { createCodexAgentProviderAdapter, type CodexAgentRunResult, type CodexExecutionMode } from './codex-agent-provider-adapter.js';
import type { RealAgentDogfoodPostRunProofFactory } from './real-agent-dogfood-post-run-proof.js';

export const REAL_AGENT_DOGFOOD_PROVIDER_REGISTRY_SCHEMA = 'zj-loop.real_agent_dogfood_provider_registry.v1' as const;

export type RealAgentDogfoodProvider = {
  provider_id: 'codex';
  adapter_version: 'codex-agent-provider.v1';
  run(input: { cwd: string; prompt: string; executable: string; mode?: CodexExecutionMode }): Promise<CodexAgentRunResult>;
  post_run_proof_factory?: RealAgentDogfoodPostRunProofFactory;
};

export function createRealAgentDogfoodProvider(input: { provider_id: string; executable: string; process_adapter: Pick<LocalProcessAdapter, 'launch'>; post_run_proof_factory?: RealAgentDogfoodPostRunProofFactory }): RealAgentDogfoodProvider {
  if (input.provider_id !== 'codex') throw new Error('provider-not-registered');
  if (input.executable !== input.executable.trim() || input.executable.includes('\0')) throw new Error('provider-executable-invalid');
  const adapter = createCodexAgentProviderAdapter({ process_adapter: input.process_adapter, executable: input.executable });
  return {
    provider_id: 'codex',
    adapter_version: 'codex-agent-provider.v1',
    post_run_proof_factory: input.post_run_proof_factory,
    async run(request) {
      if (request.executable !== input.executable) throw new Error('provider-executable-binding-mismatch');
      return adapter.run({
        cwd: request.cwd,
        prompt: request.prompt,
        mode: request.mode,
        env_allowlist: [],
        env: {},
        timeout_ms: 15 * 60 * 1000,
        termination_grace_ms: 5_000,
        max_stdout_bytes: 10 * 1024 * 1024,
        max_stderr_bytes: 10 * 1024 * 1024,
      });
    },
  };
}
