#!/usr/bin/env node
import { runCli } from './cli.js';
import { closeoutWorkspaceReview, WORKSPACE_CLOSEOUT_CONFIRMATION_PHRASE } from './workspace-closeout.js';

const exitCode = await runCli({
  name: 'zj-loop-workspace-closeout',
  description: 'Archive a verified Workspace Adapter activation carrier and record local closeout evidence.',
  usage: 'zj-loop-workspace-closeout --orchestration <id> [--root <dir>] [--confirm ACCEPT_LOCAL_REVIEW_ARTIFACT] [--now <ISO-8601>]',
  options: [
    { name: 'orchestration', type: 'string', description: 'Workspace orchestration id' },
    { name: 'root', type: 'string', description: 'Project root', default: '.' },
    { name: 'confirm', type: 'string', description: `Required to archive the carrier: ${WORKSPACE_CLOSEOUT_CONFIRMATION_PHRASE}` },
    { name: 'now', type: 'string', description: 'Deterministic timestamp for automation/tests' },
  ],
  async handler({ io, options }) {
    if (typeof options.orchestration !== 'string' || !options.orchestration.trim()) {
      throw new Error('--orchestration is required');
    }
    const result = await closeoutWorkspaceReview({
      root: String(options.root ?? '.'),
      orchestrationId: options.orchestration,
      confirmation: typeof options.confirm === 'string' ? options.confirm : undefined,
      now: typeof options.now === 'string' ? options.now : new Date().toISOString(),
    });
    io.stdout(JSON.stringify(result, null, 2));
    return result.status === 'completed' ? 0 : 2;
  },
});

process.exitCode = exitCode;
