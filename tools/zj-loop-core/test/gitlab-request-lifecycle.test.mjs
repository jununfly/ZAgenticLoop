import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGitLabLifecycleAudit,
  buildGitLabLifecycleMarker,
  parseGitLabLifecycleMarker,
  validateGitLabRequestSourceBinding,
} from '../dist/index.js';

test('GitLab lifecycle audit keeps only low-cost fields', () => {
  assert.deepEqual(buildGitLabLifecycleAudit({
    projectPath: 'group/project',
    issueIid: 163,
    requestId: 'ifr_123',
    claimId: 'claim_123',
    consumerId: 'dependency-sweeper',
    token: 'secret-token',
  }), {
    project_path: 'group/project',
    issue_iid: 163,
    request_id: 'ifr_123',
    claim_id: 'claim_123',
    consumer_id: 'dependency-sweeper',
    auth_source: 'GITLAB_TOKEN',
  });
});

test('source binding rejects provider, project, request, and consumer mismatches', () => {
  const request = {
    request_id: 'ifr_123',
    source_signal: { provider: 'gitlab' },
    subject: { repo: 'group/project' },
    route_decision: { target_consumer: 'dependency-sweeper' },
  };

  assert.deepEqual(validateGitLabRequestSourceBinding({
    request,
    projectPath: 'group/project',
    requestId: 'ifr_123',
    consumerId: 'dependency-sweeper',
  }), { ok: true, reason: null });

  for (const [field, value, reason] of [
    ['provider', 'github', 'request-source-mismatch'],
    ['projectPath', 'other/project', 'request-source-mismatch'],
    ['requestId', 'ifr_other', 'request-source-mismatch'],
    ['consumerId', 'ci-sweeper', 'request-source-mismatch'],
  ]) {
    const input = { request, projectPath: 'group/project', requestId: 'ifr_123', consumerId: 'dependency-sweeper' };
    if (field === 'provider') input.request = { ...request, source_signal: { provider: value } };
    else input[field] = value;
    assert.deepEqual(validateGitLabRequestSourceBinding(input), { ok: false, reason }, field);
  }
});

test('lifecycle marker is deterministic and parser ignores unrelated notes', () => {
  const marker = buildGitLabLifecycleMarker('dependency-sweeper-claim', {
    schema: 'zj-loop.gitlab_dependency_sweeper_claim.v1',
    request_id: 'ifr_123',
    claim_id: 'claim_123',
  });
  assert.match(marker, /^<!-- zj-loop:dependency-sweeper-claim\n/);
  assert.deepEqual(parseGitLabLifecycleMarker({ body: marker }, 'dependency-sweeper-claim'), {
    schema: 'zj-loop.gitlab_dependency_sweeper_claim.v1',
    request_id: 'ifr_123',
    claim_id: 'claim_123',
  });
  assert.equal(parseGitLabLifecycleMarker({ body: 'ordinary note' }, 'dependency-sweeper-claim'), null);
  assert.equal(parseGitLabLifecycleMarker({ body: '<!-- zj-loop:dependency-sweeper-claim\nnot-json\n-->' }, 'dependency-sweeper-claim'), null);
});
