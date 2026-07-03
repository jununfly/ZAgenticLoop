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
    await mkdir(path.join(root, '.grok', 'skills', 'loop-triage'), { recursive: true });
    await mkdir(path.join(root, '.claude', 'agents'), { recursive: true });
    await writeFile(path.join(root, '.claude', 'agents', 'loop-verifier.md'), '# Verifier\n');

    const fs = createNodeProjectFileSystem(root);
    assert.deepEqual(await listProjectSkillNames(fs), ['loop-triage', 'loop-verifier']);
  });
});

test('collectProjectEvidenceFacts returns shared loop evidence without policy interpretation', async () => {
  await withProject(async (root) => {
    await mkdir(path.join(root, 'zj-loop'), { recursive: true });
    await writeFile(path.join(root, 'zj-loop', 'STATE.md'), '# State\n');
    await writeFile(path.join(root, 'zj-loop', 'ZJ-LOOP.md'), '# Loop\n');
    await writeFile(path.join(root, 'AGENTS.md'), '# Agents\n');
    await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
    await mkdir(path.join(root, '.codex', 'skills', 'issue-triage'), { recursive: true });

    const fs = createNodeProjectFileSystem(root);
    const facts = await collectProjectEvidenceFacts(fs);

    assert.deepEqual(facts.statePaths, ['zj-loop/STATE.md']);
    assert.deepEqual(facts.missingRequiredLoopFiles, []);
    assert.equal(facts.loopConfig.present, true);
    assert.equal(facts.github.workflows, true);
    assert.deepEqual(facts.loopSkillNames, ['issue-triage']);
  });
});
