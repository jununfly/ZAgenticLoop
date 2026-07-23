#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FIXTURES = [
  {
    name: 'github',
    adapter: 'github',
    addArgs: ['--add', 'github-actions'],
    requiredFiles: ['zj-loop/STATE.md', 'zj-loop/zj-loop-route-table.yaml', '.github/workflows/zj-loop-smoke.yml'],
  },
  {
    name: 'gitlab',
    adapter: 'gitlab',
    addArgs: ['--add', 'gitlab-ci'],
    requiredFiles: ['zj-loop/STATE.md', 'zj-loop/zj-loop-route-table.yaml', '.gitlab-ci.yml', 'zj-loop/gitlab-ci/zj-loop-smoke.yml'],
  },
  {
    name: 'workspace',
    adapter: 'workspace',
    addArgs: [],
    requiredFiles: ['zj-loop/STATE.md', 'zj-loop/zj-loop-route-table.yaml'],
  },
];

export async function runReferenceInstallationFixtures(root = ROOT) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'zj-loop-reference-installations-'));
  try {
    await ensureLocalInitRuntime(root);
    const results = [];
    for (const fixture of FIXTURES) {
      results.push(await runFixture(root, tempRoot, fixture));
    }
    return {
      schema: 'zj-loop.reference_installation_fixtures.v1',
      status: results.every((result) => result.status === 'passed') ? 'passed' : 'failed',
      fixture_count: results.length,
      provider_calls: 0,
      writes: 0,
      side_effects_executed: false,
      results,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function runFixture(root, tempRoot, fixture) {
  const project = path.join(tempRoot, fixture.name);
  const initCli = path.join(root, 'tools/zj-loop-init/dist/cli.js');
  const auditCli = path.join(root, 'tools/zj-loop-audit/dist/cli.js');
  const doctorCli = path.join(root, 'tools/zj-loop-core/dist/doctor-cli.js');
  const checks = [];

  await exec(process.execPath, [initCli, project, '--pattern', 'daily-triage', '--tool', 'codex'], { cwd: root });
  if (fixture.addArgs.length > 0) await exec(process.execPath, [initCli, project, ...fixture.addArgs], { cwd: root });

  for (const relativePath of fixture.requiredFiles) {
    try {
      await lstat(path.join(project, relativePath));
      checks.push({ name: `file:${relativePath}`, status: 'passed' });
    } catch {
      checks.push({ name: `file:${relativePath}`, status: 'failed' });
    }
  }

  const audit = await exec(process.execPath, [auditCli, project, '--json'], { cwd: root });
  const auditResult = JSON.parse(audit.stdout);
  checks.push({ name: 'readiness-audit', status: auditResult.score >= 40 ? 'passed' : 'failed', score: auditResult.score, level: auditResult.level });

  const doctor = await exec(process.execPath, [doctorCli, '--root', project, '--completion', '--format', 'json'], { cwd: root });
  const completion = JSON.parse(doctor.stdout);
  checks.push({
    name: 'completion-ledger',
    status: completion.schema === 'zj-loop.completion-alignment-ledger.v1' ? 'passed' : 'failed',
    target: completion.target?.id ?? null,
    summary: completion.summary ?? null,
  });

  return {
    name: fixture.name,
    adapter: fixture.adapter,
    status: checks.every((check) => check.status === 'passed') ? 'passed' : 'failed',
    checks,
    side_effects_executed: false,
  };
}

async function ensureLocalInitRuntime(root) {
  const initRoot = path.join(root, 'tools/zj-loop-init');
  const currentCorePackage = JSON.parse(await readFile(path.join(root, 'tools/zj-loop-core/package.json'), 'utf8'));
  const installedCoreRoot = path.join(initRoot, 'node_modules/@jununfly/zj-loop-core');
  try {
    const installed = JSON.parse(await readFile(path.join(installedCoreRoot, 'package.json'), 'utf8'));
    if (installed.version === currentCorePackage.version) return;
  } catch {
    // Link the checked-out core for a deterministic local fixture.
  }
  await rm(installedCoreRoot, { recursive: true, force: true });
  await mkdir(path.dirname(installedCoreRoot), { recursive: true });
  await symlink(path.join(root, 'tools/zj-loop-core'), installedCoreRoot, 'dir');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runReferenceInstallationFixtures()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.status !== 'passed') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(`ERROR: ${error.message}`);
      process.exitCode = 1;
    });
}
