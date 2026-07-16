#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';

import {
  buildPrStewardExecutionPlan,
  executePrStewardLiveRunner,
  readPrStewardIssueFixRequest,
} from './pr-steward-runner.js';
import { runCli } from './cli.js';
import { runRouteConsumerCli } from './route-consumer-cli.js';
import { fetchGitLabPrStewardReport } from './gitlab-pr-steward-report.js';
import { createGitLabPrStewardIssueFixRequest } from './gitlab-pr-steward-request.js';

const argv = process.argv.slice(2);
if (argv[0] === 'gitlab-issue-fix-request') {
  process.exitCode = await runCli({
    name: 'zj-loop-pr-steward',
    description: 'Create a GitLab PR Steward Issue Fix Request after explicit confirmation.',
    usage: 'zj-loop-pr-steward gitlab-issue-fix-request --report <path> --project <group/project> --confirm <phrase> [--api-url <url>] [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-issue-fix-request' },
      { name: 'report', type: 'string', description: 'Path to GitLab PR Steward report JSON' },
      { name: 'project', type: 'string', description: 'GitLab group/project path' },
      { name: 'confirm', type: 'string', description: 'Fixed Issue Fix Request confirmation phrase' },
      { name: 'api-url', type: 'string', description: 'GitLab API v4 base URL' },
      { name: 'out', type: 'string', description: 'Write result JSON to this path' },
      { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      for (const name of ['report', 'project', 'confirm']) {
        if (typeof options[name] !== 'string' || String(options[name]).trim() === '') throw new Error(`--${name} is required`);
      }
      const report = JSON.parse(await (await import('node:fs/promises')).readFile(String(options.report), 'utf8'));
      const result = await createGitLabPrStewardIssueFixRequest({
        projectPath: String(options.project), report, token: process.env.GITLAB_TOKEN, confirmationPhrase: String(options.confirm),
        apiBaseUrl: typeof options['api-url'] === 'string' ? String(options['api-url']) : undefined,
      });
      const text = `${JSON.stringify(result, null, 2)}\n`;
      if (typeof options.out === 'string') await writeFile(String(options.out), text);
      if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      return result.status === 'completed' ? 0 : 2;
    },
  }, argv);
} else if (argv[0] === 'gitlab-report') {
  process.exitCode = await runCli({
    name: 'zj-loop-pr-steward',
    description: 'Read a GitLab MR and its head pipeline into report-only evidence.',
    usage: 'zj-loop-pr-steward gitlab-report --project <group/project> --merge-request <iid> --signal-id <id> [--api-url <url>] [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-report' },
      { name: 'project', type: 'string', description: 'GitLab group/project path' },
      { name: 'merge-request', type: 'string', description: 'GitLab MR IID' },
      { name: 'signal-id', type: 'string', description: 'Stable report signal id' },
      { name: 'api-url', type: 'string', description: 'GitLab API v4 base URL' },
      { name: 'out', type: 'string', description: 'Write report JSON to this path' },
      { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      for (const name of ['project', 'merge-request', 'signal-id']) {
        if (typeof options[name] !== 'string' || String(options[name]).trim() === '') throw new Error(`--${name} is required`);
      }
      const result = await fetchGitLabPrStewardReport({
        projectPath: String(options.project), mergeRequestIid: String(options['merge-request']), signalId: String(options['signal-id']),
        token: process.env.GITLAB_TOKEN, apiBaseUrl: typeof options['api-url'] === 'string' ? String(options['api-url']) : undefined,
      });
      const text = `${JSON.stringify(result, null, 2)}\n`;
      if (typeof options.out === 'string') await writeFile(String(options.out), text);
      if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      return result.status === 'completed' ? 0 : 2;
    },
  }, argv);
} else if (argv[0] === 'fix-plan') {
  process.exitCode = await runCli({
    name: 'zj-loop-pr-steward',
    description: 'Build PR Steward fix or escalation plan evidence from a consumed Issue Fix Request.',
    usage: 'zj-loop-pr-steward fix-plan --request <path> --current-pr-head-sha <sha> [--repair-command <command>] [--repair-files <csv>] [--live] [--confirm-live-repair <phrase>] [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'fix-plan' },
      { name: 'request', type: 'string', description: 'Path to a consumed Issue Fix Request JSON file' },
      { name: 'current-pr-head-sha', type: 'string', description: 'Current source PR head SHA' },
      { name: 'repair-command', type: 'string', description: 'Deterministic repair command' },
      { name: 'repair-files', type: 'string', description: 'Comma-separated repair files' },
      { name: 'live', type: 'boolean', description: 'Plan live side effects' },
      { name: 'confirm-live-repair', type: 'string', description: 'Fixed confirmation phrase for live repair' },
      { name: 'out', type: 'string', description: 'Write JSON plan to this path' },
      { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      if (typeof options.request !== 'string') throw new Error('--request is required');
      if (typeof options['current-pr-head-sha'] !== 'string') throw new Error('--current-pr-head-sha is required');
      const request = await readPrStewardIssueFixRequest(options.request);
      const plan = buildPrStewardExecutionPlan({
        request,
        currentPrHeadSha: options['current-pr-head-sha'],
        repairCommands: typeof options['repair-command'] === 'string' ? [options['repair-command']] : [],
        repairFiles: typeof options['repair-files'] === 'string'
          ? options['repair-files'].split(',').map((item) => item.trim()).filter(Boolean)
          : [],
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
    name: 'zj-loop-pr-steward',
    description: 'Execute PR Steward live repair or escalation from a consumed Issue Fix Request.',
    usage: 'zj-loop-pr-steward live-repair --request <path> --current-pr-head-sha <sha> --confirm-live-repair <phrase> [--repair-command <command>] [--repair-files <csv>] [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'live-repair' },
      { name: 'request', type: 'string', description: 'Path to a consumed Issue Fix Request JSON file' },
      { name: 'current-pr-head-sha', type: 'string', description: 'Current source PR head SHA' },
      { name: 'repair-command', type: 'string', description: 'Deterministic repair command' },
      { name: 'repair-files', type: 'string', description: 'Comma-separated repair files' },
      { name: 'confirm-live-repair', type: 'string', description: 'Fixed confirmation phrase for live repair' },
      { name: 'out', type: 'string', description: 'Write JSON result to this path' },
      { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      if (typeof options.request !== 'string') throw new Error('--request is required');
      if (typeof options['current-pr-head-sha'] !== 'string') throw new Error('--current-pr-head-sha is required');
      const request = await readPrStewardIssueFixRequest(options.request);
      const plan = buildPrStewardExecutionPlan({
        request,
        currentPrHeadSha: options['current-pr-head-sha'],
        repairCommands: typeof options['repair-command'] === 'string' ? [options['repair-command']] : [],
        repairFiles: typeof options['repair-files'] === 'string'
          ? options['repair-files'].split(',').map((item) => item.trim()).filter(Boolean)
          : [],
        live: true,
        confirmationPhrase: typeof options['confirm-live-repair'] === 'string'
          ? options['confirm-live-repair']
          : '',
      });
      const result = await executePrStewardLiveRunner(plan);
      const text = `${JSON.stringify(result, null, 2)}\n`;
      if (typeof options.out === 'string') await writeFile(options.out, text);
      if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      if (result.outcome !== 'repair-pr') return 1;
    },
  }, argv);
} else {
  process.exitCode = await runRouteConsumerCli({
    name: 'zj-loop-pr-steward',
    routeId: 'pr-steward-fix-request',
    description: 'Plan PR Steward fix-request execution through the Route Table consumer gate.',
  }, argv);
}
