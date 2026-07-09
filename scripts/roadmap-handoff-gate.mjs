#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { parsePostMergeContractFromPrBody } from './post-merge-roadmap-closeout-contract.mjs';

const REQUIRED_PR_BODY_MARKERS = [
  { key: 'verification', label: 'verification notes', patterns: [/verification/i, /验证/] },
  { key: 'closeout', label: 'closeout status', patterns: [/closeout/i, /收尾/] },
  { key: 'durable_docs', label: 'durable docs', patterns: [/durable docs/i, /长期文档/] },
  {
    key: 'branch_cleanup',
    label: 'post-merge branch cleanup plan',
    patterns: [/branch cleanup/i, /delete.*branch/i, /删除.*分支/],
  },
];

export function buildRoadmapHandoffPrBody(input = {}) {
  const roadmapId = requiredString(input.roadmapId, 'roadmapId');
  const branchName = requiredString(input.branchName ?? input.branch, 'branchName');
  const activationCarrierIssue = normalizeOptionalInteger(input.activationCarrierIssue ?? input.carrierIssue);
  const closeCarrierIssue = activationCarrierIssue !== null;
  const verification = normalizeList(input.verification, ['Verification completed; see commit and CI evidence.']);
  const durableDocs = normalizeList(input.durableDocs, ['Durable docs updated or confirmed not required.']);
  const closeoutStatus = input.closeoutStatus ?? 'complete';
  const closeoutCommit = input.closeoutCommit ?? 'included in this PR';
  const branchCleanupPlan =
    input.branchCleanupPlan ?? `Delete ${branchName} after merge via post-merge roadmap closeout.`;
  const noPendingFollowups = input.noPendingFollowups !== false;

  const contractLines = [
    'kind: zj-loop.post-merge-contract',
    'version: 1',
    'consumer: post-merge-cleanup',
    'mode: roadmap-closeout',
    'roadmap:',
    `  id: ${roadmapId}`,
    `  branch: ${branchName}`,
    'carrier:',
    activationCarrierIssue === null ? '  issue: null' : `  issue: ${activationCarrierIssue}`,
    'cleanup:',
    '  delete_merged_branch: true',
    `  close_carrier_issue: ${closeCarrierIssue ? 'true' : 'false'}`,
    'safety:',
    '  require_pr_merged: true',
    '  require_branch_merged: true',
    `  no_pending_followups: ${noPendingFollowups ? 'true' : 'false'}`,
    '  missing_contract_behavior: report-only',
  ];

  return [
    '## Summary',
    '',
    input.summary ?? `Complete roadmap ${roadmapId}.`,
    '',
    '## Verification',
    '',
    ...verification.map((item) => `- ${item}`),
    '',
    '## Closeout Status',
    '',
    `- Closeout status: ${closeoutStatus}`,
    `- Closeout commit: ${closeoutCommit}`,
    '- Process roadmap files: removed or promoted into durable docs before PR handoff.',
    '',
    '## Durable Docs',
    '',
    ...durableDocs.map((item) => `- ${item}`),
    '',
    '## Branch Cleanup',
    '',
    `- ${branchCleanupPlan}`,
    '',
    '## Post-Merge Contract',
    '',
    '```yaml',
    ...contractLines,
    '```',
    '',
  ].join('\n');
}

export function evaluateRoadmapHandoffGate(input = {}) {
  const errors = [];
  const warnings = [];
  const branch = input.branchName ?? input.branch ?? '';
  const pr = input.pr ?? {};
  const prBody = String(pr.body ?? input.prBody ?? '');

  if (!input.roadmapId) errors.push('roadmapId is required');
  if (!branch) errors.push('branchName is required');
  if (branch && !branch.startsWith('zjal/')) errors.push('branchName must use zjal/<roadmap-id>');
  if (branch && ['main', 'master', 'develop', 'dev'].includes(branch)) {
    errors.push('branchName must not be a protected or long-lived branch');
  }

  if (input.workingTreeClean !== true) {
    errors.push('workingTreeClean must be true before PR handoff');
  }
  if (input.branchPushed !== true) {
    errors.push('branchPushed must be true before roadmap loop can be complete');
  }

  if (!pr.url && !Number.isInteger(pr.number)) {
    errors.push('PR must be opened or updated before roadmap loop can be complete');
  }
  if (pr.headRefName && branch && pr.headRefName !== branch) {
    errors.push('PR headRefName must match branchName');
  }
  if (pr.baseRefName && pr.baseRefName !== 'main') {
    warnings.push('PR baseRefName is not main');
  }

  for (const marker of REQUIRED_PR_BODY_MARKERS) {
    if (!marker.patterns.some((pattern) => pattern.test(prBody))) {
      errors.push(`PR body must include ${marker.label}`);
    }
  }

  const contractResult = parsePostMergeContractFromPrBody(prBody);
  if (!contractResult.ok) {
    errors.push('PR body must include a zj-loop.post-merge-contract YAML block');
  } else {
    const contract = contractResult.contract;
    if (contract.roadmap?.id !== input.roadmapId) {
      errors.push('post-merge contract roadmap.id must match roadmapId');
    }
    if (contract.roadmap?.branch !== branch) {
      errors.push('post-merge contract roadmap.branch must match branchName');
    }
    if (contract.cleanup?.delete_merged_branch !== true) {
      errors.push('post-merge contract must plan delete_merged_branch: true');
    }
  }

  if (input.closeoutCommitPresent !== true) {
    errors.push('closeoutCommitPresent must be true before PR handoff');
  }
  if (input.processFilesRemoved !== true) {
    errors.push('processFilesRemoved must be true, unless explicitly promoted to durable docs');
  }

  return {
    status: errors.length === 0 ? 'passed' : 'blocked',
    gate: 'roadmap-handoff',
    errors,
    warnings,
    summary:
      errors.length === 0
        ? 'Roadmap handoff gate passed: branch pushed, PR handoff exists, and closeout evidence is reviewable.'
        : 'Roadmap handoff gate blocked: closeout commit is not sufficient for roadmap loop completion.',
  };
}

async function main() {
  const input = await readInput();
  if (process.argv.includes('--render-pr-body')) {
    const body = buildRoadmapHandoffPrBody(input);
    if (process.env.ROADMAP_HANDOFF_PR_BODY_OUT) {
      await writeFile(process.env.ROADMAP_HANDOFF_PR_BODY_OUT, body);
    }
    console.log(body);
    return;
  }

  const result = evaluateRoadmapHandoffGate(input);

  if (process.env.ROADMAP_HANDOFF_GATE_OUT) {
    await writeFile(process.env.ROADMAP_HANDOFF_GATE_OUT, `${JSON.stringify(result, null, 2)}\n`);
  }

  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'passed') process.exit(1);
}

async function readInput() {
  if (process.env.ROADMAP_HANDOFF_GATE_JSON) {
    return JSON.parse(process.env.ROADMAP_HANDOFF_GATE_JSON);
  }
  if (process.env.ROADMAP_HANDOFF_GATE_PATH) {
    return JSON.parse(await readFile(process.env.ROADMAP_HANDOFF_GATE_PATH, 'utf8'));
  }
  throw new Error('Set ROADMAP_HANDOFF_GATE_JSON or ROADMAP_HANDOFF_GATE_PATH');
}

function requiredString(value, key) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${key} is required`);
  return text;
}

function normalizeList(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => String(item ?? '').trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function normalizeOptionalInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
