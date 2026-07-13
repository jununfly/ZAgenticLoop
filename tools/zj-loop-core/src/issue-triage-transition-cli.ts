#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';

import {
  buildIssueTriageTransitionIssueFixRequestBody,
  buildIssueTriageTransitionIssueFixRequestTitle,
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
    description: 'Build confirmed triage transition request-only evidence from a recommended transition.',
    usage: 'zj-loop-issue-triage-transition confirm-plan [--request <path>] [--root <dir>] [--actor-permission <permission>] [--command <command>] [--confirmation-phrase <phrase>] [--confirmation-mode <mode>] [--confirmation-authority <authority>] [--out <path>] [--json]',
    options: [
      { name: 'commandName', type: 'positional', description: 'Command', default: 'confirm-plan' },
      { name: 'request', type: 'string', description: 'Path to a Recommended Triage Transition JSON file' },
      { name: 'root', type: 'string', description: 'Project root', default: '.' },
      { name: 'actor-permission', type: 'string', description: 'Actor permission', default: 'maintainer' },
      { name: 'command', type: 'string', description: 'Exact slash command text' },
      { name: 'confirmation-phrase', type: 'string', description: 'Fixed confirmation phrase', default: 'CONFIRM_TRIAGE_TRANSITION' },
      { name: 'confirmation-mode', type: 'enum', description: 'Confirmation mode', values: ['human-fixed-phrase', 'trusted-automation'], default: 'human-fixed-phrase' },
      { name: 'confirmation-authority', type: 'string', description: 'Trusted automation authority or human actor identity' },
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
        confirmationMode: String(options['confirmation-mode'] ?? 'human-fixed-phrase'),
        confirmationAuthority: typeof options['confirmation-authority'] === 'string'
          ? options['confirmation-authority']
          : undefined,
      });
      const text = `${JSON.stringify(result, null, 2)}\n`;
      if (typeof options.out === 'string') await writeFile(options.out, text);
      if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      if (result.validation.ok !== true || result.decision.status === 'rejected') return 1;
    },
  }, argv);
} else if (argv[0] === 'request-body') {
  process.exitCode = await runCli({
    name: 'zj-loop-issue-triage-transition',
    description: 'Build an Issue Fix Request carrier body from a confirmed triage transition plan.',
    usage: 'zj-loop-issue-triage-transition request-body --transition-plan <path> [--out <path>] [--title-out <path>] [--json]',
    options: [
      { name: 'commandName', type: 'positional', description: 'Command', default: 'request-body' },
      { name: 'transition-plan', type: 'string', description: 'Path to a confirmed transition plan JSON file' },
      { name: 'out', type: 'string', description: 'Write issue body to this path' },
      { name: 'title-out', type: 'string', description: 'Write issue title to this path' },
      { name: 'json', type: 'boolean', description: 'Print JSON metadata' },
    ],
    async handler({ io, options }) {
      if (typeof options['transition-plan'] !== 'string') throw new Error('--transition-plan is required');
      const plan = await readRecommendedTriageTransition(options['transition-plan']);
      const issueFixRequest = plan?.confirmed_transition?.issue_fix_request;
      if (plan?.decision?.status !== 'confirmed' || !issueFixRequest) {
        throw new Error('transition plan does not contain a confirmed Issue Fix Request');
      }
      const title = buildIssueTriageTransitionIssueFixRequestTitle(issueFixRequest);
      const body = buildIssueTriageTransitionIssueFixRequestBody({
        issueFixRequest,
        triageComment: plan.confirmed_transition.triage_comment,
      });
      if (typeof options.out === 'string') await writeFile(options.out, body);
      if (typeof options['title-out'] === 'string') await writeFile(options['title-out'], `${title}\n`);
      if (options.json === true) {
        io.stdout(JSON.stringify({
          schema: 'zj-loop.issue_triage_transition_request_body_result.v1',
          request_id: issueFixRequest.request_id,
          title,
          body_written: typeof options.out === 'string',
          title_written: typeof options['title-out'] === 'string',
          bytes: body.length,
        }, null, 2));
      } else if (typeof options.out !== 'string') {
        io.stdout(body);
      }
    },
  }, argv);
} else {
  process.exitCode = await runRouteConsumerCli({
    name: 'zj-loop-issue-triage-transition',
    routeId: 'issue-triage-transition',
    description: 'Plan confirmed triage transition execution through the Route Table consumer gate.',
  }, argv);
}
