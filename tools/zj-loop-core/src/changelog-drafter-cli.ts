#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';

import {
  buildChangelogDrafterExecutionPlan,
  executeChangelogDrafterLiveRunner,
  readChangelogDraftRequest,
} from './changelog-drafter-runner.js';
import { runCli } from './cli.js';
import { runRouteConsumerCli } from './route-consumer-cli.js';

const argv = process.argv.slice(2);
if (argv[0] === 'draft-plan') {
  process.exitCode = await runCli({
    name: 'zj-loop-changelog-drafter',
    description: 'Build Changelog Drafter draft evidence or draft PR plan.',
    usage: 'zj-loop-changelog-drafter draft-plan --request <path> [--draft-mode evidence|pr] [--draft-file <path>] [--live] [--confirm-live-draft <phrase>] [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'draft-plan' },
      { name: 'request', type: 'string', description: 'Path to a changelog draft request JSON file' },
      { name: 'draft-mode', type: 'enum', description: 'Draft output mode', values: ['evidence', 'pr'], default: 'evidence' },
      { name: 'draft-file', type: 'string', description: 'Repository-relative markdown draft file', default: 'docs/release-notes-draft.md' },
      { name: 'live', type: 'boolean', description: 'Plan live side effects' },
      { name: 'confirm-live-draft', type: 'string', description: 'Fixed confirmation phrase for live drafting' },
      { name: 'out', type: 'string', description: 'Write JSON plan to this path' },
      { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      if (typeof options.request !== 'string') throw new Error('--request is required');
      const draftRequest = await readChangelogDraftRequest(options.request);
      const plan = buildChangelogDrafterExecutionPlan({
        draftRequest,
        draftMode: String(options['draft-mode'] ?? 'evidence'),
        draftFile: String(options['draft-file'] ?? 'docs/release-notes-draft.md'),
        live: options.live === true,
        confirmationPhrase: typeof options['confirm-live-draft'] === 'string'
          ? options['confirm-live-draft']
          : '',
      });
      const text = `${JSON.stringify(plan, null, 2)}\n`;
      if (typeof options.out === 'string') await writeFile(options.out, text);
      if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      if (plan.status === 'refused') return 1;
    },
  }, argv);
} else if (argv[0] === 'live-draft') {
  process.exitCode = await runCli({
    name: 'zj-loop-changelog-drafter',
    description: 'Execute Changelog Drafter live draft evidence or draft PR creation.',
    usage: 'zj-loop-changelog-drafter live-draft --request <path> [--draft-mode evidence|pr] [--draft-file <path>] --confirm-live-draft <phrase> [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'live-draft' },
      { name: 'request', type: 'string', description: 'Path to a changelog draft request JSON file' },
      { name: 'draft-mode', type: 'enum', description: 'Draft output mode', values: ['evidence', 'pr'], default: 'evidence' },
      { name: 'draft-file', type: 'string', description: 'Repository-relative markdown draft file', default: 'docs/release-notes-draft.md' },
      { name: 'confirm-live-draft', type: 'string', description: 'Fixed confirmation phrase for live drafting' },
      { name: 'out', type: 'string', description: 'Write JSON result to this path' },
      { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      if (typeof options.request !== 'string') throw new Error('--request is required');
      const draftRequest = await readChangelogDraftRequest(options.request);
      const plan = buildChangelogDrafterExecutionPlan({
        draftRequest,
        draftMode: String(options['draft-mode'] ?? 'evidence'),
        draftFile: String(options['draft-file'] ?? 'docs/release-notes-draft.md'),
        live: true,
        confirmationPhrase: typeof options['confirm-live-draft'] === 'string'
          ? options['confirm-live-draft']
          : '',
      });
      const result = await executeChangelogDrafterLiveRunner(plan);
      const text = `${JSON.stringify(result, null, 2)}\n`;
      if (typeof options.out === 'string') await writeFile(options.out, text);
      if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      if (result.outcome !== 'draft-evidence' && result.outcome !== 'draft-pr') return 1;
    },
  }, argv);
} else {
  process.exitCode = await runRouteConsumerCli({
    name: 'zj-loop-changelog-drafter',
    routeId: 'changelog-drafter-draft-request',
    description: 'Plan Changelog Drafter draft-request execution through the Route Table consumer gate.',
  }, argv);
}
