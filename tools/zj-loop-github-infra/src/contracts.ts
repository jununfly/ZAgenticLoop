export const GITHUB_INFRA_CONTRACT = 'zj-loop.github-infra.v1' as const;
export const GITHUB_INFRA_VERSION = '0.1.0' as const;
export const GITHUB_API_VERSION = '2022-11-28' as const;

export const READ_CAPABILITIES = ['workflow-run-read', 'check-read', 'artifact-read', 'commit-read', 'ref-read'] as const;
export type ReadCapability = (typeof READ_CAPABILITIES)[number];
export type InfraErrorCode = 'auth-failed' | 'permission-denied' | 'not-found' | 'rate-limited' | 'transient-network' | 'provider-contract-mismatch' | 'response-shape-invalid' | 'artifact-invalid' | 'artifact-limit-exceeded';

export interface GitHubInfraConfig {
  apiUrl?: string;
  repository: string;
  token?: string;
  tokenSource?: string;
  fetchImpl?: typeof fetch;
  limits?: Partial<ArtifactLimits>;
}
export interface ArtifactLimits { maxArchiveBytes: number; maxUncompressedBytes: number; maxEntryBytes: number; maxEntries: number; }
export interface NormalizedWorkflowRun { id: number; name: string; workflow_id: number | null; event: string | null; status: string | null; conclusion: string | null; head_sha: string; head_branch: string | null; html_url: string | null; }
export interface NormalizedJob { id: number; name: string; status: string | null; conclusion: string | null; head_sha: string; run_id: number | null; check_run_url: string | null; html_url: string | null; }
export interface NormalizedCheck { id: number; name: string; status: string | null; conclusion: string | null; head_sha: string | null; html_url: string | null; }
export interface NormalizedArtifact { id: number; name: string; expired: boolean; size_in_bytes: number; workflow_run_id: number | null; archive_download_url: string; }
export interface NormalizedCommit { sha: string; html_url: string | null; }
export interface NormalizedRef { ref: string; sha: string; object_type: string | null; }
export interface ArtifactRead { schema?: string; payload: unknown; name: string; path: string; provenance: InfraProvenance; }
export interface InfraProvenance { contract: typeof GITHUB_INFRA_CONTRACT; infra_version: typeof GITHUB_INFRA_VERSION; api_version: typeof GITHUB_API_VERSION; repository: string; workflow_id: number; run_id: number; job_id: number; job_name: string; artifact_id: number; artifact_name: string; artifact_path: string; head_sha: string; ref: string; auth_source: string; }
export interface CapabilityResult { schema: 'zj-loop.github_infra_capability.v1'; status: 'ready' | 'blocked'; warnings: string[]; capabilities: ReadCapability[]; auth_source: string; api_version: typeof GITHUB_API_VERSION; errors: Array<{ code: InfraErrorCode; message: string; status?: number }>; }
export interface ProvenanceResult { schema: 'zj-loop.github_infra_provenance.v1'; status: 'ready' | 'blocked'; side_effects_executed: false; run: NormalizedWorkflowRun | null; job: NormalizedJob | null; check: NormalizedCheck | null; artifact: NormalizedArtifact | null; commit: NormalizedCommit | null; ref: NormalizedRef | null; evidence: ArtifactRead | null; provenance: InfraProvenance | null; errors: Array<{ code: InfraErrorCode; message: string; status?: number }>; }

export const DEFAULT_ARTIFACT_LIMITS: ArtifactLimits = { maxArchiveBytes: 10 * 1024 * 1024, maxUncompressedBytes: 50 * 1024 * 1024, maxEntryBytes: 10 * 1024 * 1024, maxEntries: 100 };
