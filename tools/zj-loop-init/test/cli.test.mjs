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
    assert.match(routeTable, /route_id: "issue-backlog-triage"/);
    assert.match(routeTable, /consumer_kind: "report-consumer"/);
    assert.match(routeTable, /mode: "report-only"/);
    assert.match(routeTable, /side_effect_level: "evidence"/);
    assert.match(routeTable, /runner: "install-ready"/);
    assert.match(routeTable, /evidence_store: "zj-loop\/issue-triage-state\.md"/);
    assert.doesNotMatch(routeTable, /status_store/);
    assert.doesNotMatch(routeTable, /state-request/);
    assert.match(routeTable, /route_id: "issue-triage-action"[\s\S]*?enabled: false/);
    assert.match(routeTable, /route_id: "issue-triage-transition"[\s\S]*?enabled: false/);
    assert.match(routeTable, /route_id: "issue-triage-transition"[\s\S]*?mode: "request-only"/);
    assert.match(routeTable, /route_id: "issue-triage-transition"[\s\S]*?side_effect_level: "request"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init does not overwrite an existing loop contract unless --force is explicit', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-existing-loop-contract-'));
  try {
    await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
    const loopPath = path.join(dir, 'zj-loop', 'ZJ-LOOP.md');
    await writeFile(loopPath, '# Existing Loop Contract\n');

    const skipped = await exec('node', [CLI, dir, '--pattern', 'daily-triage', '--tool', 'grok']);
    assert.match(skipped.stdout, /skipped: zj-loop\/ZJ-LOOP\.md already exists/);
    assert.match(skipped.stdout, /rerun with --force to replace it intentionally/);
    assert.equal(await readFile(loopPath, 'utf8'), '# Existing Loop Contract\n');

    const forced = await exec('node', [CLI, dir, '--pattern', 'daily-triage', '--tool', 'grok', '--force']);
    assert.match(forced.stdout, /OVERWRITTEN with --force: zj-loop\/ZJ-LOOP\.md/);
    assert.notEqual(await readFile(loopPath, 'utf8'), '# Existing Loop Contract\n');
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

test('zj-loop-init --add github-actions scaffolds the workflow bundle', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-add-github-actions-'));
  try {
    const { stdout } = await exec('node', [CLI, dir, '--add', 'github-actions']);
    assert.match(stdout, /zj-loop-init --add: github-actions/);

    const workflows = [
      'zj-loop-smoke.yml',
      'zj-loop-daily-triage.yml',
      'zj-loop-ci-sweeper.yml',
      'zj-loop-pr-steward.yml',
      'zj-loop-issue-triage.yml',
      'zj-loop-dependency-sweeper.yml',
      'zj-loop-changelog-drafter.yml',
      'zj-loop-roadmap-activation.yml',
      'zj-loop-post-merge-cleanup.yml',
    ];

    for (const workflow of workflows) {
      const body = await readFile(path.join(dir, '.github', 'workflows', workflow), 'utf8');
      assert.match(body, /zj-loop-generated: true/);
      assert.match(body, /zj-loop-template-version: 1/);
      assert.match(body, /zj-loop-template-hash: [a-f0-9]{16}/);
    }

    const smoke = await readFile(path.join(dir, '.github', 'workflows', 'zj-loop-smoke.yml'), 'utf8');
    assert.match(smoke, /@jununfly\/zj-loop-audit@0\.1\.3/);
    assert.match(smoke, /@jununfly\/zj-loop-core@0\.1\.3/);
    assert.match(smoke, /zj-loop-route dispatch manual-smoke-report/);
    assert.match(smoke, /zj-loop-consumer plan manual-smoke-report/);
    const ciSweeper = await readFile(path.join(dir, '.github', 'workflows', 'zj-loop-ci-sweeper.yml'), 'utf8');
    assert.match(ciSweeper, /zj-loop-ci-sweeper plan/);
    assert.match(ciSweeper, /zj-loop-ci-sweeper repair-plan/);
    assert.match(ciSweeper, /zj-loop-ci-sweeper request-body/);
    assert.match(ciSweeper, /gh issue create/);
    const dependencySweeper = await readFile(path.join(dir, '.github', 'workflows', 'zj-loop-dependency-sweeper.yml'), 'utf8');
    assert.match(dependencySweeper, /zj-loop-dependency-sweeper plan/);
    assert.match(dependencySweeper, /zj-loop-dependency-sweeper repair-plan/);
    assert.doesNotMatch(dependencySweeper, /'\$\{\{ inputs\./);
    const postMergeCleanup = await readFile(path.join(dir, '.github', 'workflows', 'zj-loop-post-merge-cleanup.yml'), 'utf8');
    assert.match(postMergeCleanup, /zj-loop-post-merge-closeout plan/);
    assert.match(postMergeCleanup, /zj-loop-post-merge-closeout closeout-plan/);
    assert.doesNotMatch(postMergeCleanup, /'\$\{\{ inputs\./);

    const routeTable = await readFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), 'utf8');
    assert.match(routeTable, /route_id: "manual-smoke-report"/);
    assert.match(routeTable, /consumer: "manual-smoke"/);
    assert.match(routeTable, /consumer_kind: "report-consumer"/);
    assert.match(routeTable, /maturity:/);
    assert.match(routeTable, /capabilities:/);
    assert.match(routeTable, /route_id: "ci-sweeper"/);
    assert.match(routeTable, /consumer_kind: "fix-runner"/);
    assert.match(routeTable, /route_id: "pr-steward-report"/);
    assert.match(routeTable, /route_id: "pr-steward-fix-request"/);
    assert.match(routeTable, /route_id: "issue-backlog-triage"/);
    assert.match(routeTable, /route_id: "issue-triage-action"/);
    assert.match(routeTable, /route_id: "issue-triage-transition"/);
    assert.match(routeTable, /route_id: "changelog-drafter-report"/);
    assert.match(routeTable, /route_id: "changelog-drafter-draft-request"/);
    assert.match(routeTable, /route_id: "roadmap-sliced-development"/);
    assert.match(routeTable, /route_id: "post-merge-roadmap-closeout"/);

    const prSteward = await readFile(path.join(dir, '.github', 'workflows', 'zj-loop-pr-steward.yml'), 'utf8');
    assert.match(prSteward, /zj-loop-route dispatch pr-steward-report/);
    assert.match(prSteward, /zj-loop-pr-steward fix-plan/);
    assert.doesNotMatch(prSteward, /'\$\{\{ inputs\./);
    const issueTriage = await readFile(path.join(dir, '.github', 'workflows', 'zj-loop-issue-triage.yml'), 'utf8');
    assert.match(issueTriage, /zj-loop-route dispatch issue-backlog-triage/);
    assert.match(issueTriage, /GH_TOKEN: \$\{\{ github\.token \}\}/);
    assert.match(issueTriage, /zj-loop-issue-triage-action action-plan/);
    assert.match(issueTriage, /zj-loop-issue-triage-transition confirm-plan/);
    assert.match(issueTriage, /zj-loop-issue-triage-transition request-body/);
    assert.match(issueTriage, /<!-- zj-loop:issue-fix-request/);
    assert.match(issueTriage, /gh issue comment "\$SOURCE_ISSUE" --body-file issue-fix-request-body\.md/);
    assert.doesNotMatch(issueTriage, /gh issue create/);
    assert.match(issueTriage, /triage_transition_confirmation/);
    assert.doesNotMatch(issueTriage, /'\$\{\{ inputs\./);
    const changelogDrafter = await readFile(path.join(dir, '.github', 'workflows', 'zj-loop-changelog-drafter.yml'), 'utf8');
    assert.match(changelogDrafter, /zj-loop-route dispatch changelog-drafter-report/);
    assert.match(changelogDrafter, /zj-loop-changelog-drafter draft-plan/);
    assert.doesNotMatch(changelogDrafter, /'\$\{\{ inputs\./);
    const roadmapActivation = await readFile(path.join(dir, '.github', 'workflows', 'zj-loop-roadmap-activation.yml'), 'utf8');
    assert.match(roadmapActivation, /zj-loop-route dispatch roadmap-sliced-development/);
    assert.match(roadmapActivation, /zj-loop-roadmap-activation activation-plan/);
    assert.match(roadmapActivation, /zj-loop-roadmap-activation contract-plan/);
    assert.match(roadmapActivation, /zj-loop-roadmap-activation bounded-slices-pack/);
    assert.match(roadmapActivation, /max_slices/);
    assert.doesNotMatch(roadmapActivation, /'\$\{\{ inputs\./);
    assert.match(postMergeCleanup, /zj-loop-route dispatch post-merge-roadmap-closeout/);
    assert.match(postMergeCleanup, /live_cleanup_confirmation/);
    assert.match(postMergeCleanup, /zj-loop-post-merge-closeout live-closeout/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --add github-actions skips existing workflows unless --force is explicit', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-add-github-actions-skip-'));
  try {
    await mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    const workflowPath = path.join(dir, '.github', 'workflows', 'zj-loop-smoke.yml');
    await writeFile(workflowPath, 'name: Custom Smoke\n');

    const skipped = await exec('node', [CLI, dir, '--add', 'github-actions']);
    assert.match(skipped.stdout, /skipped: .*zj-loop-smoke\.yml already exists/);
    assert.match(skipped.stdout, /next step: review \.github\/workflows\/zj-loop-smoke\.yml/);
    assert.equal(await readFile(workflowPath, 'utf8'), 'name: Custom Smoke\n');

    const forced = await exec('node', [CLI, dir, '--add', 'github-actions', '--force']);
    assert.match(forced.stdout, /OVERWRITTEN with --force: .*zj-loop-smoke\.yml/);
    assert.match(forced.stdout, /WARNING: review this generated workflow/);
    assert.notEqual(await readFile(workflowPath, 'utf8'), 'name: Custom Smoke\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --upgrade github-actions upgrades clean workflows', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-upgrade-github-actions-'));
  try {
    await exec('node', [CLI, dir, '--add', 'github-actions']);
    const workflowPath = path.join(dir, '.github', 'workflows', 'zj-loop-smoke.yml');
    const before = await readFile(workflowPath, 'utf8');

    const { stdout } = await exec('node', [CLI, dir, '--upgrade', 'github-actions']);
    assert.match(stdout, /zj-loop-init --upgrade github-actions/);
    assert.match(stdout, /upgraded: .*zj-loop-smoke\.yml/);
    assert.equal(await readFile(workflowPath, 'utf8'), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --upgrade github-actions backs up modified workflows before writing canonical version', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-upgrade-github-actions-bak-'));
  try {
    await exec('node', [CLI, dir, '--add', 'github-actions']);
    const workflowPath = path.join(dir, '.github', 'workflows', 'zj-loop-smoke.yml');
    await writeFile(workflowPath, `${await readFile(workflowPath, 'utf8')}\n# local edit\n`);

    const { stdout } = await exec('node', [CLI, dir, '--upgrade', 'github-actions']);
    assert.match(stdout, /backed up modified workflow: .*zj-loop-smoke\.yml → .*zj-loop-smoke\.yml\.bak/);
    assert.match(stdout, /upgraded: .*zj-loop-smoke\.yml/);

    const backup = await readFile(`${workflowPath}.bak`, 'utf8');
    assert.match(backup, /# local edit/);
    const canonical = await readFile(workflowPath, 'utf8');
    assert.doesNotMatch(canonical, /# local edit/);
    assert.match(canonical, /zj-loop-template-hash: [a-f0-9]{16}/);
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
