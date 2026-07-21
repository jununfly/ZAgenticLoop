import { type ArtifactRead, type CapabilityResult, type GitLabInfraConfig, type GitLabVersion, type NormalizedJob, type NormalizedPipeline, type NormalizedSchedule, type ReadCapability } from './contracts.js';
export declare class GitLabReadClient {
    private readonly apiUrl;
    private readonly project;
    private readonly token?;
    private readonly tokenSource;
    private readonly fetchImpl;
    constructor(config: GitLabInfraConfig);
    readVersion(): Promise<GitLabVersion>;
    preflight(required?: ReadCapability[]): Promise<CapabilityResult>;
    readSchedule(scheduleId: string | number): Promise<NormalizedSchedule>;
    listScheduledPipelines(): Promise<NormalizedPipeline[]>;
    listPipelineJobs(pipelineId: string | number): Promise<NormalizedJob[]>;
    readJobArtifact(jobId: string | number, artifactPath: string): Promise<ArtifactRead>;
    private request;
    private projectId;
    private provenance;
}
