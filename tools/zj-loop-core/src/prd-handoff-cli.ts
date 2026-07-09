#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';

import {
  buildPrdHandoffRequest,
  readPrdHandoffRequest,
  runPrdHandoffRunner,
} from './prd-handoff-runner.js';
import { runCli } from './cli.js';

process.exitCode = await runCli({
  name: 'zj-loop-prd-handoff',
  description: 'Build a deterministic PRD issue next-command handoff plan.',
  usage: 'zj-loop-prd-handoff handoff-plan [--request <path>] [--prd-issue-url <url>] [--next-command <text>] [--mode report-only|comment-enabled] [--out <path>] [--comment-out <path>] [--json]',
  options: [
    { name: 'command', type: 'positional', description: 'Command', default: 'handoff-plan' },
    { name: 'request', type: 'string', description: 'Path to a PRD handoff request JSON file' },
    { name: 'prd-issue-url', type: 'string', description: 'GitHub PRD issue URL' },
    { name: 'next-command', type: 'string', description: 'Exact next command to hand off' },
    { name: 'detected-by', type: 'string', description: 'Detector name', default: 'daily-triage' },
    { name: 'detected-at', type: 'string', description: 'Detection timestamp' },
    { name: 'mode', type: 'enum', values: ['report-only', 'comment-enabled'], description: 'Handoff mode', default: 'report-only' },
    { name: 'out', type: 'string', description: 'Write JSON result to this path' },
    { name: 'comment-out', type: 'string', description: 'Write planned comment body to this path' },
    { name: 'json', type: 'boolean', description: 'Print JSON output' },
  ],
  async handler({ io, options }) {
    if (options.command !== 'handoff-plan') throw new Error(`Unsupported command: ${String(options.command)}`);
    const request = typeof options.request === 'string'
      ? await readPrdHandoffRequest(options.request)
      : buildPrdHandoffRequest({
          prd_issue_url: typeof options['prd-issue-url'] === 'string' ? options['prd-issue-url'] : undefined,
          next_command: typeof options['next-command'] === 'string' ? options['next-command'] : undefined,
          detected_by: String(options['detected-by'] ?? 'daily-triage'),
          detected_at: typeof options['detected-at'] === 'string' ? options['detected-at'] : undefined,
          mode: options.mode === 'comment-enabled' ? 'comment-enabled' : 'report-only',
        });
    const result = runPrdHandoffRunner({ request });
    const text = `${JSON.stringify(result, null, 2)}\n`;
    if (typeof options.out === 'string') await writeFile(options.out, text);
    if (typeof options['comment-out'] === 'string') await writeFile(options['comment-out'], result.comment_body);
    if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
    if (result.validation.ok !== true || result.decision.status === 'rejected') return 1;
  },
});
