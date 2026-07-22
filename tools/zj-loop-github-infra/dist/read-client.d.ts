import { type ArtifactRead, type CapabilityResult, type GitHubInfraConfig, type NormalizedArtifact, type NormalizedCheck, type NormalizedCommit, type NormalizedJob, type NormalizedRef, type NormalizedWorkflowRun, type ProvenanceResult, type ReadCapability } from './contracts.js';
export declare class GitHubReadClient {
    private readonly apiUrl;
    private readonly repository;
    private readonly token?;
    private readonly tokenSource;
    private readonly fetchImpl;
    private readonly limits;
    constructor(config: GitHubInfraConfig);
    preflight(required?: ReadCapability[]): Promise<CapabilityResult>;
    readWorkflowRun(runId: string | number): Promise<NormalizedWorkflowRun>;
    listJobs(runId: string | number): Promise<NormalizedJob[]>;
    readCheck(checkId: string | number): Promise<NormalizedCheck>;
    listArtifacts(runId: string | number): Promise<NormalizedArtifact[]>;
    readCommit(ref: string): Promise<NormalizedCommit>;
    readRef(ref: string): Promise<NormalizedRef>;
    readArtifact(runId: string | number, artifactName: string, artifactPath: string): Promise<ArtifactRead>;
    readProvenance(input: {
        runId: number;
        workflowName: string;
        jobName: string;
        artifactName: string;
        artifactPath: string;
        expectedHeadSha: string;
        ref: string;
    }): Promise<ProvenanceResult>;
    private repo;
    private request;
    private requestUrl;
}
