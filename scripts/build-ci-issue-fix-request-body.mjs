#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { buildIssueFixRequestComment } from './issue-fix-request-contract.mjs';
import { buildIssueFixRequestFromDecision } from './issue-fix-request-dispatcher.mjs';

export function buildCiIssueFixRequestBody(routeDecision) {
  const signal = {
    signal_id: routeDecision.signal_id,
    source: routeDecision.source ?? 'ci',
    summary: routeDecision.subject,
    source_url: routeDecision.source_url,
    repo: process.env.GITHUB_REPOSITORY ?? 'jununfly/ZAgenticLoop',
    source_run_id: routeDecision.source_run_id,
    fix_scope: {
      files_or_areas: ['scripts/', '.github/workflows/', 'zj-loop/'],
      non_goals: ['auto-merge'],
    },
    verification_commands: [
      'bash scripts/ci-validate-gates.sh',
      'bash scripts/ci-audit-gates.sh',
    ],
  };
  const request = buildIssueFixRequestFromDecision({
    signal,
    routeDecision,
    createdAt: routeDecision.created_at,
  });

  return [
    `# Issue Fix Request: ${routeDecision.route}`,
    '',
    buildIssueFixRequestComment(request).trim(),
    '',
    '## Human-readable summary',
    '',
    `- Source signal: \`${routeDecision.signal_id}\``,
    `- Route decision: \`${routeDecision.decision_id}\``,
    `- Consumer: \`${routeDecision.target_consumer}\``,
    `- Dedupe key: \`${routeDecision.dedupe_key}\``,
    `- Source URL: ${routeDecision.source_url || '(none)'}`,
    '',
    'The Fix Consumer must open a verifier-backed Fix PR or append failed/escalation evidence.',
    '',
  ].join('\n');
}

async function main() {
  const inputPath = process.env.ROUTE_DECISION_PATH || '/tmp/zj-loop-ci-route-decision.json';
  const outputPath = process.env.ISSUE_FIX_REQUEST_BODY_OUT || '/tmp/zj-loop-issue-fix-request.md';
  const routeDecision = JSON.parse(await readFile(inputPath, 'utf8'));
  await writeFile(outputPath, buildCiIssueFixRequestBody(routeDecision));
  console.log(outputPath);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
