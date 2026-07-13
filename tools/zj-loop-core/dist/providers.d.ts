export type ProviderKind = 'github' | 'gitlab' | 'manual';
export interface ProviderDetectionInput {
    remote?: string;
    githubActions?: boolean;
    gitlabCi?: boolean;
    glabMentioned?: boolean;
}
export interface GitRemoteRepositoryRef {
    provider: ProviderKind;
    host: string;
    ownerPath: string;
    name: string;
    slug: string;
    remoteUrl: string;
}
export interface ProviderIssueRef {
    provider: 'github' | 'gitlab';
    host: string;
    projectPath: string;
    issue: number;
    url: string;
}
export interface ProviderReviewRef {
    provider: 'github' | 'gitlab';
    host: string;
    projectPath: string;
    number: number;
    kind: 'pull-request' | 'merge-request';
    url: string;
}
export type ProviderCarrierKind = 'issue' | 'review' | 'branch' | 'comment' | 'note' | 'artifact' | 'job' | 'workflow';
export interface ProviderApiRef {
    provider: 'github' | 'gitlab';
    host: string;
    projectPath: string;
    carrierKind: ProviderCarrierKind;
    url?: string;
    number?: number;
    branch?: string;
    reviewKind?: 'pull-request' | 'merge-request';
}
export interface ProviderAuditMetadata {
    provider: 'github' | 'gitlab';
    host: string;
    project_path: string;
    carrier_kind: ProviderCarrierKind;
    carrier_url?: string;
    issue?: number;
    review_kind?: 'pull-request' | 'merge-request';
    review_number?: number;
    branch?: string;
}
export interface BuildProviderIssueUrlInput {
    provider?: ProviderKind | 'github' | 'gitlab';
    host?: string;
    projectPath?: string;
    repo?: string;
    issue?: number | string;
}
export interface BuildGitLabApiUrlInput {
    apiBaseUrl?: string;
    projectPath: string;
    path?: string | Array<string | number>;
}
export declare function detectProviderKind(input?: ProviderDetectionInput): ProviderKind;
export declare function parseGitRemoteRepository(remoteUrl: string, { providerHint }?: {
    providerHint?: ProviderKind;
}): GitRemoteRepositoryRef | null;
export declare function parseProviderIssueUrl(url: string): ProviderIssueRef | null;
export declare function parseProviderReviewUrl(url: string): ProviderReviewRef | null;
export declare function buildProviderIssueUrl(input: BuildProviderIssueUrlInput): string;
export declare function buildGitLabApiUrl(input: BuildGitLabApiUrlInput): string;
export declare function buildGitLabMergeRequestApiUrl(input: {
    apiBaseUrl?: string;
    projectPath: string;
    iid: string | number;
}): string;
export declare function buildGitLabBranchApiUrl(input: {
    apiBaseUrl?: string;
    projectPath: string;
    branch: string;
}): string;
export declare function buildGitLabIssueApiUrl(input: {
    apiBaseUrl?: string;
    projectPath: string;
    issue: string | number;
}): string;
export declare function buildGitLabAuthHeaders(input: {
    token?: string;
    jobToken?: string;
}): Record<string, string>;
export declare function gitLabFailureReason(prefix: string, response: {
    status: number;
    text?: () => Promise<string>;
}): Promise<string>;
export declare function buildProviderAuditMetadata(input: {
    url?: string;
    provider?: 'github' | 'gitlab';
    host?: string;
    projectPath?: string;
    carrierKind?: ProviderCarrierKind;
    branch?: string;
    reviewKind?: 'pull-request' | 'merge-request';
}): ProviderAuditMetadata | null;
