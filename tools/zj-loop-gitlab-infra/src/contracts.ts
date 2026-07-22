export const GITLAB_INFRA_CONTRACT = 'zj-loop.gitlab-infra.v1' as const;
export const GITLAB_INFRA_VERSION = '0.1.1' as const;

export const READ_CAPABILITIES = [
  'schedule-read',
  'pipeline-read',
  'job-read',
  'artifact-read',
  'issue-read',
  'merge-request-read',
  'branch-read',
  'note-read',
] as const;

export type ReadCapability = (typeof READ_CAPABILITIES)[number];
export type InfraErrorCode =
  | 'auth-failed'
  | 'permission-denied'
  | 'not-found'
  | 'rate-limited'
  | 'transient-network'
  | 'provider-contract-mismatch'
  | 'response-shape-invalid';

export interface GitLabInfraConfig {
  apiUrl: string;
  projectPath: string;
  token?: string;
  tokenSource?: string;
  fetchImpl?: typeof fetch;
}

export interface GitLabVersion {
  version: string | null;
  revision: string | null;
}

export interface InfraProvenance {
  contract: typeof GITLAB_INFRA_CONTRACT;
  infra_version: typeof GITLAB_INFRA_VERSION;
  gitlab_version: string | null;
  project_path: string;
  capabilities: ReadCapability[];
}

export interface NormalizedSchedule {
  id: number;
  active: boolean;
  updated_at: string | null;
  next_run_at: string | null;
  cron: string | null;
  cron_timezone: string | null;
}

export interface NormalizedPipeline {
  id: number;
  source: string;
  ref: string;
  sha: string | null;
  status: string | null;
  created_at: string | null;
  web_url: string | null;
}

export interface NormalizedJob {
  id: number;
  name: string;
  status: string | null;
  ref: string | null;
  pipeline_id: number | null;
  web_url: string | null;
}

export interface ArtifactRead {
  schema?: string;
  payload: unknown;
  provenance: InfraProvenance;
}

export interface NormalizedIssue { iid: number; state: string | null; title: string | null; description: string | null; web_url: string | null; }
export interface NormalizedMergeRequest { iid: number; state: string | null; title: string | null; description: string | null; source_branch: string | null; target_branch: string | null; web_url: string | null; }
export interface NormalizedBranch { name: string; web_url: string | null; commit_sha: string | null; }
export interface NormalizedNote { id: number; body: string; created_at: string | null; web_url: string | null; }

export interface CapabilityResult {
  schema: 'zj-loop.gitlab_infra_capability.v1';
  status: 'ready' | 'blocked';
  version: GitLabVersion;
  provenance: InfraProvenance;
  capabilities: ReadCapability[];
  errors: Array<{ code: InfraErrorCode; message: string; status?: number }>;
}
