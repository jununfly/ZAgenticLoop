import { buildGitLabApiUrl, buildGitLabAuthHeaders } from './providers.js';

const FAILURE_STATUSES = new Set(['failed', 'canceled']);

export async function fetchGitLabPrStewardReport(input: {
  projectPath: string;
  mergeRequestIid: string | number;
  signalId: string;
  token?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}) {
  const audit = {
    project_path: input.projectPath,
    merge_request_iid: Number(input.mergeRequestIid),
    signal_id: input.signalId,
    auth_source: input.token ? 'GITLAB_TOKEN' : null,
  };
  const blocked = (reason: string, extra: Record<string, unknown> = {}) => ({
    schema: 'zj-loop.gitlab_pr_steward_report.v1', status: 'blocked', reason, audit, ...extra,
  });
  if (!input.token) return blocked('gitlab-token-required');
  if (!input.projectPath.trim() || !input.signalId.trim() || !Number.isInteger(Number(input.mergeRequestIid))) {
    return blocked('report-fields-required');
  }
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return blocked('gitlab-fetch-unavailable');
  const url = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['merge_requests', input.mergeRequestIid] });
  let response;
  try { response = await fetchImpl(url, { headers: { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-pr-steward' } }); }
  catch { return blocked('merge-request-read-failed'); }
  if (!response.ok) return blocked('merge-request-read-failed', { http_status: response.status });
  const mr = await response.json() as any;
  if (Number(mr.iid) !== Number(input.mergeRequestIid)) return blocked('merge-request-source-mismatch');
  const pipeline = mr.head_pipeline ?? {};
  const pipelineStatus = String(pipeline.status ?? 'unknown');
  let jobs: any[] = [];
  if (pipeline.id !== undefined && pipeline.id !== null) {
    const jobsUrl = buildGitLabApiUrl({ apiBaseUrl: input.apiBaseUrl, projectPath: input.projectPath, path: ['pipelines', pipeline.id, 'jobs'] });
    let jobsResponse;
    try { jobsResponse = await fetchImpl(jobsUrl, { headers: { ...buildGitLabAuthHeaders({ token: input.token }), 'User-Agent': 'zj-loop-pr-steward' } }); }
    catch { return blocked('pipeline-jobs-read-failed'); }
    if (!jobsResponse.ok) return blocked('pipeline-jobs-read-failed', { http_status: jobsResponse.status });
    jobs = await jobsResponse.json() as any[];
  }
  const failedJobs = jobs.filter((job) => FAILURE_STATUSES.has(String(job?.status ?? ''))).map((job) => ({
    id: job.id ?? null, name: String(job.name ?? ''), status: String(job.status ?? ''), url: String(job.web_url ?? ''),
  }));
  const checks = failedJobs.length > 0 || FAILURE_STATUSES.has(pipelineStatus) ? 'failure' : pipelineStatus;
  return {
    schema: 'zj-loop.gitlab_pr_steward_report.v1', status: 'completed', outcome: 'report-evidence', audit,
    report: {
      schema: 'zj-loop.pr_steward_report.v1', status: checks === 'failure' ? 'candidate-fix-request' : 'watch',
      created_at: new Date().toISOString(),
      source_review: { provider: 'gitlab', kind: 'merge-request', mr_iid: Number(mr.iid), repo: input.projectPath, url: String(mr.web_url ?? ''), source_branch: String(mr.source_branch ?? ''), target_branch: String(mr.target_branch ?? ''), head_sha: String(mr.sha ?? pipeline.sha ?? '') },
      observations: { checks, pipeline_status: pipelineStatus, pipeline_id: pipeline.id ?? null, pipeline_url: String(pipeline.web_url ?? ''), failed_jobs: failedJobs },
      next_action: checks === 'failure' ? 'candidate-fix-request' : 'watch',
      side_effects_executed: false,
    },
  };
}
