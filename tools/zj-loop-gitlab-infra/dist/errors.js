export class GitLabInfraError extends Error {
    code;
    status;
    constructor(code, message, status) {
        super(message);
        this.name = 'GitLabInfraError';
        this.code = code;
        this.status = status;
    }
}
export function classifyHttpStatus(status) {
    if (status === 401)
        return 'auth-failed';
    if (status === 403)
        return 'permission-denied';
    if (status === 404)
        return 'not-found';
    if (status === 429)
        return 'rate-limited';
    if (status >= 500)
        return 'transient-network';
    return 'provider-contract-mismatch';
}
