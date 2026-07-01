#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const TOOL_PACKAGES = [
  { id: 'zj-loop-core', directory: 'tools/zj-loop-core', role: 'zj-loop', gates: ['root'] },
  { id: 'zj-loop-audit', directory: 'tools/zj-loop-audit', role: 'zj-loop', gates: ['root'] },
  { id: 'zj-loop-init', directory: 'tools/zj-loop-init', role: 'zj-loop', gates: ['root', 'validate'] },
  { id: 'zj-loop-cost', directory: 'tools/zj-loop-cost', role: 'zj-loop', gates: ['root'] },
  { id: 'zj-loop-sync', directory: 'tools/zj-loop-sync', role: 'zj-loop', gates: ['root', 'validate'] },
  {
    id: 'zj-loop-mcp-server',
    directory: 'tools/zj-loop-mcp-server',
    role: 'zj-loop',
    gates: ['root', 'validate'],
  },
  { id: 'zj-goal-audit', directory: 'tools/zj-goal-audit', role: 'zj-goal', gates: ['root'] },
];

const VALID_SCRIPTS = new Set(['build', 'test']);
const VALID_GATES = new Set(['root', 'validate']);

export function getToolPackages() {
  return TOOL_PACKAGES.map((toolPackage) => ({ ...toolPackage }));
}

export function assertValidToolScript(scriptName) {
  if (!VALID_SCRIPTS.has(scriptName)) {
    throw new Error(`Expected one of: ${[...VALID_SCRIPTS].join(', ')}`);
  }
}

export function assertValidGate(gateName) {
  if (!VALID_GATES.has(gateName)) {
    throw new Error(`Expected gate one of: ${[...VALID_GATES].join(', ')}`);
  }
}

export function selectToolPackages({ gate = 'root' } = {}) {
  assertValidGate(gate);
  return getToolPackages().filter((toolPackage) => toolPackage.gates.includes(gate));
}

export function commandForToolPackage(toolPackage, scriptName) {
  assertValidToolScript(scriptName);
  return {
    command: 'npm',
    args: ['--prefix', toolPackage.directory, 'run', scriptName],
  };
}

function spawnCommand(command, args, options) {
  return spawn(command, args, options);
}

async function runCommand(runner, root, toolPackage, command, args, label) {
  console.log(`\n==> ${toolPackage.id} (${toolPackage.role}): ${label}`);
  await new Promise((resolve, reject) => {
    const child = runner(command, args, {
      cwd: root,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${toolPackage.id} ${label} failed` +
            (signal ? ` with signal ${signal}` : ` with exit code ${code}`),
        ),
      );
    });
  });
}

export async function runToolPackageScripts(scriptName, options = {}) {
  assertValidToolScript(scriptName);
  const root = options.root ?? ROOT;
  const packages = options.packages ?? selectToolPackages({ gate: options.gate });
  const runner = options.runner ?? spawnCommand;

  for (const toolPackage of packages) {
    if (options.install) {
      await runCommand(runner, root, toolPackage, 'npm', ['--prefix', toolPackage.directory, 'ci'], 'npm ci');
    }
    const { command, args } = commandForToolPackage(toolPackage, scriptName);
    await runCommand(runner, root, toolPackage, command, args, `npm run ${scriptName}`);
  }
}

export function parseCliArgs(argv) {
  const [scriptName, ...optionArgs] = argv;
  const options = {};
  for (const arg of optionArgs) {
    if (arg === '--install') {
      options.install = true;
    } else if (arg.startsWith('--gate=')) {
      options.gate = arg.slice('--gate='.length);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return { scriptName, options };
}

async function main() {
  try {
    const { scriptName, options } = parseCliArgs(process.argv.slice(2));
    await runToolPackageScripts(scriptName, options);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
