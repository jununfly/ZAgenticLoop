#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import yaml from 'yaml';

export const POST_MERGE_CONTRACT_KIND = 'zj-loop.post-merge-contract';
export const POST_MERGE_CONTRACT_VERSION = 1;
export const POST_MERGE_CONTRACT_CONSUMER = 'post-merge-cleanup';
export const POST_MERGE_CONTRACT_MODE = 'roadmap-closeout';

const YAML_FENCE_PATTERN = /```(?:yaml|yml)\s*\n(?<yaml>[\s\S]*?)```/g;

export function parsePostMergeContractFromPrBody(body) {
  const text = String(body ?? '');

  for (const match of text.matchAll(YAML_FENCE_PATTERN)) {
    try {
      const parsed = yaml.parse(match.groups.yaml);
      if (parsed?.kind !== POST_MERGE_CONTRACT_KIND) continue;
      return {
        ok: true,
        contract: parsed,
        reason: 'contract-found',
        errors: [],
      };
    } catch (error) {
      return {
        ok: false,
        contract: null,
        reason: 'invalid-yaml',
        errors: [`invalid yaml: ${error.message}`],
      };
    }
  }

  return {
    ok: false,
    contract: null,
    reason: 'missing-contract',
    errors: ['missing post-merge contract'],
  };
}

export function validatePostMergeContract(contract, { pr } = {}) {
  const errors = [];
  if (!contract || typeof contract !== 'object') {
    return { ok: false, errors: ['contract must be an object'], guards: buildGuards({ pr, contract }) };
  }

  if (contract.kind !== POST_MERGE_CONTRACT_KIND) {
    errors.push(`kind must be ${POST_MERGE_CONTRACT_KIND}`);
  }
  if (contract.version !== POST_MERGE_CONTRACT_VERSION) {
    errors.push(`version must be ${POST_MERGE_CONTRACT_VERSION}`);
  }
  if (contract.consumer !== POST_MERGE_CONTRACT_CONSUMER) {
    errors.push(`consumer must be ${POST_MERGE_CONTRACT_CONSUMER}`);
  }
  if (contract.mode !== POST_MERGE_CONTRACT_MODE) {
    errors.push(`mode must be ${POST_MERGE_CONTRACT_MODE}`);
  }
  if (!contract.roadmap?.id) {
    errors.push('roadmap.id is required');
  }
  if (!contract.roadmap?.branch) {
    errors.push('roadmap.branch is required');
  }
  if (contract.roadmap?.branch && pr?.headRefName && contract.roadmap.branch !== pr.headRefName) {
    errors.push('roadmap.branch must match PR head branch');
  }
  if (contract.roadmap?.branch && !String(contract.roadmap.branch).startsWith('zjal/')) {
    errors.push('roadmap.branch must use zjal/<roadmap-id>');
  }
  if (contract.cleanup?.delete_merged_branch !== true && contract.cleanup?.close_carrier_issue !== true) {
    errors.push('cleanup must request at least one supported action');
  }
  if (contract.cleanup?.close_carrier_issue === true && !Number.isInteger(contract.carrier?.issue)) {
    errors.push('carrier.issue is required when close_carrier_issue is true');
  }
  if (contract.safety?.require_pr_merged !== true) {
    errors.push('safety.require_pr_merged must be true');
  }
  if (contract.safety?.require_branch_merged !== true) {
    errors.push('safety.require_branch_merged must be true');
  }
  if (contract.cleanup?.close_carrier_issue === true && contract.safety?.no_pending_followups !== true) {
    errors.push('safety.no_pending_followups must be true when close_carrier_issue is true');
  }
  if (contract.safety?.missing_contract_behavior !== 'report-only') {
    errors.push('safety.missing_contract_behavior must be report-only');
  }

  const guards = buildGuards({ pr, contract });
  if (!guards.pr_merged) {
    errors.push('PR must be merged');
  }
  if (!guards.current_roadmap_branch) {
    errors.push('roadmap branch must be the current PR head branch');
  }
  if (!guards.same_repository) {
    errors.push('PR head repository must match base repository');
  }
  if (!guards.not_protected_branch) {
    errors.push('roadmap branch must not be a protected or long-lived branch');
  }

  return { ok: errors.length === 0, errors, guards };
}

export function buildRoadmapCloseoutPlan({ pr, contractResult }) {
  if (!contractResult?.ok) {
    return {
      status: 'report-only',
      reason: contractResult?.reason ?? 'missing-contract',
      validation: {
        ok: false,
        errors: contractResult?.errors ?? ['missing post-merge contract'],
      },
      guards: buildGuards({ pr, contract: null }),
      actions: [],
      side_effects_executed: false,
    };
  }

  const validation = validatePostMergeContract(contractResult.contract, { pr });
  if (!validation.ok) {
    return {
      status: 'report-only',
      reason: 'contract-validation-failed',
      validation,
      guards: validation.guards,
      actions: [],
      side_effects_executed: false,
    };
  }

  return {
    status: 'dry-run',
    reason: 'contract-valid-side-effects-disabled',
    validation,
    guards: validation.guards,
    actions: buildPlannedActions(contractResult.contract),
    side_effects_executed: false,
  };
}

function buildPlannedActions(contract) {
  const actions = [];
  if (contract.cleanup?.delete_merged_branch === true) {
    actions.push({
      name: 'delete_merged_branch',
      status: 'planned',
      branch: contract.roadmap.branch,
    });
  }
  if (contract.cleanup?.close_carrier_issue === true) {
    actions.push({
      name: 'close_carrier_issue',
      status: 'planned',
      issue: contract.carrier.issue,
    });
  }
  return actions;
}

function buildGuards({ pr, contract }) {
  const branch = contract?.roadmap?.branch;
  const head = pr?.headRefName;
  return {
    pr_merged: pr?.merged === true,
    current_roadmap_branch: Boolean(branch && head && branch === head),
    roadmap_branch_prefix: typeof branch === 'string' && branch.startsWith('zjal/'),
    same_repository: Boolean(
      pr?.headRepositoryOwner &&
      pr?.baseRepositoryOwner &&
      pr.headRepositoryOwner === pr.baseRepositoryOwner,
    ),
    not_protected_branch: !isProtectedOrLongLivedBranch(branch),
  };
}

function isProtectedOrLongLivedBranch(branch) {
  if (!branch) return true;
  return ['main', 'master', 'develop', 'dev'].includes(branch) || branch.startsWith('release/');
}

async function main() {
  const body = process.env.PR_BODY_PATH
    ? await readFile(process.env.PR_BODY_PATH, 'utf8')
    : process.env.PR_BODY ?? '';
  const pr = process.env.PR_JSON ? JSON.parse(process.env.PR_JSON) : {};
  const contractResult = parsePostMergeContractFromPrBody(body);
  const plan = buildRoadmapCloseoutPlan({ pr, contractResult });

  if (process.env.POST_MERGE_CLOSEOUT_PLAN_OUT) {
    await writeFile(process.env.POST_MERGE_CLOSEOUT_PLAN_OUT, `${JSON.stringify(plan, null, 2)}\n`);
  }
  if (process.env.GITHUB_OUTPUT) {
    const lines = [
      `status=${plan.status}`,
      `reason=${plan.reason}`,
      `side_effects_executed=${plan.side_effects_executed ? 'true' : 'false'}`,
    ];
    await writeFile(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, { flag: 'a' });
  }
  console.log(JSON.stringify(plan, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
