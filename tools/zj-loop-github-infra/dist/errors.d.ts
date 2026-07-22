import type { InfraErrorCode } from './contracts.js';
export declare class GitHubInfraError extends Error {
    readonly code: InfraErrorCode;
    readonly status?: number | undefined;
    readonly retryAfter?: number | undefined;
    constructor(code: InfraErrorCode, message: string, status?: number | undefined, retryAfter?: number | undefined);
}
export declare function classifyHttpStatus(status: number): InfraErrorCode;
