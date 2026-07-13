#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';

import {
  buildDependencySweeperExecutionPlan,
  executeDependencySweeperLiveRunner,
  readIssueFixRequest,
} from './dependency-sweeper-runner.js';
import { runCli } from './cli.js';
import { runRouteConsumerCli } from './route-consumer-cli.js';

const argv = process.argv.slice(2);
if (argv[0] === 'repair-plan') {
  process.exitCode = await runCli({
    name: 'zj-loop-dependency-sweeper',
    description: 'Build Dependency Sweeper repair plan evidence from a consumed Issue Fix Request.',
    usage: 'zj-loop-dependency-sweeper repair-plan --request <path> [--live] [--confirm-live-repair <phrase>] [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'repair-plan' },
      { name: 'request', type: 'string', description: 'Path to a consumed Issue Fix Request JSON file' },
      { name: 'live', type: 'boolean', description: 'Plan live repair side effects' },
      { name: 'confirm-live-repair', type: 'string', description: 'Fixed confirmation phrase for live repair' },
      { name: 'out', type: 'string', description: 'Write JSON plan to this path' },
      { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      if (typeof options.request !== 'string') throw new Error('--request is required');
      const request = await readIssueFixRequest(options.request);
      const plan = buildDependencySweeperExecutionPlan({
        request,
        live: options.live === true,
        confirmationPhrase: typeof options['confirm-live-repair'] === 'string'
          ? options['confirm-live-repair']
          : '',
      });
      const text = `${JSON.stringify(plan, null, 2)}\n`;
      if (typeof options.out === 'string') await writeFile(options.out, text);
      if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      if (plan.status === 'refused') return 1;
    },
  }, argv);
} else if (argv[0] === 'live-repair') {
  process.exitCode = await runCli({
    name: 'zj-loop-dependency-sweeper',
    description: 'Execute Dependency Sweeper live repair from a consumed Issue Fix Request.',
    usage: 'zj-loop-dependency-sweeper live-repair --request <path> --confirm-live-repair <phrase> [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'live-repair' },
      { name: 'request', type: 'string', description: 'Path to a consumed Issue Fix Request JSON file' },
      { name: 'confirm-live-repair', type: 'string', description: 'Fixed confirmation phrase for live repair' },
      { name: 'out', type: 'string', description: 'Write JSON result to this path' },
      { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      if (typeof options.request !== 'string') throw new Error('--request is required');
      const request = await readIssueFixRequest(options.request);
      const plan = buildDependencySweeperExecutionPlan({
        request,
        live: true,
        confirmationPhrase: typeof options['confirm-live-repair'] === 'string'
          ? options['confirm-live-repair']
          : '',
      });
      const result = await executeDependencySweeperLiveRunner(plan);
      const text = `${JSON.stringify(result, null, 2)}\n`;
      if (typeof options.out === 'string') await writeFile(options.out, text);
      if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      if (result.outcome !== 'repair-pr') return 1;
    },
  }, argv);
} else {
  process.exitCode = await runRouteConsumerCli({
    name: 'zj-loop-dependency-sweeper',
    routeId: 'dependency-sweeper',
    description: 'Plan Dependency Sweeper execution through the Route Table consumer gate.',
  }, argv);
}
