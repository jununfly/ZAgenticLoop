export declare const PROVIDER_REDACTION_POLICY_SCHEMA: "zj-loop.provider_redaction_policy.v1";
export declare const PROVIDER_REDACTION_RESULT_SCHEMA: "zj-loop.provider_redaction_result.v1";
type RedactionPatternInput = {
    id: string;
    source: string;
    flags?: string;
};
type RedactionRule = {
    id: string;
    kind: 'literal' | 'pattern';
    regex: RegExp;
    secret_digest: string;
};
export type RedactionPolicyInput = {
    policy_version: string;
    literals?: string[];
    patterns?: RedactionPatternInput[];
};
export type RedactionPolicy = {
    schema: typeof PROVIDER_REDACTION_POLICY_SCHEMA;
    policy_version: string;
    rules: readonly RedactionRule[];
};
export type RedactionMetadata = {
    schema: typeof PROVIDER_REDACTION_RESULT_SCHEMA;
    policy_version: string;
    rule_ids: string[];
    match_count: number;
    secret_digests: string[];
    policy: {
        policy_version: string;
        rule_ids: string[];
        match_count: number;
        secret_digests: string[];
    };
};
type RedactedResult = RedactionMetadata & {
    status: 'redacted';
    stdout: string;
    stderr: string;
    final_message: string;
    task_result?: Record<string, unknown>;
};
type BlockedResult = RedactionMetadata & {
    status: 'blocked';
    reason: 'critical-field-redaction' | 'redaction-invalid';
};
export type ProviderRedactionResult = RedactedResult | BlockedResult;
export declare function createRedactionPolicy(input: RedactionPolicyInput): RedactionPolicy;
export declare function redactProviderOutput(input: {
    policy: RedactionPolicy;
    stdout: string;
    stderr: string;
    final_message: string;
    task_result?: Record<string, unknown>;
}): ProviderRedactionResult;
export {};
