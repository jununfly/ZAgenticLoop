import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const CLI = path.resolve('dist/cli.js');

test('bundle-assets tolerates concurrent rebuilds', async () => {
  await Promise.all([
    exec('node', ['scripts/bundle-assets.mjs']),
    exec('node', ['scripts/bundle-assets.mjs']),
  ]);
  await access(path.join('starters', 'issue-triage', 'README.md'));
  await access(path.join('templates', 'SKILL.md.zj-issue-triage'));
  await access('registry.yaml');
});

test('zj-loop-init --help exits 0', async () => {
  const { stdout } = await exec('node', [CLI, '--help']);
  assert.match(stdout, /changelog-drafter/);
});

test('zj-loop-init dry-run scaffolds daily-triage', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-'));
  try {
    const { stdout } = await exec('node', [
      CLI,
      dir,
      '--pattern',
      'daily-triage',
      '--tool',
      'grok',
      '--dry-run',
    ]);
    assert.match(stdout, /zj-loop-init: daily-triage/);
    assert.match(stdout, /would copy|copied/);
    assert.match(stdout, /would write: .*zj-loop-route-table\.yaml/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init accepts roadmap-sliced-development canonical id only', async () => {
  const canonical = await exec('node', [
    CLI,
    '.',
    '--pattern',
    'roadmap-sliced-development',
    '--tool',
    'codex',
    '--dry-run',
  ]);
  assert.match(canonical.stdout, /zj-loop-init: roadmap-sliced-development/);

  await assert.rejects(
    () => exec('node', [CLI, '.', '--pattern', 'roadmap-sliced-development-pattern', '--tool', 'codex', '--dry-run']),
    (err) => err.stderr?.includes('Unknown pattern') || err.message?.includes('Unknown pattern'),
  );
});

test('zj-loop-init scaffolds issue-triage with bundled assets', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-'));
  try {
    await exec('node', [CLI, dir, '--pattern', 'issue-triage', '--tool', 'grok']);
    await access(path.join(dir, 'zj-loop', 'issue-triage-state.md'));
    await access(path.join(dir, 'zj-loop', 'ZJ-LOOP.md'));
    await access(path.join(dir, '.grok', 'skills', 'zj-issue-triage', 'SKILL.md'));
    await access(path.join(dir, '.grok', 'skills', 'zj-loop-verifier', 'SKILL.md'));
    await access(path.join(dir, 'zj-loop', 'zj-loop-budget.md'));
    await access(path.join(dir, 'zj-loop', 'zj-loop-run-log.md'));
    const routeTable = await readFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), 'utf8');
    assert.match(routeTable, /primary_pattern: "issue-triage"/);
    assert.match(routeTable, /route_id: "issue-triage-report"/);
    assert.match(routeTable, /evidence_store: "zj-loop\/issue-triage-state\.md"/);
    assert.doesNotMatch(routeTable, /status_store/);
    assert.doesNotMatch(routeTable, /state-request/);
    assert.match(routeTable, /enabled: false/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --add scaffolds explicit optional artifacts', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-add-'));
  try {
    const { stdout } = await exec('node', [CLI, dir, '--add', 'safety,pattern-registry,route-table']);
    assert.match(stdout, /zj-loop-init --add: safety, pattern-registry, route-table/);
    await access(path.join(dir, 'zj-loop', 'zj-loop-safety.md'));
    await access(path.join(dir, 'patterns', 'registry.yaml'));
    const routeTable = await readFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), 'utf8');
    assert.match(routeTable, /primary_pattern: "daily-triage"/);
    assert.doesNotMatch(routeTable, /__PATTERN_/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --add skips existing files unless --force is explicit', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-add-skip-'));
  try {
    await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
    const safetyPath = path.join(dir, 'zj-loop', 'zj-loop-safety.md');
    await writeFile(safetyPath, '# Custom Safety\n');

    const skipped = await exec('node', [CLI, dir, '--add', 'safety']);
    assert.match(skipped.stdout, /skipped: .*zj-loop-safety\.md already exists/);
    assert.match(skipped.stdout, /next step: review zj-loop\/zj-loop-safety\.md or rerun with --force/);
    assert.equal(await readFile(safetyPath, 'utf8'), '# Custom Safety\n');

    const forced = await exec('node', [CLI, dir, '--add', 'safety', '--force']);
    assert.match(forced.stdout, /OVERWRITTEN with --force/);
    assert.match(forced.stdout, /WARNING: review this policy\/catalog file/);
    assert.notEqual(await readFile(safetyPath, 'utf8'), '# Custom Safety\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --add route-table skips existing files unless --force is explicit', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-add-route-table-skip-'));
  try {
    await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
    const routeTablePath = path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml');
    await writeFile(routeTablePath, 'custom: true\n');

    const skipped = await exec('node', [CLI, dir, '--add', 'route-table']);
    assert.match(skipped.stdout, /skipped: zj-loop\/zj-loop-route-table\.yaml already exists/);
    assert.match(skipped.stdout, /next step: review zj-loop\/zj-loop-route-table\.yaml or rerun with --force/);
    assert.equal(await readFile(routeTablePath, 'utf8'), 'custom: true\n');

    const forced = await exec('node', [CLI, dir, '--add', 'route-table', '--force']);
    assert.match(forced.stdout, /OVERWRITTEN with --force: zj-loop\/zj-loop-route-table\.yaml/);
    assert.match(forced.stdout, /WARNING: review this route policy/);
    assert.notEqual(await readFile(routeTablePath, 'utf8'), 'custom: true\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --add rejects aggregate aliases', async () => {
  await assert.rejects(
    () => exec('node', [CLI, '.', '--add', 'all', '--dry-run']),
    (err) => err.stderr?.includes('Unknown --add artifact: all') || err.message?.includes('Unknown --add artifact: all'),
  );
});

test('zj-loop-init rejects unknown pattern', async () => {
  await assert.rejects(
    () => exec('node', [CLI, '.', '--pattern', 'not-a-pattern', '--tool', 'grok', '--dry-run']),
    (err) => err.stderr?.includes('Unknown pattern') || err.message?.includes('Unknown pattern'),
  );
});

test('zj-loop-init rejects unknown tool', async () => {
  await assert.rejects(
    () => exec('node', [CLI, '.', '--pattern', 'daily-triage', '--tool', 'emacs', '--dry-run']),
    (err) => err.stderr?.includes('Unknown tool') || err.message?.includes('Unknown tool'),
  );
});

test('zj-loop-init fails fast on unknown option and missing option value', async () => {
  await assert.rejects(
    () => exec('node', [CLI, '--wat']),
    (err) => err.stderr?.includes('Unknown option: --wat') || err.message?.includes('Unknown option: --wat'),
  );

  await assert.rejects(
    () => exec('node', [CLI, '--pattern']),
    (err) => err.stderr?.includes('Missing value for option: --pattern') || err.message?.includes('Missing value for option: --pattern'),
  );
});

test('zj-loop-init scaffolds ci-sweeper with bundled assets', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-'));
  try {
    await exec('node', [CLI, dir, '--pattern', 'ci-sweeper', '--tool', 'grok']);
    await access(path.join(dir, 'zj-loop', 'ci-sweeper-state.md'));
    await access(path.join(dir, 'zj-loop', 'ZJ-LOOP.md'));
    await access(path.join(dir, '.grok', 'skills', 'zj-ci-triage', 'SKILL.md'));
    await access(path.join(dir, '.grok', 'skills', 'zj-minimal-fix', 'SKILL.md'));
    await access(path.join(dir, '.grok', 'skills', 'zj-loop-verifier', 'SKILL.md'));
    await access(path.join(dir, 'zj-loop', 'zj-loop-budget.md'));
    await access(path.join(dir, 'zj-loop', 'zj-loop-run-log.md'));
    await access(path.join(dir, '.grok', 'skills', 'zj-loop-budget', 'SKILL.md'));
    const routeTable = await readFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), 'utf8');
    assert.match(routeTable, /primary_pattern: "ci-sweeper"/);
    assert.match(routeTable, /route_id: "ci-sweeper-report"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init skips existing route table by default', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-route-table-'));
  try {
    await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
    const routeTablePath = path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml');
    await writeFile(routeTablePath, 'custom: true\n');

    const { stdout } = await exec('node', [CLI, dir, '--pattern', 'daily-triage', '--tool', 'grok']);
    assert.match(stdout, /skipped: zj-loop\/zj-loop-route-table\.yaml already exists/);
    assert.equal(await readFile(routeTablePath, 'utf8'), 'custom: true\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
