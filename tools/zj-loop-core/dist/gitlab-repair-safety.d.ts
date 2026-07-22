export type GitLabRepairAction = {
    action?: string;
    file_path?: string;
    previous_path?: string;
    content?: string;
    encoding?: string;
    execute_filemode?: string;
    mode?: string;
};
export declare function buildGitLabRepairDedupeKey(input: {
    projectPath: string;
    routeFamily: string;
    targetBranch: string;
    actions: GitLabRepairAction[];
}): {
    digest: string;
    key: string;
};
export declare function buildGitLabRepairDedupeMarker(input: {
    key: string;
    digest: string;
    routeFamily: string;
}): string;
export declare function readGitLabRepairDedupeMarker(description: unknown): any;
export declare function findGitLabRepairMr(input: {
    projectPath: string;
    routeFamily: string;
    targetBranch: string;
    actions: GitLabRepairAction[];
    branch: string;
    apiBaseUrl?: string;
    headers: Record<string, string>;
    fetchImpl: typeof fetch;
}): Promise<{
    ok: false;
    reason: "repair-mr-dedupe-read-failed";
    dedupe: {
        digest: string;
        key: string;
    };
    status?: undefined;
    existing?: undefined;
} | {
    ok: false;
    reason: "repair-mr-dedupe-read-failed";
    status: number;
    dedupe: {
        digest: string;
        key: string;
    };
    existing?: undefined;
} | {
    ok: false;
    reason: "repair-mr-dedupe-response-invalid";
    dedupe: {
        digest: string;
        key: string;
    };
    status?: undefined;
    existing?: undefined;
} | {
    ok: true;
    existing: any;
    dedupe: {
        digest: string;
        key: string;
    };
    reason?: undefined;
    status?: undefined;
}>;
export declare function hasEffectiveGitLabRepairDiff(input: {
    projectPath: string;
    targetBranch: string;
    actions: GitLabRepairAction[];
    apiBaseUrl?: string;
    headers: Record<string, string>;
    fetchImpl: typeof fetch;
}): Promise<boolean | null>;
