#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const CI_SWEEPER_LIFECYCLE_KINDS = [
  'existing_repair_pr',
  'existing_issue_fix_request',
  'existing_escalation_issue',
  'none',
];

export function classifyCiSweeperLifecycle(input = {}) {
  const base = {
    dedupe_key: String(input.dedupeKey ?? ''),
    source_workflow: String(input.sourceWorkflow ?? ''),
    source_run_id: String(input.sourceRunId ?? ''),
    request_branch: String(input.requestBranch ?? ''),
  };

  const repairPrNumber = normalizeNumber(input.repairPrNumber);
  if (repairPrNumber) {
    return existingLifecycle({
      ...base,
      kind: 'existing_repair_pr',
      ref: `PR #${repairPrNumber}`,
      ref_number: repairPrNumber,
    });
  }

  const issueFixRequestNumber = normalizeNumber(input.issueFixRequestNumber);
  if (issueFixRequestNumber) {
    return existingLifecycle({
      ...base,
      kind: 'existing_issue_fix_request',
      ref: `issue #${issueFixRequestNumber}`,
      ref_number: issueFixRequestNumber,
    });
  }

  const escalationIssueNumber = normalizeNumber(input.escalationIssueNumber);
  if (escalationIssueNumber) {
    return existingLifecycle({
      ...base,
      kind: 'existing_escalation_issue',
      ref: `issue #${escalationIssueNumber}`,
      ref_number: escalationIssueNumber,
      repeated_failed_repair_allowed: false,
    });
  }

  return {
    ...base,
    kind: 'none',
    ref: '',
    ref_number: '',
    dispatch_allowed: true,
    create_issue_fix_request_allowed: true,
    next_action: 'create-issue-fix-request-and-dispatch',
    loop_prevention: {
      existing_lifecycle_found: false,
      repeated_failed_repair_allowed: true,
    },
  };
}

export function buildCiSweeperLifecycleStateEvidence(lifecycle) {
  const normalized = lifecycle ?? classifyCiSweeperLifecycle();
  const lines = [`- CI Sweeper existing lifecycle: \`${normalized.kind}\``];
  if (normalized.source_run_id) lines.push(`  - Source run: \`${normalized.source_run_id}\``);
  if (normalized.dedupe_key) lines.push(`  - Dedupe key: \`${normalized.dedupe_key}\``);
  if (normalized.request_branch) lines.push(`  - Request branch: \`${normalized.request_branch}\``);
  if (normalized.ref) lines.push(`  - Existing request: ${normalized.ref}`);

  if (normalized.kind === 'none') {
    lines.push('  - Action: create Issue Fix Request and dispatch CI Sweeper.');
  } else {
    lines.push('  - Action: no dispatch; no new Issue Fix Request.');
  }

  return `${lines.join('\n')}\n`;
}

function existingLifecycle(input) {
  return {
    ...input,
    dispatch_allowed: false,
    create_issue_fix_request_allowed: false,
    next_action: 'report-existing-lifecycle',
    loop_prevention: {
      existing_lifecycle_found: true,
      repeated_failed_repair_allowed: input.repeated_failed_repair_allowed ?? true,
    },
  };
}

function normalizeNumber(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'null') return '';
  return normalized;
}

async function main() {
  const lifecycle = classifyCiSweeperLifecycle({
    dedupeKey: process.env.DEDUPE_KEY,
    sourceWorkflow: process.env.SOURCE_WORKFLOW,
    sourceRunId: process.env.SOURCE_RUN_ID,
    requestBranch: process.env.REQUEST_BRANCH,
    repairPrNumber: process.env.REPAIR_PR_NUMBER,
    issueFixRequestNumber: process.env.ISSUE_FIX_REQUEST_NUMBER,
    escalationIssueNumber: process.env.ESCALATION_ISSUE_NUMBER,
  });
  const evidence = buildCiSweeperLifecycleStateEvidence(lifecycle);

  if (process.env.LIFECYCLE_JSON_OUT) {
    await writeFile(process.env.LIFECYCLE_JSON_OUT, `${JSON.stringify(lifecycle, null, 2)}\n`);
  }
  if (process.env.STATE_EVIDENCE_OUT) {
    await writeFile(process.env.STATE_EVIDENCE_OUT, evidence);
  }
  if (process.env.GITHUB_OUTPUT) {
    const lines = [
      `kind=${lifecycle.kind}`,
      `ref=${lifecycle.ref}`,
      `ref_number=${lifecycle.ref_number}`,
      `dispatch_allowed=${lifecycle.dispatch_allowed ? 'true' : 'false'}`,
      `create_issue_fix_request_allowed=${lifecycle.create_issue_fix_request_allowed ? 'true' : 'false'}`,
      `next_action=${lifecycle.next_action}`,
    ];
    await writeFile(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, { flag: 'a' });
  }

  console.log(JSON.stringify(lifecycle, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
