import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import {
  createProviderReviewPackage,
  providerReviewPackageDigest,
  validateProviderReviewPackage,
} from '../dist/provider-review-package.js';

const digest = (value) => 'sha256:' + value.repeat(64);
const contentDigest = (value) => 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex');

const input = {
  network_id: 'network-1',
  task_id: 'task-1',
  execution_id: 'execution-1',
  attempt: 1,
  task_summary: 'Review the repository read-only.',
  verification_conditions: ['working tree unchanged', 'report contains file refs'],
  verification_status: 'passed',
  policy_evidence: { policy_version: 'redaction-policy.v1', rule_ids: ['literal-1'], match_count: 1, secret_digests: [digest('f')], sandbox_policy_digest: digest('1'), network_policy_digest: digest('2') },
  file_refs: [{ repository: 'repo-1', commit: 'a'.repeat(40), path: 'README.md', start_line: 1, end_line: 2, content_sha256: digest('b') }],
  artifact_refs: [digest('c')],
  risks: ['provider output is untrusted'],
  unknowns: [],
  excerpts: [{
    source_artifact_digest: digest('d'),
    start_offset: 0,
    end_offset: 10,
    content: 'safe excerpt',
    excerpt_digest: contentDigest('safe excerpt'),
  }],
};

test('ProviderReviewPackage is a bounded canonical projection with a stable digest', () => {
  const item = createProviderReviewPackage(input);
  assert.equal(item.schema, 'zj-loop.provider_review_package.v1');
  assert.match(item.package_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(item.package_digest, providerReviewPackageDigest(item));
  assert.deepEqual(validateProviderReviewPackage(item), { status: 'valid', errors: [] });
});

test('ProviderReviewPackage binds excerpts to source and rejects drift or unknown fields', () => {
  const item = createProviderReviewPackage(input);
  assert.equal(validateProviderReviewPackage({ ...item, excerpts: [{ ...item.excerpts[0], end_offset: 11 }] }).status, 'blocked');
  assert.equal(validateProviderReviewPackage({ ...item, extra: 'unexpected' }).status, 'blocked');
  assert.throws(() => createProviderReviewPackage({ ...input, excerpts: [{ ...input.excerpts[0], excerpt_digest: digest('f') }] }), { message: 'provider-review-package-input-invalid' });
});
