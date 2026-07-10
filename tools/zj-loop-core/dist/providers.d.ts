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
export declare function detectProviderKind(input?: ProviderDetectionInput): ProviderKind;
export declare function parseGitRemoteRepository(remoteUrl: string, { providerHint }?: {
    providerHint?: ProviderKind;
}): GitRemoteRepositoryRef | null;
export declare function parseProviderIssueUrl(url: string): ProviderIssueRef | null;
export declare function parseProviderReviewUrl(url: string): ProviderReviewRef | null;
