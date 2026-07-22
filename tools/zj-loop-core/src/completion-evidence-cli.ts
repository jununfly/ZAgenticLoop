#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { runCli } from './cli.js';
import { validateCompletionEvidence } from './completion-evidence.js';

const exitCode = await runCli({
  name: 'zj-loop-completion-evidence',
  description: 'Validate a shared producer/carrier/consumer completion evidence contract.',
  usage: 'zj-loop-completion-evidence --evidence <file> [--expected <file>] [--allow-side-effects] [--out <file>] [--json]',
  options: [
    { name: 'evidence', type: 'string', description: 'Completion evidence JSON file' },
    { name: 'expected', type: 'string', description: 'Expected identity JSON file' },
    { name: 'allowSideEffects', flag: 'allow-side-effects', type: 'boolean', description: 'Explicitly allow side-effect evidence' },
    { name: 'out', type: 'string', description: 'Write validation result JSON to a file' },
    { name: 'json', type: 'boolean', description: 'Print JSON output' },
  ],
  async handler({ io, options }) {
    if (typeof options.evidence !== 'string' || !options.evidence.trim()) throw new Error('--evidence is required');
    const evidence = JSON.parse(await readFile(options.evidence, 'utf8'));
    const expected = typeof options.expected === 'string'
      ? JSON.parse(await readFile(options.expected, 'utf8'))
      : undefined;
    const result = validateCompletionEvidence(evidence, {
      expected,
      allowSideEffects: options.allowSideEffects === true,
    });
    const output = JSON.stringify(result, null, 2);
    if (typeof options.out === 'string' && options.out.trim()) await writeFile(options.out, `${output}\n`);
    io.stdout(options.json === true ? output : `${result.status}${result.errors.length ? `: ${result.errors.join('; ')}` : ''}`);
    return result.ok ? 0 : 2;
  },
});

process.exitCode = exitCode;
