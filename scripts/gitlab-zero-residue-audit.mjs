import { createHash } from 'node:crypto';
import { parseGitLabLifecycleMarker, parseIssueFixRequestComments } from '../tools/zj-loop-core/dist/index.js';

export const GITLAB_INCIDENT_CLEANUP_CONFIRMATION = 'CONFIRM_GITLAB_INCIDENT_CLEANUP';

export async function auditGitLabZeroResidue(input) {
  const issues = await input.client.listIssues({ state: 'opened', search: input.issueSearch ?? 'zj-loop' });
  const mergeRequests = await input.client.listMergeRequests({ state: 'opened', search: input.mergeRequestSearch ?? 'zj-loop' });
  const branches = await input.client.listBranches({ search: input.branchSearch ?? 'automated/' });
  const carrierIssues = issues.filter((issue) => parseIssueFixRequestComments([{ id: issue.iid, body: issue.description ?? '' }]).length > 0);
  const notes = [];
  for (const issue of carrierIssues) notes.push(...await input.client.listIssueNotes(issue.iid));
  const claims = notes.map((note) => parseGitLabLifecycleMarker(note, 'ci-sweeper-claim') ?? parseGitLabLifecycleMarker(note, 'dependency-sweeper-claim')).filter(Boolean);
  const requestsByDedupe = groupBy(carrierIssues.map((issue) => {
    const dedupeKey = parseIssueFixRequestComments([{ id: issue.iid, body: issue.description ?? '' }])[0]?.request?.dedupe_key;
    return dedupeKey ? [dedupeKey, issue.iid] : null;
  }).filter(Boolean));
  const claimsByRequest = groupBy(claims.map((claim) => claim.request_id ? [claim.request_id, claim.claim_id ?? null] : null).filter(Boolean));
  const repairMrCandidates = mergeRequests.filter((mr) => /<!--\s*zj-loop:repair-dedupe\b/.test(mr.description ?? '') || /automated\/(?:ci-sweeper|dependency-sweeper)-gitlab-/.test(mr.source_branch ?? ''));
  const repairBranchCandidates = branches.filter((branch) => /^(?:automated\/(?:ci-sweeper|dependency-sweeper)-gitlab-)/.test(branch.name));
  const duplicateRequests = Object.entries(requestsByDedupe).filter(([, ids]) => ids.length > 1).map(([dedupe_key, issue_iids]) => ({ dedupe_key, issue_iids }));
  const duplicateClaims = Object.entries(claimsByRequest).filter(([, claimIds]) => claimIds.length > 1).map(([request_id, claim_ids]) => ({ request_id, claim_ids }));
  const residue = {
    schema: 'zj-loop.gitlab_zero_residue_audit.v1',
    status: repairMrCandidates.length || repairBranchCandidates.length || duplicateRequests.length || duplicateClaims.length ? 'blocked' : 'healthy',
    counts: {
      open_carrier_issues: carrierIssues.length,
      open_repair_mrs: repairMrCandidates.length,
      repair_branches: repairBranchCandidates.length,
      duplicate_requests: duplicateRequests.length,
      duplicate_claims: duplicateClaims.length,
    },
    resources: {
      open_carrier_issues: carrierIssues.map((issue) => ({ iid: issue.iid, url: issue.web_url })),
      open_repair_mrs: repairMrCandidates.map((mr) => ({ iid: mr.iid, url: mr.web_url, source_branch: mr.source_branch })),
      repair_branches: repairBranchCandidates.map((branch) => ({ name: branch.name, url: branch.web_url })),
      duplicate_requests: duplicateRequests,
      duplicate_claims: duplicateClaims,
    },
  };
  return {
    schema: 'zj-loop.gitlab_zero_residue_audit_result.v1',
    status: residue.status,
    side_effects_executed: false,
    provider_writes: 0,
    residue,
    cleanup_plan: {
      status: residue.status === 'healthy' ? 'not-required' : 'pending-human-confirmation',
      confirmation_required: true,
      actions: residue.status === 'healthy' ? [] : buildCleanupPlan(residue.resources),
    },
    provenance: { provider: 'gitlab', project: input.projectPath ?? null, auth_source: input.authSource ?? 'injected', read_only: true },
  };
}

function groupBy(entries) {
  return entries.reduce((groups, entry) => { const [key, value] = entry; (groups[key] ??= []).push(value); return groups; }, {});
}

export function buildCleanupPlan(resources) {
  const actions = [
    ...resources.open_repair_mrs.map((mr) => ({ action: 'review-open-repair-mr', merge_request_iid: mr.iid, url: mr.url })),
    ...resources.repair_branches.map((branch) => ({ action: 'review-repair-branch', branch: branch.name, url: branch.url })),
    ...resources.duplicate_requests.map((item) => ({ action: 'review-duplicate-request', ...item })),
    ...resources.duplicate_claims.map((item) => ({ action: 'review-duplicate-claim', ...item })),
  ];
  return actions.map((action) => {
    const resource = { action: action.action, ...action };
    const resumeId = createHash('sha256').update(JSON.stringify(resource)).digest('hex').slice(0, 16);
    return {
      ...action,
      resume_id: `gitlab-cleanup-${resumeId}`,
      preconditions: {
        read_before_write: true,
        provider_reread_required: true,
        expected_resource_identity: resource,
      },
      confirmation: {
        required: true,
        required_phrase: GITLAB_INCIDENT_CLEANUP_CONFIRMATION,
        location: 'cleanup-plan.json',
      },
      resume_anchor: {
        resume_id: `gitlab-cleanup-${resumeId}`,
        audit_schema: 'zj-loop.gitlab_zero_residue_audit_result.v1',
        next_step: 'reread this exact resource, compare identity, then request human confirmation',
      },
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.error('Provide a GitLabReadClient from a caller; this module intentionally has no write or implicit network entrypoint.');
  process.exitCode = 2;
}
