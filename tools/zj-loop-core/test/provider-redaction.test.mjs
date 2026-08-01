import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRedactionPolicy, redactProviderOutput } from '../dist/provider-redaction.js';

test('redaction policy deterministically redacts ordinary output and never exposes configured literals', () => {
  const policy = createRedactionPolicy({ policy_version: 'redaction-policy.v1', literals: ['top-secret-token'], patterns: [] });
  const result = redactProviderOutput({
    policy,
    stdout: 'Authorization: Bearer abc.def.ghi top-secret-token',
    stderr: '',
    final_message: 'The token is top-secret-token',
    task_result: { schema: 'zj-loop.agent_task_result.v1', status: 'completed', summary: 'top-secret-token found', claims: ['safe claim'], file_refs: [{ repository: 'repo-1', commit: 'a'.repeat(40), path: 'README.md', start_line: 1, end_line: 1, content_sha256: `sha256:${'b'.repeat(64)}` }], evidence_refs: [] },
  });
  assert.equal(result.status, 'redacted');
  assert.equal(result.stdout.includes('top-secret-token'), false);
  assert.equal(result.final_message.includes('top-secret-token'), false);
  assert.equal('literals' in result.policy, false);
  assert.equal(result.policy.match_count, 3);
  assert.equal(result.task_result.summary.includes('top-secret-token'), false);
});

test('redaction policy blocks when a machine-critical result field contains a secret', () => {
  const policy = createRedactionPolicy({ policy_version: 'redaction-policy.v1', literals: ['secret-claim'], patterns: [] });
  const result = redactProviderOutput({
    policy,
    stdout: 'safe',
    stderr: '',
    final_message: 'safe',
    task_result: { schema: 'zj-loop.agent_task_result.v1', status: 'completed', summary: 'safe', claims: ['secret-claim'], file_refs: [{ repository: 'repo-1', commit: 'a'.repeat(40), path: 'README.md', start_line: 1, end_line: 1, content_sha256: `sha256:${'b'.repeat(64)}` }], evidence_refs: [] },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'critical-field-redaction');
  assert.equal('stdout' in result, false);
  assert.equal('task_result' in result, false);
});
