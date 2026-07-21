#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { runCli } from './cli.js';
import { checkVersionConsistency } from './version-consistency.js';

const exitCode = await runCli({
  name: 'zj-loop-version-consistency',
  description: 'Fail closed when generated CI, vendor packages, or the target project version lock drift.',
  usage: 'zj-loop-version-consistency --root <dir> [--provider github|gitlab|all] [--out <file>] [--json]',
  options: [
    { name: 'root', type: 'string', description: 'Project root', default: '.' },
    { name: 'provider', type: 'enum', values: ['github', 'gitlab', 'all'], description: 'Provider scope', default: 'all' },
    { name: 'out', type: 'string', description: 'Write result JSON to a file' },
    { name: 'json', type: 'boolean', description: 'Print JSON output' },
  ],
  async handler({ io, options }) {
    const result = await checkVersionConsistency({ root: String(options.root ?? '.'), provider: String(options.provider ?? 'all') });
    if (typeof options.out === 'string' && options.out.trim()) await writeFile(String(options.out), `${JSON.stringify(result, null, 2)}\n`);
    io.stdout(JSON.stringify(result, null, 2));
    return result.status === 'healthy' ? 0 : 2;
  },
});

process.exitCode = exitCode;
