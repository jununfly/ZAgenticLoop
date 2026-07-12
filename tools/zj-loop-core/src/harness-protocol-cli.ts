#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { defaultCliIo, runCli, type CliIo } from './cli.js';
import {
  recordLoopRunMetrics,
  renderLoopProtocolOutputMarkdown,
  validateLoopProtocolInput,
  validateLoopProtocolOutput,
} from './harness-protocol-contract.js';

const SPEC = {
  name: 'zj-loop-harness-protocol',
  description: 'Validate and render ZJ Loop harness protocol objects.',
  usage: 'zj-loop-harness-protocol <validate-input|validate-output|render-output|record-metrics> <file> [--expect-status <status>]',
  options: [
    { name: 'command', type: 'positional' as const, description: 'Command' },
    { name: 'file', type: 'positional' as const, description: 'JSON file' },
    { name: 'expectStatus', flag: 'expect-status', type: 'string' as const, description: 'Expected output status' },
  ],
  async handler({ io, options }: { io: CliIo; options: Record<string, string | boolean | undefined> }) {
    const command = String(options.command ?? '');
    const file = String(options.file ?? '');
    if (!command) throw new Error('command is required');
    if (!file) throw new Error('file is required');

    const json = JSON.parse(await readFile(file, 'utf8'));

    if (command === 'validate-input') {
      const validation = validateLoopProtocolInput(json);
      if (!validation.ok) {
        io.stderr(validation.errors.join('\n'));
        return 1;
      }
      io.stdout(JSON.stringify({ ok: true, errors: [] }, null, 2));
      return 0;
    }

    if (command === 'record-metrics') {
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('metrics input must be an object');
      }
      if (typeof json.run_id !== 'string' || json.run_id.trim() === '') {
        throw new Error('metrics input run_id is required');
      }
      if (!Array.isArray(json.outputs)) {
        throw new Error('metrics input outputs must be an array');
      }
      io.stdout(JSON.stringify(recordLoopRunMetrics({
        run_id: json.run_id,
        outputs: json.outputs,
      }), null, 2));
      return 0;
    }

    const validation = validateLoopProtocolOutput(json);
    if (options.expectStatus && json?.status !== options.expectStatus) {
      validation.errors.push(`status must be ${String(options.expectStatus)}`);
    }

    if (command === 'validate-output') {
      if (!validation.ok || validation.errors.length > 0) {
        io.stderr(validation.errors.join('\n'));
        return 1;
      }
      io.stdout(JSON.stringify({ ok: true, errors: [] }, null, 2));
      return 0;
    }

    if (command === 'render-output') {
      if (!validation.ok || validation.errors.length > 0) {
        io.stderr(validation.errors.join('\n'));
        return 1;
      }
      io.stdout(renderLoopProtocolOutputMarkdown(json));
      return 0;
    }

    throw new Error(`unsupported command ${command}`);
  },
};

export function runHarnessProtocolCli(argv = process.argv.slice(2), io: CliIo = defaultCliIo) {
  return runCli(SPEC, argv, io);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runHarnessProtocolCli();
}
