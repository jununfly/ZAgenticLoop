import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const CLI = path.resolve('dist/cli.js');
const ROUTE_CLI = path.resolve('../zj-loop-core/dist/route-cli.js');

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
    assert.match(stdout, /zj-loop-first-run plan --root/);
    assert.match(stdout, /zj-loop-first-run plan --root .* --json/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --json emits deterministic install summary without text chatter', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-json-summary-'));
  try {
    const { stdout } = await exec('node', [
      CLI,
      dir,
      '--pattern',
      'daily-triage',
      '--tool',
      'codex',
      '--json',
    ]);
    const summary = JSON.parse(stdout);

    assert.equal(summary.schema, 'zj-loop.install_summary.v1');
    assert.equal(summary.operation, 'install');
    assert.equal(summary.target_dir, path.resolve(dir));
    assert.deepEqual(summary.provider_adapters, []);
    assert.ok(summary.files.some((file) => file.path === 'zj-loop/ZJ-LOOP.md' && file.status === 'created'));
    assert.ok(summary.files.some((file) => file.path === 'zj-loop/zj-loop-route-table.yaml' && file.status === 'created'));
    assert.equal(summary.route_table.path, 'zj-loop/zj-loop-route-table.yaml');
    assert.equal(summary.route_table.enablement_preserved, true);
    assert.ok(summary.first_run.recommended_commands.some((command) => command.includes('zj-loop-first-run plan --root')));
    assert.ok(summary.next_steps.some((step) => step.command?.includes('zj-loop-first-run plan --root')));
    assert.deepEqual(summary.warnings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init scaffolds daily-triage runtime files with examples and gitignore entries', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-daily-triage-runtime-'));
  try {
    await exec('node', [CLI, dir, '--pattern', 'daily-triage', '--tool', 'grok']);
    await access(path.join(dir, 'zj-loop', 'STATE.md'));
    await access(path.join(dir, 'zj-loop', 'STATE.md.example'));
    await access(path.join(dir, 'zj-loop', 'zj-loop-run-log.md'));
    await access(path.join(dir, 'zj-loop', 'zj-loop-run-log.md.example'));

    const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
    assert.match(gitignore, /# ZJ Loop local runtime state/);
    assert.match(gitignore, /zj-loop\/STATE\.md/);
    assert.match(gitignore, /zj-loop\/zj-loop-run-log\.md/);
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
    assert.match(routeTable, /completion_target:\n    id: automation-first-product\n    schema_version: 1/);
    const routeBlocks = routeTable.split(/\n  - route_id:/).slice(1);
    assert.ok(routeBlocks.length > 0);
    for (const routeBlock of routeBlocks) {
      assert.match(routeBlock, /completion_target:\n      adapters:/);
      assert.match(routeBlock, /github:/);
      assert.match(routeBlock, /gitlab:/);
      assert.match(routeBlock, /workspace:/);
    }
    assert.match(routeTable, /route_profiles:/);
    assert.match(routeTable, /production_safe_default:/);
    assert.match(routeTable, /dogfood_validation:/);
    assert.match(routeTable, /side_effect_routes_enabled: false/);
    assert.match(routeTable, /side_effect_routes_enabled: "route-by-route"/);
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
    assert.match(smoke, /@jununfly\/zj-loop-audit@0\.1\.6/);
    assert.match(smoke, /@jununfly\/zj-loop-core@0\.1\.8/);
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
    assert.match(dependencySweeper, /zj-loop-dependency-sweeper live-repair/);
    assert.match(dependencySweeper, /confirm_live_repair/);
    assert.match(dependencySweeper, /core_package/);
    assert.match(dependencySweeper, /permissions:\n  contents: write/);
    assert.match(dependencySweeper, /GH_TOKEN: \$\{\{ github\.token \}\}/);
    assert.match(dependencySweeper, /gh pr list --head/);
    assert.match(dependencySweeper, /git fetch origin "\$REPAIR_BRANCH" \|\| true/);
    assert.match(dependencySweeper, /--existing-repair-pr-url/);
    assert.match(dependencySweeper, /npm install --prefix/);
    assert.match(dependencySweeper, /git config user\.name "github-actions\[bot\]"/);
    assert.match(dependencySweeper, /git config user\.email "41898282\+github-actions\[bot\]@users\.noreply\.github\.com"/);
    assert.match(dependencySweeper, /if: always\(\)/);
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
    assert.match(prSteward, /zj-loop-pr-steward live-repair/);
    assert.match(prSteward, /confirm_live_repair/);
    assert.match(prSteward, /core_package/);
    assert.match(prSteward, /npm install --prefix/);
    assert.match(prSteward, /if: always\(\)/);
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
    assert.match(issueTriage, /invalid-transition-request/);
    assert.match(issueTriage, /\.source\.repo == \$repository/);
    assert.doesNotMatch(issueTriage, /--confirmation-mode/);
    assert.doesNotMatch(issueTriage, /--confirmation-authority/);
    assert.doesNotMatch(issueTriage, /'\$\{\{ inputs\./);
    const changelogDrafter = await readFile(path.join(dir, '.github', 'workflows', 'zj-loop-changelog-drafter.yml'), 'utf8');
    assert.match(changelogDrafter, /zj-loop-route dispatch changelog-drafter-report/);
    assert.match(changelogDrafter, /changelog-signal\.json/);
    assert.match(changelogDrafter, /zj-loop-dispatch --signal changelog-signal\.json --mode auto/);
    assert.doesNotMatch(changelogDrafter, /zj-loop-changelog-drafter draft-plan/);
    assert.match(changelogDrafter, /zj-loop-changelog-drafter live-draft/);
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

test('zj-loop-init --add github-actions refuses detected GitLab projects unless forced', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-add-github-actions-gitlab-'));
  try {
    await mkdir(path.join(dir, '.git'), { recursive: true });
    await writeFile(
      path.join(dir, '.git', 'config'),
      '[remote "origin"]\n\turl = https://gitlab.com/group/project.git\n',
    );
    await writeFile(path.join(dir, '.gitlab-ci.yml'), 'stages: []\n');

    await assert.rejects(
      () => exec('node', [CLI, dir, '--add', 'github-actions']),
      (err) =>
        err.stderr?.includes('Refusing to install the GitHub Actions adapter in a detected GitLab project') ||
        err.message?.includes('Refusing to install the GitHub Actions adapter in a detected GitLab project'),
    );
    await assert.rejects(() => access(path.join(dir, '.github', 'workflows')));

    const forced = await exec('node', [CLI, dir, '--add', 'github-actions', '--force']);
    assert.match(forced.stdout, /WARNING: detected GitLab project; --force will install GitHub Actions workflows/);
    await access(path.join(dir, '.github', 'workflows', 'zj-loop-smoke.yml'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --upgrade github-actions refuses detected GitLab projects unless forced', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-upgrade-github-actions-gitlab-'));
  try {
    await mkdir(path.join(dir, '.git'), { recursive: true });
    await writeFile(
      path.join(dir, '.git', 'config'),
      '[remote "origin"]\n\turl = ssh://git@git.example.internal/team/project.git\n',
    );
    await writeFile(path.join(dir, '.gitlab-ci.yml'), 'test:\n  script: npm test\n');

    await assert.rejects(
      () => exec('node', [CLI, dir, '--upgrade', 'github-actions']),
      (err) =>
        err.stderr?.includes('Refusing to upgrade/install the GitHub Actions adapter in a detected GitLab project') ||
        err.message?.includes('Refusing to upgrade/install the GitHub Actions adapter in a detected GitLab project'),
    );
    await assert.rejects(() => access(path.join(dir, '.github', 'workflows')));

    const forced = await exec('node', [CLI, dir, '--upgrade', 'github-actions', '--force']);
    assert.match(forced.stdout, /WARNING: detected GitLab project; --force will upgrade GitHub Actions workflows/);
    await access(path.join(dir, '.github', 'workflows', 'zj-loop-smoke.yml'));
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
    assert.match(stdout, /Route Table enablement is preserved/);
    assert.match(stdout, /zj-loop-first-run plan --root/);
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

test('zj-loop-init --add gitlab-ci scaffolds includeable GitLab CI fragments', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-add-gitlab-ci-'));
  try {
    const { stdout } = await exec('node', [CLI, dir, '--add', 'gitlab-ci']);
    assert.match(stdout, /zj-loop-init --add: gitlab-ci/);
    assert.match(stdout, /zj-loop-first-run plan --root/);
    assert.match(stdout, /zj-loop-first-run plan --root .* --json/);

    const fragments = [
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

    const root = await readFile(path.join(dir, '.gitlab-ci.yml'), 'utf8');
    assert.match(root, /zj-loop-generated: true/);
    assert.match(root, /zj-loop-template-id: gitlab-ci\/zj-loop-root/);
    assert.match(root, /zj-loop-template-hash: [a-f0-9]{16}/);
    assert.match(root, /stages:\n  - "zj-loop"/);
    for (const fragment of fragments) {
      assert.match(root, new RegExp(`zj-loop/gitlab-ci/${fragment.replace('.', '\\.')}`));
    }

    for (const fragment of fragments) {
      const body = await readFile(path.join(dir, 'zj-loop', 'gitlab-ci', fragment), 'utf8');
      assert.match(body, /zj-loop-generated: true/);
      assert.match(body, /zj-loop-template-version: 1/);
      assert.match(body, /zj-loop-template-hash: [a-f0-9]{16}/);
      assert.match(body, /stage: "zj-loop"/);
      assert.match(body, /image: "node:22"/);
      assert.match(body, /ZJ Loop GitLab CI requires Node >=18/);
      assert.match(body, /--package @jununfly\/zj-loop-core@0\.1\.8/);
      assert.match(body, /> consumer-plan\.json \|\| true/);
      assert.doesNotMatch(body, /\n  tags:\n/);
      assert.match(body, /artifacts:/);
    }

    const smoke = await readFile(path.join(dir, 'zj-loop', 'gitlab-ci', 'zj-loop-smoke.yml'), 'utf8');
    assert.match(smoke, /zj-loop-template-id: gitlab-ci\/zj-loop-smoke/);
    assert.match(smoke, /zj-loop-route dispatch manual-smoke-report/);
    assert.match(smoke, /gitlab-manual-pipeline/);
    assert.match(smoke, /needs: \[\]/);
    assert.match(smoke, /environment-diagnostics\.json/);
    assert.match(smoke, /ZJ_LOOP_SIGNAL_ID: ""/);
    assert.match(smoke, /\$\{ZJ_LOOP_SIGNAL_ID:-\$\{CI_PIPELINE_ID:-manual\}\}/);
    assert.match(smoke, /ZJ_LOOP_RUN_AUDIT: "1"/);
    assert.match(smoke, /Skipping zj-loop-audit because ZJ_LOOP_RUN_AUDIT=0/);
    const ciSweeper = await readFile(path.join(dir, 'zj-loop', 'gitlab-ci', 'zj-loop-ci-sweeper.yml'), 'utf8');
    assert.match(ciSweeper, /zj-loop-ci-sweeper request-body/);
    assert.match(ciSweeper, /--provider gitlab/);
    assert.match(ciSweeper, /ZJ_LOOP_SIGNAL_ID: ""/);
    assert.match(ciSweeper, /--run-id "\$\{ZJ_LOOP_SIGNAL_ID:-\$\{CI_PIPELINE_ID:-manual\}\}"/);
    assert.match(ciSweeper, /issue-fix-request\.md/);
    assert.match(ciSweeper, /issue-fix-request-result\.json/);
    assert.doesNotMatch(ciSweeper, /\.github\/workflows/);
    const issueTriage = await readFile(path.join(dir, 'zj-loop', 'gitlab-ci', 'zj-loop-issue-triage.yml'), 'utf8');
    assert.match(issueTriage, /zj-loop-route dispatch issue-backlog-triage/);
    assert.match(issueTriage, /ZJ_LOOP_ISSUE_IID: ""/);
    assert.match(issueTriage, /\$\{ZJ_LOOP_SIGNAL_ID:-\$\{ZJ_LOOP_ISSUE_IID:-\$CI_PIPELINE_ID\}\}/);
    assert.match(issueTriage, /issue-recommendations\.json/);
    assert.match(issueTriage, /transition-requests\.json/);
    assert.match(issueTriage, /CI_PIPELINE_SOURCE == "schedule"/);
    assert.match(issueTriage, /CI_PIPELINE_SOURCE == "web"/);
    assert.match(issueTriage, /zj-loop-issue-backlog scan --provider gitlab/);
    assert.match(issueTriage, /ZJ_LOOP_ISSUE_TRIAGE_LIMIT/);
    assert.match(issueTriage, /zj-loop\.transition_requests\.v1/);
    const prSteward = await readFile(path.join(dir, 'zj-loop', 'gitlab-ci', 'zj-loop-pr-steward.yml'), 'utf8');
    assert.match(prSteward, /ZJ_LOOP_MERGE_REQUEST_IID: ""/);
    assert.match(prSteward, /\$\{ZJ_LOOP_SIGNAL_ID:-\$\{ZJ_LOOP_MERGE_REQUEST_IID:-\$\{CI_MERGE_REQUEST_IID:-\$CI_PIPELINE_ID\}\}\}/);
    const changelogDrafter = await readFile(path.join(dir, 'zj-loop', 'gitlab-ci', 'zj-loop-changelog-drafter.yml'), 'utf8');
    assert.match(changelogDrafter, /ZJ_LOOP_CHANGELOG_DRAFT_REQUEST_JSON: ""/);
    assert.match(changelogDrafter, /changelog-signal\.json/);
    assert.match(changelogDrafter, /zj-loop-dispatch --signal changelog-signal\.json --mode auto/);
    assert.match(changelogDrafter, /draft-plan\.json/);
    assert.doesNotMatch(changelogDrafter, /live-draft/);
    const roadmapActivation = await readFile(path.join(dir, 'zj-loop', 'gitlab-ci', 'zj-loop-roadmap-activation.yml'), 'utf8');
    assert.match(roadmapActivation, /zj-loop-route dispatch roadmap-sliced-development/);
    assert.match(roadmapActivation, /zj-loop-roadmap-activation contract-plan --provider gitlab/);
    assert.match(roadmapActivation, /zj-loop-roadmap-activation execute --provider gitlab/);
    assert.match(roadmapActivation, /\$\{ZJ_LOOP_SIGNAL_ID:-\$\{ZJ_LOOP_COMMENT_ID:-\$CI_PIPELINE_ID\}\}/);
    assert.match(roadmapActivation, /contract-plan\.json/);
    assert.match(roadmapActivation, /execution-result\.json/);
    const postMerge = await readFile(path.join(dir, 'zj-loop', 'gitlab-ci', 'zj-loop-post-merge-cleanup.yml'), 'utf8');
    assert.match(postMerge, /zj-loop-route dispatch post-merge-roadmap-closeout/);
    assert.match(postMerge, /zj-loop-post-merge-closeout closeout-plan --provider gitlab/);
    assert.match(postMerge, /closeout-plan\.json/);
    assert.match(postMerge, /ZJ_LOOP_TARGET_BRANCH: ""/);
    assert.match(postMerge, /\$\{ZJ_LOOP_SIGNAL_ID:-\$\{ZJ_LOOP_MERGE_REQUEST_IID:-\$CI_PIPELINE_ID\}\}/);
    assert.match(postMerge, /--merge-request "\$\{ZJ_LOOP_MERGE_REQUEST_IID:-\$\{CI_MERGE_REQUEST_IID:-0\}\}"/);
    assert.match(postMerge, /--gitlab-api-url "\$\{CI_API_V4_URL:-https:\/\/gitlab\.com\/api\/v4\}"/);
    assert.match(postMerge, /--gitlab-job-token "\$\{CI_JOB_TOKEN:-\}"/);
    assert.doesNotMatch(postMerge, /--review-body-file/);
    assert.doesNotMatch(postMerge, /--target-branch/);
    assert.doesNotMatch(postMerge, /ZJ_LOOP_LIVE_CLEANUP_CONFIRMATION/);

    const routeTable = await readFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), 'utf8');
    assert.match(routeTable, /route_id: "manual-smoke-report"/);
    assert.match(routeTable, /provider_support:/);
    assert.match(routeTable, /gitlab:/);
    assert.match(routeTable, /production_safe_default:/);
    assert.match(routeTable, /dogfood_validation:/);

    const routeStatus = await exec('node', [ROUTE_CLI, 'status', 'manual-smoke-report', '--root', dir, '--json']);
    const parsedStatus = JSON.parse(routeStatus.stdout);
    assert.equal(parsedStatus.routes[0].provider_support.gitlab.status, 'dry-run-supported');
    assert.deepEqual(parsedStatus.routes[0].automation_model.provider_context.gitlab, {
      status: 'dry-run-supported',
      execution_supported: false,
      dry_run_supported: true,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --add gitlab-ci renders configurable GitLab stage and runner tags', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-add-gitlab-ci-stage-'));
  try {
    const { stdout } = await exec('node', [
      CLI,
      dir,
      '--add',
      'gitlab-ci',
      '--gitlab-stage',
      'Fallback',
      '--gitlab-runner-tags',
      'k8s,node',
      '--gitlab-image',
      'registry.example.com/node:20',
      '--gitlab-core-package',
      './zj-loop/vendor/jununfly-zj-loop-core-0.1.7.tgz',
    ]);
    assert.match(stdout, /zj-loop-init --add: gitlab-ci/);

    const root = await readFile(path.join(dir, '.gitlab-ci.yml'), 'utf8');
    assert.match(root, /stages:\n  - "Fallback"/);

    const smoke = await readFile(path.join(dir, 'zj-loop', 'gitlab-ci', 'zj-loop-smoke.yml'), 'utf8');
    assert.match(smoke, /stage: "Fallback"/);
    assert.match(smoke, /tags:\n    - "k8s"\n    - "node"/);
    assert.match(smoke, /image: "registry\.example\.com\/node:20"/);
    assert.match(smoke, /Configure --gitlab-image with a Node 18\+ image/);
    assert.match(smoke, /--package \.\/zj-loop\/vendor\/jununfly-zj-loop-core-0\.1\.7\.tgz/);
    assert.doesNotMatch(smoke, /--package @jununfly\/zj-loop-core@0\.1\.7/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --add gitlab-ci skips existing root CI by default', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-add-gitlab-ci-root-skip-'));
  try {
    await writeFile(path.join(dir, '.gitlab-ci.yml'), 'stages: [test]\n');

    const { stdout } = await exec('node', [CLI, dir, '--add', 'gitlab-ci']);
    assert.match(stdout, /skipped: .*\.gitlab-ci\.yml already exists/);
    assert.match(stdout, /next step: review \.gitlab-ci\.yml and include zj-loop\/gitlab-ci\/\*\.yml manually/);
    assert.match(stdout, /=== GitLab CI readiness ===/);
    assert.match(stdout, /fragments: zj-loop\/gitlab-ci\/\*\.yml generated/);
    assert.match(stdout, /root_ci: \.gitlab-ci\.yml was not changed; add the include block below if it is missing/);
    assert.match(stdout, /route_table: zj-loop\/zj-loop-route-table\.yaml created/);
    assert.match(stdout, /provider_ready: github=dry-run-supported gitlab=dry-run-supported/);
    assert.match(stdout, /stage: zj-loop/);
    assert.match(stdout, /runner_tags: \(none configured\)/);
    assert.match(stdout, /image: node:22/);
    assert.match(stdout, /smoke: manual job uses needs: \[\] and writes route-decision\.json, consumer-plan\.json, environment-diagnostics\.json/);
    assert.match(stdout, /action_required: ensure root stages include the configured stage before blocking\/fallback stages/);
    assert.match(stdout, /runner_tags_hint: if project runners require tags/);
    assert.match(stdout, /image_hint: private runners may require --gitlab-image/);
    assert.match(stdout, /include:\n  - local: "zj-loop\/gitlab-ci\/zj-loop-smoke\.yml"/);
    assert.match(stdout, /  - local: "zj-loop\/gitlab-ci\/zj-loop-post-merge-cleanup\.yml"/);
    assert.equal(await readFile(path.join(dir, '.gitlab-ci.yml'), 'utf8'), 'stages: [test]\n');
    await access(path.join(dir, 'zj-loop', 'gitlab-ci', 'zj-loop-smoke.yml'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --add gitlab-ci --force still preserves existing root CI', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-add-gitlab-ci-root-force-preserve-'));
  try {
    await writeFile(path.join(dir, '.gitlab-ci.yml'), 'stages: [test]\n# user owned\n');

    const { stdout } = await exec('node', [CLI, dir, '--add', 'gitlab-ci', '--force']);
    assert.match(stdout, /skipped: .*\.gitlab-ci\.yml already exists/);
    assert.match(stdout, /root_ci: \.gitlab-ci\.yml was not changed; add the include block below if it is missing/);
    assert.match(stdout, /provider_ready: github=dry-run-supported gitlab=dry-run-supported/);
    assert.equal(await readFile(path.join(dir, '.gitlab-ci.yml'), 'utf8'), 'stages: [test]\n# user owned\n');

    const smoke = await readFile(path.join(dir, 'zj-loop', 'gitlab-ci', 'zj-loop-smoke.yml'), 'utf8');
    assert.match(smoke, /zj-loop-template-id: gitlab-ci\/zj-loop-smoke/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --add gitlab-ci warns when vendor tarballs are ignored', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-add-gitlab-ci-vendor-ignore-'));
  try {
    await writeFile(path.join(dir, '.gitignore'), '**/*.tgz\n');

    const { stdout } = await exec('node', [CLI, dir, '--add', 'gitlab-ci']);

    assert.match(stdout, /warning: zj-loop\/vendor\/\*\.tgz appears to be ignored by Git/);
    assert.match(stdout, /git add -f zj-loop\/vendor\/\*\.tgz/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --upgrade gitlab-ci warns when vendor tarballs are ignored', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-upgrade-gitlab-ci-vendor-ignore-'));
  try {
    await exec('node', [CLI, dir, '--add', 'gitlab-ci']);
    await writeFile(path.join(dir, '.gitignore'), '**/*.tgz\n');

    const { stdout } = await exec('node', [CLI, dir, '--upgrade', 'gitlab-ci']);

    assert.match(stdout, /warning: zj-loop\/vendor\/\*\.tgz appears to be ignored by Git/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --upgrade gitlab-ci upgrades fragments and leaves existing root CI alone', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-upgrade-gitlab-ci-'));
  try {
    await exec('node', [CLI, dir, '--add', 'gitlab-ci']);
    const smokePath = path.join(dir, 'zj-loop', 'gitlab-ci', 'zj-loop-smoke.yml');
    await writeFile(smokePath, `${await readFile(smokePath, 'utf8')}\n# local edit\n`);
    await writeFile(path.join(dir, '.gitlab-ci.yml'), 'stages: [test]\n');

    const { stdout } = await exec('node', [
      CLI,
      dir,
      '--upgrade',
      'gitlab-ci',
      '--gitlab-stage',
      'Fallback',
      '--gitlab-runner-tags',
      'k8s',
      '--gitlab-image',
      'registry.example.com/node:20',
      '--gitlab-core-package',
      './zj-loop/vendor/jununfly-zj-loop-core-0.1.7.tgz',
    ]);
    assert.match(stdout, /zj-loop-init --upgrade gitlab-ci/);
    assert.match(stdout, /\[stage=Fallback\]/);
    assert.match(stdout, /\[image=registry\.example\.com\/node:20\]/);
    assert.match(stdout, /\[core-package=\.\/zj-loop\/vendor\/jununfly-zj-loop-core-0\.1\.7\.tgz\]/);
    assert.match(stdout, /\[runner-tags=k8s\]/);
    assert.match(stdout, /backed up modified generated file: .*zj-loop-smoke\.yml → .*zj-loop-smoke\.yml\.bak/);
    assert.match(stdout, /upgraded: .*zj-loop-smoke\.yml/);
    assert.match(stdout, /skipped: \.gitlab-ci\.yml already exists/);
    assert.match(stdout, /=== GitLab CI readiness ===/);
    assert.match(stdout, /fragments: zj-loop\/gitlab-ci\/\*\.yml upgraded/);
    assert.match(stdout, /root_ci: \.gitlab-ci\.yml was not changed; add the include block below if it is missing/);
    assert.match(stdout, /route_table: zj-loop\/zj-loop-route-table\.yaml present/);
    assert.match(stdout, /stage: Fallback/);
    assert.match(stdout, /runner_tags: k8s/);
    assert.match(stdout, /image: registry\.example\.com\/node:20/);
    assert.match(stdout, /core_package: \.\/zj-loop\/vendor\/jununfly-zj-loop-core-0\.1\.7\.tgz/);
    assert.match(stdout, /include:\n  - local: "zj-loop\/gitlab-ci\/zj-loop-smoke\.yml"/);
    assert.match(stdout, /Route Table enablement is preserved/);
    assert.match(stdout, /zj-loop-first-run plan --root/);
    assert.equal(await readFile(path.join(dir, '.gitlab-ci.yml'), 'utf8'), 'stages: [test]\n');
    const backup = await readFile(`${smokePath}.bak`, 'utf8');
    assert.match(backup, /# local edit/);
    const upgraded = await readFile(smokePath, 'utf8');
    assert.match(upgraded, /stage: "Fallback"/);
    assert.match(upgraded, /tags:\n    - "k8s"/);
    assert.match(upgraded, /image: "registry\.example\.com\/node:20"/);
    assert.match(upgraded, /--package \.\/zj-loop\/vendor\/jununfly-zj-loop-core-0\.1\.7\.tgz/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --upgrade gitlab-ci --json reports drift classification and preserved route intent', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-upgrade-gitlab-ci-json-'));
  try {
    await exec('node', [CLI, dir, '--add', 'gitlab-ci']);
    const smokePath = path.join(dir, 'zj-loop', 'gitlab-ci', 'zj-loop-smoke.yml');
    await writeFile(smokePath, `${await readFile(smokePath, 'utf8')}\n# local edit\n`);
    await writeFile(path.join(dir, '.gitlab-ci.yml'), 'stages: [test]\n');

    const { stdout } = await exec('node', [CLI, dir, '--upgrade', 'gitlab-ci', '--json']);
    const summary = JSON.parse(stdout);

    assert.equal(summary.schema, 'zj-loop.install_summary.v1');
    assert.equal(summary.operation, 'upgrade');
    assert.deepEqual(summary.provider_adapters, ['gitlab']);
    assert.equal(summary.route_table.enablement_preserved, true);
    assert.ok(summary.files.some((file) =>
      file.path === 'zj-loop/gitlab-ci/zj-loop-smoke.yml' &&
      file.status === 'modified_generated_backed_up' &&
      file.backup_path === 'zj-loop/gitlab-ci/zj-loop-smoke.yml.bak'
    ));
    assert.ok(summary.files.some((file) => file.path === '.gitlab-ci.yml' && file.status === 'skipped'));
    assert.ok(summary.first_run.recommended_commands.some((command) => command.includes('zj-loop-first-run plan --root')));
    assert.ok(summary.next_steps.some((step) => step.command?.includes('zj-loop-route status')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('zj-loop-init --upgrade gitlab-ci creates missing route table readiness substrate', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-init-upgrade-gitlab-ci-route-table-'));
  try {
    await exec('node', [CLI, dir, '--add', 'gitlab-ci']);
    await rm(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), { force: true });

    const { stdout } = await exec('node', [CLI, dir, '--upgrade', 'gitlab-ci']);

    assert.match(stdout, /created: zj-loop\/zj-loop-route-table\.yaml/);
    assert.match(stdout, /route_table: zj-loop\/zj-loop-route-table\.yaml created/);
    const routeTable = await readFile(path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'), 'utf8');
    assert.match(routeTable, /route_id: "manual-smoke-report"/);
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
