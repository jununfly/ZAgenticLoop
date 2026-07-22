import { buildCompletionEvidence, CompletionEvidenceRecord } from './completion-evidence.js';

export type GitLabNormalizedPipeline = {
  id: number;
  source: string;
  ref: string;
  sha: string | null;
  status: string | null;
  created_at: string | null;
  web_url: string | null;
};

export type GitLabNormalizedJob = {
  id: number;
  name: string;
  status: string | null;
  ref: string | null;
  pipeline_id: number | null;
  web_url: string | null;
};

export type GitLabArtifactBinding = {
  path: string;
  schema?: string;
};

export type GitLabInfraProvenance = {
  contract: string;
  infra_version: string;
  gitlab_version: string | null;
  project_path: string;
  capabilities: string[];
};

export function buildGitLabCompletionEvidence(input: {
  orchestrationId: string;
  signalId: string;
  routeId: string;
  requestId: string;
  carrier: CompletionEvidenceRecord['carrier'];
  consumerId: string;
  pipeline: GitLabNormalizedPipeline;
  job: GitLabNormalizedJob;
  artifact: GitLabArtifactBinding | null;
  infraProvenance: GitLabInfraProvenance;
}): CompletionEvidenceRecord {
  const artifact = input.artifact;
  const currentHeadSha = input.pipeline.sha ?? 'not-provided';
  return buildCompletionEvidence({
    orchestrationId: input.orchestrationId,
    signalId: input.signalId,
    routeId: input.routeId,
    requestId: input.requestId,
    carrier: input.carrier,
    consumerId: input.consumerId,
    currentHeadSha,
    status: artifact ? 'executed_to_review_artifact' : 'hard_stopped',
    reviewArtifact: artifact ? {
      kind: 'gitlab-job-artifact',
      path: artifact.path,
      ...(artifact.schema ? { schema: artifact.schema } : {}),
    } : null,
    stopReason: artifact ? null : 'scheduled-artifact-missing',
    evidenceRefs: [
      { kind: 'gitlab-pipeline', url: input.pipeline.web_url ?? undefined },
      { kind: 'gitlab-job', url: input.job.web_url ?? undefined },
      ...(artifact ? [{ kind: 'gitlab-artifact', path: artifact.path }] : []),
    ],
    provenance: {
      provider: 'gitlab',
      project: input.infraProvenance.project_path,
      pipeline_id: String(input.pipeline.id),
      pipeline_url: input.pipeline.web_url,
      job_id: String(input.job.id),
      job_url: input.job.web_url,
      commit: currentHeadSha,
      ref: input.pipeline.ref,
      artifact: artifact?.path ?? null,
      artifact_schema: artifact?.schema ?? null,
      infra_contract: input.infraProvenance.contract,
      infra_version: input.infraProvenance.infra_version,
      gitlab_version: input.infraProvenance.gitlab_version,
      capabilities: input.infraProvenance.capabilities,
    },
    sideEffectsExecuted: false,
  });
}
