import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

import { RELEASE_PACKAGES } from './validate-release-workflows.mjs';

export function getPackageBuildPlan(releasePackages = RELEASE_PACKAGES) {
  return releasePackages.map((releasePackage) => releasePackage.directory);
}

export const PACKAGE_BUILD_PLAN = getPackageBuildPlan();

export function hasArg(name) {
  return process.argv.includes(name);
}

export function runStep(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`);
  }
}

async function packageHasScript(directory, scriptName) {
  const pkg = JSON.parse(await readFile(`${directory}/package.json`, 'utf8'));
  return Boolean(pkg.scripts?.[scriptName]);
}

export async function buildRepairCommands({
  packageDirectories = PACKAGE_BUILD_PLAN,
  rootInstallCommand = ['npm', ['ci', '--ignore-scripts']],
  rootCommands = [
    ['node', ['scripts/check-zj-loop-init-sync.mjs']],
    ['node', ['scripts/validate-release-workflows.mjs']],
  ],
} = {}) {
  const commands = [];

  for (const directory of packageDirectories) {
    commands.push({ command: 'npm', args: ['ci'], cwd: directory });
    if (await packageHasScript(directory, 'build')) {
      commands.push({ command: 'npm', args: ['run', 'build'], cwd: directory });
    }
  }

  if (rootInstallCommand) {
    const [command, args] = rootInstallCommand;
    commands.push({ command, args });
  }

  for (const [command, args] of rootCommands) {
    commands.push({ command, args });
  }

  return commands;
}

function formatCommand(step) {
  const prefix = step.cwd ? `(cd ${step.cwd} && ` : '';
  const suffix = step.cwd ? ')' : '';
  return `${prefix}${[step.command, ...step.args].join(' ')}${suffix}`;
}

export async function deterministicRepair({ dryRun = false } = {}) {
  const commands = await buildRepairCommands();

  for (const step of commands) {
    if (dryRun) {
      console.log(`[dry-run] ${formatCommand(step)}`);
      continue;
    }

    runStep(step.command, step.args, step.cwd ? { cwd: step.cwd } : {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  deterministicRepair({ dryRun: hasArg('--dry-run') }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
