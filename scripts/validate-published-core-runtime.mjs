import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const PUBLISHED_CORE_PACKAGE = '@jununfly/zj-loop-core';
export const PUBLISHED_CORE_VERSION = '0.1.34';
export const PUBLISHED_CORE_REGISTRY = 'https://registry.npmjs.org';
export const PUBLISHED_CORE_GATE_SCHEMA = 'zj-loop.published_core_runtime_gate.v1';

const checks = [
  {
    id: 'registry-version',
    command: 'npm view package version',
    expected: PUBLISHED_CORE_VERSION,
  },
  {
    id: 'agent-local-help',
    command: 'zj-loop-agent-local --help',
    expected: 'zj-loop-agent-local',
  },
  {
    id: 'roadmap-activation-help',
    command: 'zj-loop-roadmap-activation --help',
    expected: 'zj-loop-roadmap-activation',
  },
];

function commandResult(check, result, redactions = []) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  const passed =
    result.code === 0 &&
    (check.id === 'registry-version'
      ? String(result.stdout ?? '').trim() === check.expected
      : output.includes(check.expected));
  const outputExcerpt = redactions.reduce(
    (value, redaction) => value.replaceAll(redaction, '[redacted]'),
    output,
  );
  return {
    id: check.id,
    status: passed ? 'passed' : 'failed',
    exit_code: result.code,
    output_excerpt: outputExcerpt.slice(0, 400),
  };
}

async function runCommand(file, args, env, runner = execFileAsync) {
  try {
    const result = await runner(file, args, { env, maxBuffer: 1024 * 1024 });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: typeof error.code === 'number' ? error.code : 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message ?? '',
    };
  }
}

export async function validatePublishedCoreRuntime({
  env = process.env,
  runner = execFileAsync,
  tempRoot,
} = {}) {
  const cacheRoot = tempRoot ?? (await mkdtemp(path.join(os.tmpdir(), 'zj-loop-published-core-')));
  const ownsCacheRoot = !tempRoot;
  const commandEnv = {
    ...env,
    npm_config_cache: cacheRoot,
    npm_config_registry: PUBLISHED_CORE_REGISTRY,
  };
  const packageSpec = `${PUBLISHED_CORE_PACKAGE}@${PUBLISHED_CORE_VERSION}`;
  const results = [];

  try {
    const version = await runCommand(
      'npm',
      ['view', `${packageSpec}`, 'version', '--registry', PUBLISHED_CORE_REGISTRY],
      commandEnv,
      runner,
    );
    results.push(commandResult(checks[0], version, [cacheRoot]));

    for (const check of checks.slice(1)) {
      const command = await runCommand(
        'npx',
        [
          '--yes',
          '--registry',
          PUBLISHED_CORE_REGISTRY,
          '--package',
          packageSpec,
          check.id === 'agent-local-help' ? 'zj-loop-agent-local' : 'zj-loop-roadmap-activation',
          '--help',
        ],
        commandEnv,
        runner,
      );
      results.push(commandResult(check, command, [cacheRoot]));
    }
  } finally {
    if (ownsCacheRoot) await rm(cacheRoot, { recursive: true, force: true });
  }

  const passed = results.every((result) => result.status === 'passed');
  return {
    schema: PUBLISHED_CORE_GATE_SCHEMA,
    status: passed ? 'passed' : 'blocked',
    package: PUBLISHED_CORE_PACKAGE,
    requested_version: PUBLISHED_CORE_VERSION,
    resolved_version: results[0]?.status === 'passed' ? PUBLISHED_CORE_VERSION : null,
    registry: PUBLISHED_CORE_REGISTRY,
    checks: results,
    side_effects_executed: false,
  };
}

async function main() {
  const result = await validatePublishedCoreRuntime();
  const outputIndex = process.argv.indexOf('--out');
  const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
  if (outputPath && !outputPath.startsWith('--')) {
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
