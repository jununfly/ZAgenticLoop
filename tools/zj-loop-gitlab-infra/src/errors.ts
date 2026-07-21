import type { InfraErrorCode } from './contracts.js';

export class GitLabInfraError extends Error {
  readonly code: InfraErrorCode;
  readonly status?: number;

  constructor(code: InfraErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'GitLabInfraError';
    this.code = code;
    this.status = status;
  }
}

export function classifyHttpStatus(status: number): InfraErrorCode {
  if (status === 401) return 'auth-failed';
  if (status === 403) return 'permission-denied';
  if (status === 404) return 'not-found';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'transient-network';
  return 'provider-contract-mismatch';
}
