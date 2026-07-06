import { readFile, writeFile } from 'node:fs/promises';
import yaml from 'yaml';

const DEFAULT_ROUTE_TABLE = 'zj-loop/zj-loop-route-table.yaml';

export function parseRouteTable(routeTableText) {
  const parsed = yaml.parse(String(routeTableText ?? '')) ?? {};
  return {
    ...parsed,
    routes: Array.isArray(parsed.routes) ? parsed.routes : [],
  };
}

export function findRoute(routeTableText, routeId) {
  return parseRouteTable(routeTableText).routes.find((route) => route?.route_id === routeId) ?? null;
}

export function isCiSweeperDispatchEnabled(routeTableText) {
  const route = findRoute(routeTableText, 'ci-sweeper');
  return route?.enabled === true && route?.request_kind === 'workflow-dispatch';
}

function routeMatchesFailure(route, failure) {
  const workflows = route?.match?.workflows;
  if (!Array.isArray(workflows) || workflows.length === 0) return true;
  return workflows.includes(failure.workflow ?? failure.name);
}

function isGeneratedCiSweeperBranch(branchName) {
  return String(branchName ?? '').startsWith('automated/ci-sweeper-');
}

function branchAllowed(route, branchName) {
  const allowlist = route?.guards?.branch_allowlist;
  if (!Array.isArray(allowlist) || allowlist.length === 0) return true;
  return allowlist.includes(branchName);
}

function findActiveDuplicate(existingRequests, dedupeKey) {
  const activeStatuses = new Set(['pending', 'consumed', 'ambiguous']);
  return (Array.isArray(existingRequests) ? existingRequests : [])
    .find((request) => request?.dedupe_key === dedupeKey && activeStatuses.has(request?.status));
}

export function buildCiSweeperBranchName(sourceWorkflow, sourceRunId) {
  const safeWorkflow = String(sourceWorkflow ?? 'unknown')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
  return `automated/ci-sweeper-${safeWorkflow}-${sourceRunId || 'unknown'}`;
}

function buildSourceUrl({ failure, repository, sourceRun }) {
  if (failure.url) return failure.url;
  if (repository && sourceRun) return `https://github.com/${repository}/actions/runs/${sourceRun}`;
  return '';
}

export function buildCiSweeperRouteDecision({ routeTableText, failures, sourceRunId, repository, existingRequests }) {
  const route = findRoute(routeTableText, 'ci-sweeper');
  const normalizedFailures = Array.isArray(failures) ? failures : [];
  if (normalizedFailures.length === 0) {
    return {
      dispatch: false,
      status: 'ignored',
      reason: 'no-failing-workflows',
      route: null,
      failures: [],
    };
  }

  if (route?.enabled !== true || route?.request_kind !== 'workflow-dispatch') {
    return {
      dispatch: false,
      status: 'denied',
      reason: 'ci-sweeper-route-disabled',
      route: 'ci-sweeper',
      failures: normalizedFailures,
    };
  }

  const failure = normalizedFailures.find((item) => routeMatchesFailure(route, item));
  if (!failure) {
    return {
      dispatch: false,
      status: 'ignored',
      reason: 'no-route-matched-failing-workflow',
      route: 'ci-sweeper',
      failures: normalizedFailures,
    };
  }

  const sourceWorkflow = failure.workflow ?? failure.name ?? 'unknown';
  const sourceRun = String(failure.databaseId ?? failure.runId ?? '');
  const signalId = `ci:${sourceWorkflow}:${sourceRun || sourceRunId || 'unknown'}`;
  const sourceUrl = buildSourceUrl({ failure, repository, sourceRun });
  const headBranch = failure.headBranch ?? 'main';
  const requestBranch = buildCiSweeperBranchName(sourceWorkflow, sourceRun || sourceRunId);
  const duplicate = findActiveDuplicate(existingRequests, signalId);

  if (isGeneratedCiSweeperBranch(headBranch)) {
    return {
      dispatch: false,
      status: 'denied',
      reason: 'generated-ci-sweeper-branch',
      route: 'ci-sweeper',
      signal_id: signalId,
      dedupe_key: signalId,
      request_branch: requestBranch,
      head_branch: headBranch,
      failures: normalizedFailures,
    };
  }

  if (!branchAllowed(route, headBranch)) {
    return {
      dispatch: false,
      status: 'denied',
      reason: 'branch-not-allowlisted',
      route: 'ci-sweeper',
      signal_id: signalId,
      dedupe_key: signalId,
      request_branch: requestBranch,
      head_branch: headBranch,
      failures: normalizedFailures,
    };
  }

  if (duplicate) {
    return {
      dispatch: false,
      status: 'duplicate',
      reason: 'active-request-exists',
      route: 'ci-sweeper',
      signal_id: signalId,
      dedupe_key: signalId,
      request_branch: requestBranch,
      existing_request_id: duplicate.request_id ?? duplicate.id ?? '',
      head_branch: headBranch,
      failures: normalizedFailures,
    };
  }

  return {
    dispatch: true,
    status: 'pending',
    route: 'ci-sweeper',
    request_kind: 'workflow-dispatch',
    requested_action: 'dispatch',
    target_consumer: route.consumer ?? 'ci-sweeper',
    source: 'ci',
    signal_id: signalId,
    subject: `${sourceWorkflow} workflow run ${sourceRun || 'unknown'}`,
    priority: 'P1',
    state: 'none',
    risk: 'medium',
    confidence: 'high',
    evidence: sourceUrl ? [sourceUrl] : [],
    producer: 'daily-triage',
    source_workflow: sourceWorkflow,
    source_run_id: sourceRun,
    source_url: sourceUrl,
    head_branch: headBranch,
    head_sha: failure.headSha ?? '',
    dedupe_key: signalId,
    request_branch: requestBranch,
    producer_run_id: String(sourceRunId ?? ''),
    created_at: new Date().toISOString(),
    failures: normalizedFailures,
  };
}

async function main() {
  const routeTablePath = process.env.ROUTE_TABLE_PATH || DEFAULT_ROUTE_TABLE;
  const outPath = process.env.ROUTE_DECISION_OUT || '/tmp/zj-loop-route-decision.json';
  const routeTableText = await readFile(routeTablePath, 'utf8');
  const failures = JSON.parse(process.env.FAILED_WORKFLOWS_JSON || '[]');
  const existingRequests = JSON.parse(process.env.EXISTING_ROUTE_REQUESTS_JSON || '[]');
  const decision = buildCiSweeperRouteDecision({
    routeTableText,
    failures,
    existingRequests,
    sourceRunId: process.env.GITHUB_RUN_ID,
    repository: process.env.GITHUB_REPOSITORY,
  });

  await writeFile(outPath, `${JSON.stringify(decision, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    const lines = [
      `dispatch=${decision.dispatch ? 'true' : 'false'}`,
      `status=${decision.status}`,
      `route=${decision.route ?? ''}`,
      `source_workflow=${decision.source_workflow ?? ''}`,
      `source_run_id=${decision.source_run_id ?? ''}`,
      `source_url=${decision.source_url ?? ''}`,
      `head_branch=${decision.head_branch ?? ''}`,
      `head_sha=${decision.head_sha ?? ''}`,
      `dedupe_key=${decision.dedupe_key ?? ''}`,
      `request_branch=${decision.request_branch ?? ''}`,
      `signal_id=${decision.signal_id ?? ''}`,
      `requested_action=${decision.requested_action ?? ''}`,
      `target_consumer=${decision.target_consumer ?? ''}`,
      `reason=${decision.reason ?? ''}`,
    ];
    await writeFile(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, { flag: 'a' });
  }
  console.log(JSON.stringify(decision));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
