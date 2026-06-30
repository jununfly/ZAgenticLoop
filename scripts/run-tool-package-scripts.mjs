#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const TOOL_PACKAGES = [
  { id: 'zj-loop-core', directory: 'tools/zj-loop-core', role: 'zj-loop' },
  { id: 'zj-loop-audit', directory: 'tools/zj-loop-audit', role: 'zj-loop' },
  { id: 'zj-loop-init', directory: 'tools/zj-loop-init', role: 'zj-loop' },
  { id: 'zj-loop-cost', directory: 'tools/zj-loop-cost', role: 'zj-loop' },
  { id: 'zj-loop-sync', directory: 'tools/zj-loop-sync', role: 'zj-loop' },
  { id: 'zj-loop-mcp-server', directory: 'tools/zj-loop-mcp-server', role: 'zj-loop' },
  { id: 'goal-audit', directory: 'tools/goal-audit', role: 'companion' },
];

const VALID_SCRIPTS = new Set(['build', 'test']);

export function getToolPackages() {
  return TOOL_PACKAGES.map((toolPackage) => ({ ...toolPackage }));
}

export function assertValidToolScript(scriptName) {
  if (!VALID_SCRIPTS.has(scriptName)) {
    throw new Error(`Expected one of: ${[...VALID_SCRIPTS].join(', ')}`);
  }
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

export async function runToolPackageScripts(scriptName, options = {}) {
  assertValidToolScript(scriptName);
  const root = options.root ?? ROOT;
  const packages = options.packages ?? TOOL_PACKAGES;
  const runner = options.runner ?? spawnCommand;

  for (const toolPackage of packages) {
    const { command, args } = commandForToolPackage(toolPackage, scriptName);
    console.log(`\n==> ${toolPackage.id} (${toolPackage.role}): npm run ${scriptName}`);
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
            `${toolPackage.id} ${scriptName} failed` +
              (signal ? ` with signal ${signal}` : ` with exit code ${code}`),
          ),
        );
      });
    });
  }
}

async function main() {
  const scriptName = process.argv[2];
  try {
    await runToolPackageScripts(scriptName);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
