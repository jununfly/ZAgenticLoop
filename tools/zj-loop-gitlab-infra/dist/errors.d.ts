import type { InfraErrorCode } from './contracts.js';
export declare class GitLabInfraError extends Error {
    readonly code: InfraErrorCode;
    readonly status?: number;
    constructor(code: InfraErrorCode, message: string, status?: number);
}
export declare function classifyHttpStatus(status: number): InfraErrorCode;
