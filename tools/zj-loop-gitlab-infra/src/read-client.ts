import {
  GITLAB_INFRA_CONTRACT,
  GITLAB_INFRA_VERSION,
  READ_CAPABILITIES,
  type ArtifactRead,
  type CapabilityResult,
  type GitLabInfraConfig,
  type GitLabVersion,
  type InfraProvenance,
  type NormalizedJob,
  type NormalizedPipeline,
  type NormalizedSchedule,
  type ReadCapability,
} from './contracts.js';
import { classifyHttpStatus, GitLabInfraError } from './errors.js';

export class GitLabReadClient {
  private readonly apiUrl: string;
  private readonly project: string;
  private readonly token?: string;
  private readonly tokenSource: string;
  private readonly fetchImpl: typeof fetch;
  private versionPromise?: Promise<GitLabVersion>;

  constructor(config: GitLabInfraConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.project = config.projectPath;
    this.token = config.token;
    this.tokenSource = config.tokenSource ?? (config.token ? 'injected' : 'none');
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  async readVersion(): Promise<GitLabVersion> {
    this.versionPromise ??= this.readVersionOnce();
    return this.versionPromise;
  }

  private async readVersionOnce(): Promise<GitLabVersion> {
    const response = await this.request('/version');
    if (!response.body || typeof response.body !== 'object' || Array.isArray(response.body)) return { version: null, revision: null };
    const body = response.body as Record<string, unknown>;
    return { version: stringOrNull(body.version), revision: stringOrNull(body.revision) };
  }

  async preflight(required: ReadCapability[] = [...READ_CAPABILITIES]): Promise<CapabilityResult> {
    const version = await this.readVersion();
    const capabilities = required.filter((capability): capability is ReadCapability => READ_CAPABILITIES.includes(capability));
    const errors = required.length === capabilities.length ? [] : [{ code: 'provider-contract-mismatch' as const, message: 'Unsupported GitLab infra capability requested' }];
    const provenance = this.provenance(version.version, capabilities);
    return { schema: 'zj-loop.gitlab_infra_capability.v1', status: errors.length ? 'blocked' : 'ready', version, provenance, capabilities, errors };
  }

  async readSchedule(scheduleId: string | number): Promise<NormalizedSchedule> {
    const body = asRecord((await this.request(`/projects/${this.projectId()}/pipeline_schedules/${encodeURIComponent(String(scheduleId))}`)).body);
    return {
      id: numberOrNull(body.id) ?? Number(scheduleId),
      active: body.active === true,
      updated_at: stringOrNull(body.updated_at),
      next_run_at: stringOrNull(body.next_run_at),
      cron: stringOrNull(body.cron),
      cron_timezone: stringOrNull(body.cron_timezone),
    };
  }

  async listScheduledPipelines(): Promise<NormalizedPipeline[]> {
    const body = await this.request(`/projects/${this.projectId()}/pipelines?source=schedule&per_page=20`);
    if (!Array.isArray(body.body)) throw new GitLabInfraError('response-shape-invalid', 'GitLab pipelines response must be an array');
    return body.body.map(normalizePipeline);
  }

  async listPipelineJobs(pipelineId: string | number): Promise<NormalizedJob[]> {
    const body = await this.request(`/projects/${this.projectId()}/pipelines/${encodeURIComponent(String(pipelineId))}/jobs`);
    if (!Array.isArray(body.body)) throw new GitLabInfraError('response-shape-invalid', 'GitLab jobs response must be an array');
    return body.body.map(normalizeJob);
  }

  async readJobArtifact(jobId: string | number, artifactPath: string): Promise<ArtifactRead> {
    const response = await this.request(`/projects/${this.projectId()}/jobs/${encodeURIComponent(String(jobId))}/artifacts/${artifactPath}`);
    const payload = response.body;
    if (!payload || typeof payload !== 'object') throw new GitLabInfraError('response-shape-invalid', 'GitLab artifact must be a JSON object');
    const version = await this.readVersion();
    const provenance = this.provenance(version.version, [...READ_CAPABILITIES]);
    return { schema: stringOrUndefined((payload as Record<string, unknown>).schema), payload, provenance };
  }

  private async request(path: string): Promise<{ body: unknown; status: number }> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiUrl}${path}`, { headers: { ...(this.token ? { 'PRIVATE-TOKEN': this.token } : {}), Accept: 'application/json', 'User-Agent': `zj-loop-gitlab-infra/${GITLAB_INFRA_VERSION}` } });
    } catch {
      throw new GitLabInfraError('transient-network', 'GitLab request failed before receiving a response');
    }
    if (!response.ok) throw new GitLabInfraError(classifyHttpStatus(response.status), `GitLab request failed with HTTP ${response.status}`, response.status);
    let body: unknown;
    try { body = await response.json(); } catch { throw new GitLabInfraError('response-shape-invalid', 'GitLab response was not valid JSON', response.status); }
    return { body, status: response.status };
  }

  private projectId(): string { return encodeURIComponent(this.project); }

  private provenance(gitlabVersion: string | null, capabilities: ReadCapability[]): InfraProvenance {
    return { contract: GITLAB_INFRA_CONTRACT, infra_version: GITLAB_INFRA_VERSION, gitlab_version: gitlabVersion, project_path: this.project, capabilities: [...capabilities] };
  }
}

function normalizePipeline(value: unknown): NormalizedPipeline {
  const body = asRecord(value);
  return { id: numberRequired(body.id, 'pipeline.id'), source: stringRequired(body.source, 'pipeline.source'), ref: stringRequired(body.ref, 'pipeline.ref'), sha: stringOrNull(body.sha), status: stringOrNull(body.status), created_at: stringOrNull(body.created_at), web_url: stringOrNull(body.web_url) };
}

function normalizeJob(value: unknown): NormalizedJob {
  const body = asRecord(value);
  const pipeline = body.pipeline && typeof body.pipeline === 'object' && !Array.isArray(body.pipeline) ? body.pipeline as Record<string, unknown> : {};
  return { id: numberRequired(body.id, 'job.id'), name: stringRequired(body.name, 'job.name'), status: stringOrNull(body.status), ref: stringOrNull(body.ref), pipeline_id: numberOrNull(body.pipeline_id ?? pipeline.id), web_url: stringOrNull(body.web_url) };
}

function asRecord(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GitLabInfraError('response-shape-invalid', 'GitLab response must be an object'); return value as Record<string, unknown>; }
function numberRequired(value: unknown, field: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new GitLabInfraError('response-shape-invalid', `GitLab response missing numeric ${field}`); return value; }
function numberOrNull(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function stringRequired(value: unknown, field: string): string { if (typeof value !== 'string' || value.length === 0) throw new GitLabInfraError('response-shape-invalid', `GitLab response missing string ${field}`); return value; }
function stringOrNull(value: unknown): string | null { return typeof value === 'string' ? value : null; }
function stringOrUndefined(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
