import { CompletionEvidenceRecord } from './completion-evidence.js';
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
export declare function buildGitLabCompletionEvidence(input: {
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
}): CompletionEvidenceRecord;
