#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';

import {
  dispatchRoadmapActivationCommand,
  readActivationComments,
} from './roadmap-activation-runner.js';
import { runCli } from './cli.js';
import { findRoute, loadRouteTable } from './route.js';
import { runRouteConsumerCli } from './route-consumer-cli.js';

const argv = process.argv.slice(2);
if (argv[0] === 'activation-plan') {
  process.exitCode = await runCli({
    name: 'zj-loop-roadmap-activation',
    description: 'Build Roadmap-Sliced Development activation request evidence.',
    usage: 'zj-loop-roadmap-activation activation-plan --command-text <cmd> --requested-by <user> --permission <perm> --source-issue <n> --command-comment-id <id> [--comments <path>] [--root <dir>] [--out <path>] [--comment-out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'activation-plan' },
      { name: 'command-text', type: 'string', description: 'Slash command text' },
      { name: 'requested-by', type: 'string', description: 'Requester login' },
      { name: 'permission', type: 'string', description: 'Requester repository permission' },
      { name: 'source-issue', type: 'string', description: 'Source issue number' },
      { name: 'command-comment-id', type: 'string', description: 'Slash command comment id' },
      { name: 'comments', type: 'string', description: 'JSON file containing existing issue comments' },
      { name: 'root', type: 'string', description: 'Project root', default: '.' },
      { name: 'out', type: 'string', description: 'Write JSON result to this path' },
      { name: 'comment-out', type: 'string', description: 'Write activation comment body to this path' },
      { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      for (const key of ['command-text', 'requested-by', 'permission', 'source-issue', 'command-comment-id']) {
        if (typeof options[key] !== 'string') throw new Error(`--${key} is required`);
      }
      const table = await loadRouteTable(String(options.root ?? '.'));
      const route = findRoute(table, 'roadmap-sliced-development');
      const comments = typeof options.comments === 'string' ? await readActivationComments(options.comments) : [];
      const result = dispatchRoadmapActivationCommand({
        route,
        commandText: String(options['command-text']),
        requestedBy: String(options['requested-by']),
        requestedByPermission: String(options.permission),
        sourceIssue: String(options['source-issue']),
        commandCommentId: String(options['command-comment-id']),
        comments,
      });
      const text = `${JSON.stringify({
        action: result.action,
        routeDecision: result.routeDecision,
        commentCreated: Boolean(result.commentBody),
      }, null, 2)}\n`;
      if (typeof options.out === 'string') await writeFile(options.out, text);
      if (typeof options['comment-out'] === 'string' && result.commentBody) {
        await writeFile(options['comment-out'], result.commentBody);
      }
      if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      if (!result.routeDecision.allowed && result.action !== 'denied' && result.action !== 'unsupported-pattern') return 1;
    },
  }, argv);
} else {
  process.exitCode = await runRouteConsumerCli({
    name: 'zj-loop-roadmap-activation',
    routeId: 'roadmap-sliced-development',
    description: 'Plan Roadmap-Sliced Development activation through the Route Table consumer gate.',
  }, argv);
}
