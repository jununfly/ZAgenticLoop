#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';

import {
  buildRecommendedTriageTransitionFixture,
  readRecommendedTriageTransition,
  runIssueTriageTransitionRunner,
} from './issue-triage-transition-runner.js';
import { runCli } from './cli.js';
import { findRoute, loadRouteTable } from './route.js';
import { runRouteConsumerCli } from './route-consumer-cli.js';

const argv = process.argv.slice(2);
if (argv[0] === 'confirm-plan') {
  process.exitCode = await runCli({
    name: 'zj-loop-issue-triage-transition',
    description: 'Build confirmed triage transition dry-run evidence from a recommended transition.',
    usage: 'zj-loop-issue-triage-transition confirm-plan [--request <path>] [--root <dir>] [--actor-permission <permission>] [--command <command>] [--confirmation-phrase <phrase>] [--out <path>] [--json]',
    options: [
      { name: 'commandName', type: 'positional', description: 'Command', default: 'confirm-plan' },
      { name: 'request', type: 'string', description: 'Path to a Recommended Triage Transition JSON file' },
      { name: 'root', type: 'string', description: 'Project root', default: '.' },
      { name: 'actor-permission', type: 'string', description: 'Actor permission', default: 'maintainer' },
      { name: 'command', type: 'string', description: 'Exact slash command text' },
      { name: 'confirmation-phrase', type: 'string', description: 'Fixed confirmation phrase', default: 'CONFIRM_TRIAGE_TRANSITION' },
      { name: 'out', type: 'string', description: 'Write JSON result to this path' },
      { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      const table = await loadRouteTable(String(options.root ?? '.'));
      const route = findRoute(table, 'issue-triage-transition');
      const request = typeof options.request === 'string'
        ? await readRecommendedTriageTransition(options.request)
        : buildRecommendedTriageTransitionFixture();
      const result = runIssueTriageTransitionRunner({
        route,
        request,
        actorPermission: String(options['actor-permission'] ?? 'maintainer'),
        command: typeof options.command === 'string' ? options.command : undefined,
        confirmationPhrase: String(options['confirmation-phrase'] ?? 'CONFIRM_TRIAGE_TRANSITION'),
      });
      const text = `${JSON.stringify(result, null, 2)}\n`;
      if (typeof options.out === 'string') await writeFile(options.out, text);
      if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      if (result.validation.ok !== true || result.decision.status === 'rejected') return 1;
    },
  }, argv);
} else {
  process.exitCode = await runRouteConsumerCli({
    name: 'zj-loop-issue-triage-transition',
    routeId: 'issue-triage-transition',
    description: 'Plan confirmed triage transition execution through the Route Table consumer gate.',
  }, argv);
}
