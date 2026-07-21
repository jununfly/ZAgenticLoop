export declare const VERSION_LOCK_PATH = "zj-loop/version-lock.json";
export declare const VERSION_CONSISTENCY_SCHEMA = "zj-loop.version_consistency_result.v1";
type VersionLockFile = {
    path: string;
    sha256: string;
    template_hash?: string;
};
export type VersionLock = {
    schema: 'zj-loop.version-lock.v1';
    core: {
        package: string;
        version: string;
        source: string;
    };
    vendor?: {
        path: string;
        sha256: string;
    };
    generated_files: Record<string, VersionLockFile>;
};
export type VersionConsistencyResult = {
    schema: typeof VERSION_CONSISTENCY_SCHEMA;
    status: 'healthy' | 'blocked';
    reason: 'version-match' | 'version-drift';
    side_effects_executed: false;
    expected: {
        core_package: string;
        core_version: string;
        core_source: string;
        lock_path: string;
    };
    observed: {
        package_version: string;
        workflow_references: string[];
        checkout_sha: string | null;
    };
    checks: Array<{
        name: string;
        status: 'passed' | 'failed';
        expected?: string;
        observed?: string;
        path?: string;
    }>;
    errors: string[];
    provenance: {
        provider: string;
        project: string | null;
        pipeline: string | null;
        job: string | null;
        commit: string | null;
    };
};
export declare function generatedFileHash(text: string): string;
export declare function checkVersionConsistency(input?: {
    root?: string;
    provider?: string;
    checkoutSha?: string;
    project?: string;
    pipeline?: string;
    job?: string;
}): Promise<VersionConsistencyResult>;
export {};
