import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createNodeProjectFileSystem,
  collectProjectEvidenceFacts,
  findExistingProjectPaths,
  hasAnyProjectPath,
  listProjectSkillNames,
  detectProjectProvider,
} from '../dist/index.js';

async function withProject(fn) {
  const root = await mkdtemp(path.join(tmpdir(), 'zj-loop-core-project-'));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('ProjectFileSystem reads and lists root-relative paths', async () => {
  await withProject(async (root) => {
    await writeFile(path.join(root, 'STATE.md'), '# State\n');
    await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });

    const fs = createNodeProjectFileSystem(root);
    assert.equal(await fs.exists('STATE.md'), true);
    assert.equal(await fs.exists('missing.md'), false);
    assert.equal(await fs.readTextIfExists('STATE.md'), '# State\n');
    assert.equal(await fs.readTextIfExists('missing.md'), null);
    assert.deepEqual(
      (await fs.listEntries('.github')).map((entry) => entry.name),
      ['workflows'],
    );
  });
});

test('project path helpers expose deterministic evidence primitives', async () => {
  await withProject(async (root) => {
    await writeFile(path.join(root, 'AGENTS.md'), '# Agents\n');
    const fs = createNodeProjectFileSystem(root);

    assert.deepEqual(await findExistingProjectPaths(fs, ['STATE.md', 'AGENTS.md']), ['AGENTS.md']);
    assert.equal(await hasAnyProjectPath(fs, ['CLAUDE.md', 'AGENTS.md']), true);
    assert.equal(await hasAnyProjectPath(fs, ['CLAUDE.md', 'README.md']), false);
  });
});

test('listProjectSkillNames finds tool skills and verifier agents', async () => {
  await withProject(async (root) => {
    await mkdir(path.join(root, '.grok', 'skills', 'zj-loop-triage'), { recursive: true });
    await mkdir(path.join(root, '.claude', 'agents'), { recursive: true });
    await writeFile(path.join(root, '.claude', 'agents', 'zj-loop-verifier.md'), '# Verifier\n');

    const fs = createNodeProjectFileSystem(root);
    assert.deepEqual(await listProjectSkillNames(fs), ['zj-loop-triage', 'zj-loop-verifier']);
  });
});

test('collectProjectEvidenceFacts returns shared loop evidence without policy interpretation', async () => {
  await withProject(async (root) => {
    await mkdir(path.join(root, 'zj-loop'), { recursive: true });
    await writeFile(path.join(root, 'zj-loop', 'STATE.md'), '# State\n');
    await writeFile(path.join(root, 'zj-loop', 'ZJ-LOOP.md'), '# Loop\n');
    await writeFile(path.join(root, 'zj-loop', 'zj-loop-route-table.yaml'), 'routes: []\n');
    await writeFile(path.join(root, 'AGENTS.md'), '# Agents\n');
    await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
    await mkdir(path.join(root, '.codex', 'skills', 'zj-issue-triage'), { recursive: true });

    const fs = createNodeProjectFileSystem(root);
    const facts = await collectProjectEvidenceFacts(fs);

    assert.deepEqual(facts.statePaths, ['zj-loop/STATE.md']);
    assert.deepEqual(facts.missingRequiredLoopFiles, []);
    assert.equal(facts.loopConfig.present, true);
    assert.equal(facts.github.workflows, true);
    assert.equal(facts.routeTable.present, true);
    assert.deepEqual(facts.loopSkillNames, ['zj-issue-triage']);
  });
});

test('collectProjectEvidenceFacts detects GitLab provider facts without GitHub workflows', async () => {
  await withProject(async (root) => {
    await mkdir(path.join(root, '.git'), { recursive: true });
    await writeFile(
      path.join(root, '.git', 'config'),
      '[remote "origin"]\n\turl = git@git.bilibili.co:team/project.git\n',
    );
    await writeFile(path.join(root, '.gitlab-ci.yml'), 'stages: []\n');
    await writeFile(path.join(root, 'README.md'), 'Use glab issue note for issue notes.\n');

    const fs = createNodeProjectFileSystem(root);
    const facts = await collectProjectEvidenceFacts(fs);

    assert.equal(facts.provider.kind, 'gitlab');
    assert.equal(facts.provider.gitlabCi, true);
    assert.equal(facts.provider.glabMentioned, true);
    assert.equal(facts.github.workflows, false);
  });
});

test('detectProjectProvider keeps GitHub Actions as the GitHub adapter signal', () => {
  assert.equal(detectProjectProvider({ remote: 'git@github.com:jununfly/ZAgenticLoop.git' }), 'github');
  assert.equal(detectProjectProvider({ githubActions: true }), 'github');
  assert.equal(detectProjectProvider({ remote: 'https://gitlab.com/group/project.git' }), 'gitlab');
  assert.equal(detectProjectProvider({ gitlabCi: true }), 'gitlab');
  assert.equal(detectProjectProvider({}), 'manual');
});
