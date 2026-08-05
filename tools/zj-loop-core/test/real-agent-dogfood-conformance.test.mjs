import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateRealAgentDogfoodConformanceEvidence } from '../dist/real-agent-dogfood-conformance.js';

const digest = (letter) => `sha256:${letter.repeat(64)}`;

test('conformance evidence binds the fixed test command, commit, plan and failure matrix', async () => {
  let stored;
  const result = await generateRealAgentDogfoodConformanceEvidence({
    repo_root: '/repo',
    plan_digest: digest('a'),
    git_head: async () => 'b'.repeat(40),
    run: async (cwd, command) => { assert.equal(cwd, '/repo/tools/zj-loop-core'); assert.deepEqual(command, ['npm', 'test']); return { exit_code: 0, stdout: '432 passed', stderr: '' }; },
    evidenceStore: { put: async (input) => { stored = input; return { digest: digest('c'), size: input.content.length, path: '/evidence/c', kind: input.kind }; } },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.evidence.side_effects_executed, false);
  assert.equal(result.evidence.plan_digest, digest('a'));
  assert.equal(result.evidence.core_commit, 'b'.repeat(40));
  assert.equal(result.evidence.test_command[0], 'npm');
  assert.equal(stored.kind, 'real-agent-dogfood-conformance');
});

test('failed deterministic tests are retained as blocked conformance evidence', async () => {
  const result = await generateRealAgentDogfoodConformanceEvidence({
    repo_root: '/repo', plan_digest: digest('a'), git_head: async () => 'b'.repeat(40),
    run: async () => ({ exit_code: 1, stdout: 'failure', stderr: 'blocked' }),
    evidenceStore: { put: async () => ({ digest: digest('d'), size: 1, path: '/evidence/d', kind: 'real-agent-dogfood-conformance' }) },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.evidence.exit_code, 1);
});
