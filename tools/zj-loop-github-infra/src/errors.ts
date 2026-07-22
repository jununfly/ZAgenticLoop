import type { InfraErrorCode } from './contracts.js';
export class GitHubInfraError extends Error {
  constructor(public readonly code: InfraErrorCode, message: string, public readonly status?: number, public readonly retryAfter?: number) { super(message); this.name = 'GitHubInfraError'; }
}
export function classifyHttpStatus(status: number): InfraErrorCode { if (status === 401) return 'auth-failed'; if (status === 403) return 'permission-denied'; if (status === 404) return 'not-found'; if (status === 429) return 'rate-limited'; if (status >= 500) return 'transient-network'; return 'provider-contract-mismatch'; }
