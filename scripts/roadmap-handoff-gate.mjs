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

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
