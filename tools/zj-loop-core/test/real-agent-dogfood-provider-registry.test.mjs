import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRealAgentDogfoodProvider } from '../dist/real-agent-dogfood-provider-registry.js';

test('registry creates the registered codex provider without a fake fallback', async () => {
  const calls = [];
  const provider = createRealAgentDogfoodProvider({
    provider_id: 'codex',
    executable: '/opt/codex/bin/codex',
    process_adapter: {
      async launch(spec) {
        calls.push(spec);
        return {
          pid: 7,
          stdin: { end(value) { calls.push({ stdin: value }); } },
          cancel() {},
          async wait() {
            return { schema: 'zj-loop.local_process_adapter.v1', status: 'completed', success: true, pid: 7, exit_code: 0, signal: null, stdout: 'done', stderr: '' };
          },
        };
      },
    },
  });

  const result = await provider.run({
    cwd: '/tmp/worktree',
    prompt: 'run the atom',
    executable: '/opt/codex/bin/codex',
  });

  assert.equal(result.provider, 'codex');
  assert.equal(result.status, 'completed');
  assert.equal(calls[0].executable, '/opt/codex/bin/codex');
  assert.deepEqual(calls[1], { stdin: 'run the atom' });
});

test('registry rejects an unregistered provider before constructing a runner', () => {
  assert.throws(() => createRealAgentDogfoodProvider({ provider_id: 'unknown', executable: '/bin/false', process_adapter: { launch() { throw new Error('must-not-launch'); } } }), { message: 'provider-not-registered' });
});

test('registry preserves a trusted post-run proof factory as provider capability', () => {
  const factory = async () => ({ status: 'signed' });
  const provider = createRealAgentDogfoodProvider({ provider_id: 'codex', executable: '/opt/codex/bin/codex', process_adapter: { launch() { throw new Error('must-not-launch'); } }, post_run_proof_factory: factory });
  assert.equal(provider.post_run_proof_factory, factory);
});
