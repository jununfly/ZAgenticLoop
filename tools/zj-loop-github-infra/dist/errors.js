export class GitHubInfraError extends Error {
    code;
    status;
    retryAfter;
    constructor(code, message, status, retryAfter) {
        super(message);
        this.code = code;
        this.status = status;
        this.retryAfter = retryAfter;
        this.name = 'GitHubInfraError';
    }
}
export function classifyHttpStatus(status) { if (status === 401)
    return 'auth-failed'; if (status === 403)
    return 'permission-denied'; if (status === 404)
    return 'not-found'; if (status === 429)
    return 'rate-limited'; if (status >= 500)
    return 'transient-network'; return 'provider-contract-mismatch'; }
