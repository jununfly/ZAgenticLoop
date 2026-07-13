import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildChangelogDrafterExecutionPlan,
  CHANGELOG_DRAFTER_CONFIRMATION_PHRASE,
  executeChangelogDrafterLiveRunner,
  validateChangelogDrafterLiveRequest,
} from '../dist/index.js';

const CHANGELOG_DRAFTER_CLI = fileURLToPath(new URL('../dist/changelog-drafter-cli.js', import.meta.url));

function draftRequest(overrides = {}) {
  const request = {
    schema: 'zj-loop.changelog_draft_request.v1',
    route_id: 'changelog-drafter-draft-request',
    status: 'draft-request-candidate',
    dedupe_key: 'changelog:main:v0.1.2..v0.1.3',
    summary: 'Draft release notes for the next package release.',
    release_window: {
      repo: 'jununfly/ZAgenticLoop',
      base_branch: 'main',
      since_ref: 'v0.1.2',
      until_ref: 'v0.1.3',
      item_count: 4,
    },
    human_gate: {
      required: false,
    },
    side_effects: {
      tag_created: false,
      release_created: false,
      package_published: false,
    },
  };
  return {
    ...request,
    ...overrides,
    release_window: { ...request.release_window, ...(overrides.release_window ?? {}) },
    human_gate: { ...request.human_gate, ...(overrides.human_gate ?? {}) },
    side_effects: { ...request.side_effects, ...(overrides.side_effects ?? {}) },
  };
}

test('Changelog Drafter validates draft request candidates', () => {
  const ok = validateChangelogDrafterLiveRequest(draftRequest());
  const published = validateChangelogDrafterLiveRequest(draftRequest({
    side_effects: { package_published: true },
  }));

  assert.equal(ok.ok, true);
  assert.equal(published.ok, false);
  assert.match(published.errors.join('\n'), /publish-side side effects/);
});

test('Changelog Drafter builds evidence and PR draft plans', () => {
  const evidence = buildChangelogDrafterExecutionPlan({
    draftRequest: draftRequest(),
    draftMode: 'evidence',
  });
  const pr = buildChangelogDrafterExecutionPlan({
    draftRequest: draftRequest(),
    draftMode: 'pr',
    live: true,
    confirmationPhrase: CHANGELOG_DRAFTER_CONFIRMATION_PHRASE,
  });

  assert.equal(evidence.status, 'dry-run');
  assert.equal(evidence.draft_mode, 'evidence');
  assert.deepEqual(evidence.actions.map((action) => action.name), ['write-draft-evidence']);
  assert.equal(pr.status, 'ready-for-live-execution');
  assert.equal(pr.draft_mode, 'pr');
  assert.ok(pr.actions.some((action) => action.name === 'require-draft-diff'));
});

test('Changelog Drafter carries GitLab release window and refuses live draft MR side effects', () => {
  const request = draftRequest({
    release_window: {
      provider: 'gitlab',
      repo: 'group/project',
      pipeline_id: '456',
      pipeline_url: 'https://gitlab.com/group/project/-/pipelines/456',
    },
  });
  const evidence = buildChangelogDrafterExecutionPlan({
    draftRequest: request,
    draftMode: 'evidence',
  });
  const pr = buildChangelogDrafterExecutionPlan({
    draftRequest: request,
    draftMode: 'pr',
    live: true,
    confirmationPhrase: CHANGELOG_DRAFTER_CONFIRMATION_PHRASE,
  });

  assert.equal(validateChangelogDrafterLiveRequest(request).ok, true);
  assert.equal(evidence.release_window.provider, 'gitlab');
  assert.deepEqual(evidence.release_window.provider_metadata, {
    pipeline_id: '456',
    pipeline_url: 'https://gitlab.com/group/project/-/pipelines/456',
  });
  assert.equal(pr.status, 'refused');
  assert.ok(pr.refusals.some((item) => item.reason === 'gitlab-live-draft-mr-side-effects-not-enabled'));
});

test('Changelog Drafter live execution records draft PR without release side effects', async () => {
  const plan = buildChangelogDrafterExecutionPlan({
    draftRequest: draftRequest(),
    draftMode: 'pr',
    live: true,
    confirmationPhrase: CHANGELOG_DRAFTER_CONFIRMATION_PHRASE,
  });
  const result = await executeChangelogDrafterLiveRunner(plan, {
    runner: async (command, args) => {
      if (command === 'git' && args[0] === 'diff') {
        return { command, args, exitCode: 1, stdout: '', stderr: '' };
      }
      return {
        command,
        args,
        exitCode: 0,
        stdout: command === 'gh' ? 'https://github.com/jununfly/ZAgenticLoop/pull/1002\n' : '',
        stderr: '',
      };
    },
  });

  assert.equal(result.outcome, 'draft-pr');
  assert.equal(result.runner_evidence.completion_form, 'draft-pr');
  assert.equal(result.runner_evidence.draft_pull_request.url, 'https://github.com/jununfly/ZAgenticLoop/pull/1002');
  assert.deepEqual(result.runner_evidence.release_side_effects, {
    tag_created: false,
    release_created: false,
    package_published: false,
    final_changelog_acceptance: false,
  });
});

test('Changelog Drafter live-draft CLI executes draft evidence with fixed confirmation', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-changelog-drafter-live-'));
  await mkdir(path.join(dir, 'scripts'), { recursive: true });
  const requestPath = path.join(dir, 'request.json');
  const resultPath = path.join(dir, 'result.json');
  await writeFile(requestPath, JSON.stringify(draftRequest(), null, 2));
  await writeFile(path.join(dir, 'scripts', 'write-file-once.mjs'), [
    "import { mkdir, writeFile } from 'node:fs/promises';",
    "import { dirname } from 'node:path';",
    "const [, , targetPath, content] = process.argv;",
    "await mkdir(dirname(targetPath), { recursive: true });",
    "await writeFile(targetPath, content, { flag: 'wx' });",
    '',
  ].join('\n'));
  try {
    const result = spawnSync(process.execPath, [
      CHANGELOG_DRAFTER_CLI,
      'live-draft',
      '--request',
      requestPath,
      '--draft-mode',
      'evidence',
      '--draft-file',
      'docs/release-notes-draft.md',
      '--confirm-live-draft',
      CHANGELOG_DRAFTER_CONFIRMATION_PHRASE,
      '--out',
      resultPath,
      '--json',
    ], { encoding: 'utf8', cwd: dir });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.outcome, 'draft-evidence');
    assert.equal(parsed.runner_evidence.release_side_effects.final_changelog_acceptance, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Changelog Drafter live-draft CLI refuses missing fixed confirmation', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-changelog-drafter-live-refuse-'));
  const requestPath = path.join(dir, 'request.json');
  await writeFile(requestPath, JSON.stringify(draftRequest(), null, 2));
  try {
    const result = spawnSync(process.execPath, [
      CHANGELOG_DRAFTER_CLI,
      'live-draft',
      '--request',
      requestPath,
      '--draft-mode',
      'evidence',
      '--confirm-live-draft',
      'yes',
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.outcome, 'escalation-issue');
    assert.match(parsed.runner_evidence.escalation.reason, /plan-not-ready-for-live-execution/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Changelog Drafter draft-plan CLI reads request JSON', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-changelog-drafter-'));
  const requestPath = path.join(dir, 'request.json');
  await writeFile(requestPath, JSON.stringify(draftRequest(), null, 2));
  try {
    const result = spawnSync(process.execPath, [
      CHANGELOG_DRAFTER_CLI,
      'draft-plan',
      '--request',
      requestPath,
      '--json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.kind, 'zj-loop.changelog-drafter-live-runner-plan');
    assert.equal(parsed.draft_mode, 'evidence');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
