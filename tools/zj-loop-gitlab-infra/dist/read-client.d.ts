import { type ArtifactRead, type CapabilityResult, type GitLabInfraConfig, type GitLabVersion, type NormalizedJob, type NormalizedIssue, type NormalizedMergeRequest, type NormalizedBranch, type NormalizedNote, type NormalizedPipeline, type NormalizedSchedule, type ReadCapability } from './contracts.js';
export declare class GitLabReadClient {
    private readonly apiUrl;
    private readonly project;
    private readonly token?;
    private readonly tokenSource;
    private readonly fetchImpl;
    private versionPromise?;
    constructor(config: GitLabInfraConfig);
    readVersion(): Promise<GitLabVersion>;
    private readVersionOnce;
    preflight(required?: ReadCapability[]): Promise<CapabilityResult>;
    readSchedule(scheduleId: string | number): Promise<NormalizedSchedule>;
    listScheduledPipelines(): Promise<NormalizedPipeline[]>;
    listPipelineJobs(pipelineId: string | number): Promise<NormalizedJob[]>;
    readJobArtifact(jobId: string | number, artifactPath: string): Promise<ArtifactRead>;
    listIssues(query?: {
        state?: string;
        search?: string;
    }): Promise<NormalizedIssue[]>;
    listMergeRequests(query?: {
        state?: string;
        search?: string;
    }): Promise<NormalizedMergeRequest[]>;
    listBranches(query?: {
        search?: string;
    }): Promise<NormalizedBranch[]>;
    listIssueNotes(issueIid: string | number): Promise<NormalizedNote[]>;
    private request;
    private projectId;
    private provenance;
}
