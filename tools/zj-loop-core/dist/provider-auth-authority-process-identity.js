export function createInMemoryProviderAuthAuthorityProcessIdentityVerifier(input) {
    return {
        async verify({ binding }) {
            if (input.available === false || !input.facts)
                return { status: 'blocked', reason: 'provider-auth-authority-process-identity-unavailable' };
            const facts = input.facts;
            return facts.service_id === binding.service_id && facts.pid === binding.pid && facts.started_at === binding.started_at && facts.process_identity_digest === binding.process_identity_digest
                ? { status: 'verified', facts }
                : { status: 'blocked', reason: 'provider-auth-authority-process-identity-mismatch' };
        },
    };
}
