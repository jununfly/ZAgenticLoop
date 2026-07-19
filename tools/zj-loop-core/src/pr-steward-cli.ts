#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

import {
  buildPrStewardExecutionPlan,
  executePrStewardLiveRunner,
  readPrStewardIssueFixRequest,
} from './pr-steward-runner.js';
import { runCli } from './cli.js';
import { runRouteConsumerCli } from './route-consumer-cli.js';
import { fetchGitLabPrStewardReport } from './gitlab-pr-steward-report.js';
import { createGitLabPrStewardIssueFixRequest } from './gitlab-pr-steward-request.js';
import { claimGitLabPrStewardIssueFixRequest } from './gitlab-pr-steward-claim.js';
import { appendGitLabPrStewardEscalation } from './gitlab-pr-steward-escalation.js';
import { verifyGitLabPrStewardScope } from './gitlab-pr-steward-verifier.js';

const argv = process.argv.slice(2);
if (argv[0] === 'gitlab-verifier-scope') {
  process.exitCode = await runCli({
    name: 'zj-loop-pr-steward', description: 'Verify GitLab PR Steward scope and verifier binding without provider writes.',
    usage: 'zj-loop-pr-steward gitlab-verifier-scope --project <group/project> --issue-iid <iid> --merge-request <iid> --request-id <id> --claim-id <id> --current-head-sha <sha> --requested-scope <scope> --requested-verifier <verifier> [--api-url <url>] [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-verifier-scope' },
      { name: 'project', type: 'string', description: 'GitLab group/project path' }, { name: 'issue-iid', type: 'string', description: 'Carrier Issue IID' },
      { name: 'merge-request', type: 'string', description: 'Source MR IID' }, { name: 'request-id', type: 'string', description: 'Issue Fix Request id' },
      { name: 'claim-id', type: 'string', description: 'Claim id' }, { name: 'current-head-sha', type: 'string', description: 'Current source MR head SHA' },
      { name: 'requested-scope', type: 'string', description: 'Scope to verify' }, { name: 'requested-verifier', type: 'string', description: 'Verifier to verify' },
      { name: 'api-url', type: 'string', description: 'GitLab API v4 base URL' }, { name: 'out', type: 'string', description: 'Write verifier result JSON to this path' },
      { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      for (const name of ['project', 'issue-iid', 'merge-request', 'request-id', 'claim-id', 'current-head-sha', 'requested-scope', 'requested-verifier']) {
        if (typeof options[name] !== 'string' || String(options[name]).trim() === '') throw new Error(`--${name} is required`);
      }
      const result = await verifyGitLabPrStewardScope({
        projectPath: String(options.project), issueIid: String(options['issue-iid']), mergeRequestIid: String(options['merge-request']),
        requestId: String(options['request-id']), claimId: String(options['claim-id']), currentHeadSha: String(options['current-head-sha']),
        requestedScope: String(options['requested-scope']), requestedVerifier: String(options['requested-verifier']), token: process.env.GITLAB_TOKEN,
        apiBaseUrl: typeof options['api-url'] === 'string' ? String(options['api-url']) : undefined,
      });
      const text = `${JSON.stringify(result, null, 2)}\n`; if (typeof options.out === 'string') await writeFile(String(options.out), text); if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      return result.status === 'completed' ? 0 : 2;
    },
  }, argv);
} else if (argv[0] === 'gitlab-escalation') {
  process.exitCode = await runCli({
    name: 'zj-loop-pr-steward', description: 'Append verifier-backed GitLab PR Steward escalation evidence to the claimed carrier.',
    usage: 'zj-loop-pr-steward gitlab-escalation --project <group/project> --issue-iid <iid> --merge-request <iid> --request-id <id> --claim-id <id> --current-head-sha <sha> --reason <reason> [--api-url <url>] [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-escalation' },
      { name: 'project', type: 'string', description: 'GitLab group/project path' }, { name: 'issue-iid', type: 'string', description: 'Carrier Issue IID' },
      { name: 'merge-request', type: 'string', description: 'Source MR IID' }, { name: 'request-id', type: 'string', description: 'Issue Fix Request id' },
      { name: 'claim-id', type: 'string', description: 'Claim id' }, { name: 'current-head-sha', type: 'string', description: 'Current source MR head SHA' },
      { name: 'reason', type: 'string', description: 'Deterministic escalation reason' }, { name: 'api-url', type: 'string', description: 'GitLab API v4 base URL' },
      { name: 'out', type: 'string', description: 'Write escalation result JSON to this path' }, { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      for (const name of ['project', 'issue-iid', 'merge-request', 'request-id', 'claim-id', 'current-head-sha', 'reason']) {
        if (typeof options[name] !== 'string' || String(options[name]).trim() === '') throw new Error(`--${name} is required`);
      }
      const result = await appendGitLabPrStewardEscalation({
        projectPath: String(options.project), issueIid: String(options['issue-iid']), mergeRequestIid: String(options['merge-request']),
        requestId: String(options['request-id']), claimId: String(options['claim-id']), currentHeadSha: String(options['current-head-sha']), reason: String(options.reason),
        token: process.env.GITLAB_TOKEN, apiBaseUrl: typeof options['api-url'] === 'string' ? String(options['api-url']) : undefined,
      });
      const text = `${JSON.stringify(result, null, 2)}\n`; if (typeof options.out === 'string') await writeFile(String(options.out), text); if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      return result.status === 'completed' ? 0 : 2;
    },
  }, argv);
} else if (argv[0] === 'gitlab-claim') {
  process.exitCode = await runCli({
    name: 'zj-loop-pr-steward',
    description: 'Claim a GitLab PR Steward Issue Fix Request after source MR head verification.',
    usage: 'zj-loop-pr-steward gitlab-claim --project <group/project> --issue-iid <iid> --merge-request <iid> --request-id <id> --claim-id <id> --current-head-sha <sha> [--api-url <url>] [--out <path>] [--json]',
    options: [
      { name: 'command', type: 'positional', description: 'Command', default: 'gitlab-claim' },
      { name: 'project', type: 'string', description: 'GitLab group/project path' },
      { name: 'issue-iid', type: 'string', description: 'Carrier Issue IID' },
      { name: 'merge-request', type: 'string', description: 'Source MR IID' },
      { name: 'request-id', type: 'string', description: 'Issue Fix Request id' },
      { name: 'claim-id', type: 'string', description: 'Deterministic claim id' },
      { name: 'current-head-sha', type: 'string', description: 'Current source MR head SHA' },
      { name: 'api-url', type: 'string', description: 'GitLab API v4 base URL' },
      { name: 'out', type: 'string', description: 'Write claim result JSON to this path' },
      { name: 'json', type: 'boolean', description: 'Print JSON output' },
    ],
    async handler({ io, options }) {
      for (const name of ['project', 'issue-iid', 'merge-request', 'request-id', 'claim-id', 'current-head-sha']) {
        if (typeof options[name] !== 'string' || String(options[name]).trim() === '') throw new Error(`--${name} is required`);
      }
      const result = await claimGitLabPrStewardIssueFixRequest({
        projectPath: String(options.project), issueIid: String(options['issue-iid']), mergeRequestIid: String(options['merge-request']), requestId: String(options['request-id']), claimId: String(options['claim-id']), currentHeadSha: String(options['current-head-sha']), token: process.env.GITLAB_TOKEN,
        apiBaseUrl: typeof options['api-url'] === 'string' ? String(options['api-url']) : undefined,
      });
      const text = `${JSON.stringify(result, null, 2)}\n`;
      if (typeof options.out === 'string') await writeFile(String(options.out), text);
      if (options.json === true || typeof options.out !== 'string') io.stdout(text.trimEnd());
      return result.status === 'completed' ? 0 : 2;
    },
  }, argv);
} else if (argv[0] === 'gitlab-issue-fix-request') {
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
      const report = JSON.parse(await readFile(String(options.report), 'utf8'));
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
