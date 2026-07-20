import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/changelog-drafter-cli.js', import.meta.url));
const request = {
  schema: 'zj-loop.changelog_draft_request.v1', request_id: 'cdr-cli-1', status: 'draft-request-candidate', dedupe_key: 'cdr-cli-1', summary: 'fixture',
  release_window: { repo: 'group/project', base_branch: 'master', since_ref: 'v1', until_ref: 'v2', item_count: 1 },
};

test('GitLab draft-evidence CLI works without GITLAB_TOKEN and writes only result artifact', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-gitlab-changelog-cli-'));
  try {
    const requestPath = path.join(dir, 'request.json');
    await writeFile(requestPath, JSON.stringify(request));
    const result = spawnSync(process.execPath, [CLI, 'gitlab-draft-evidence', '--request', requestPath, '--project', 'group/project', '--json'], { encoding: 'utf8', env: { ...process.env, GITLAB_TOKEN: '' } });
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.outcome, 'draft-evidence');
    assert.equal(parsed.audit.side_effects_executed, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('GitLab draft-evidence CLI returns protocol repair for project mismatch', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-gitlab-changelog-cli-'));
  try {
    const requestPath = path.join(dir, 'request.json');
    await writeFile(requestPath, JSON.stringify(request));
    const result = spawnSync(process.execPath, [CLI, 'gitlab-draft-evidence', '--request', requestPath, '--project', 'other/project', '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).reason, 'protocol_repair_request');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('GitLab draft-MR CLI requires its dedicated confirmation phrase', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-gitlab-changelog-cli-'));
  try {
    const requestPath = path.join(dir, 'request.json');
    await writeFile(requestPath, JSON.stringify(request));
    const result = spawnSync(process.execPath, [CLI, 'gitlab-draft-mr', '--request', requestPath, '--project', 'group/project', '--issue-iid', '7', '--claim-id', 'claim-7', '--draft-file', 'zj-loop/dogfood/changelog-draft.md', '--branch', 'automated/changelog-drafter-gitlab-cdr-cli-1', '--confirm', 'CREATE_CHANGELOG_DRAFT_CARRIER', '--json'], { encoding: 'utf8', env: { ...process.env, GITLAB_TOKEN: 'secret' } });
    assert.equal(result.status, 2, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.reason, 'confirmation-required');
    assert.equal(parsed.required_phrase, 'CREATE_CHANGELOG_DRAFT_MR');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
