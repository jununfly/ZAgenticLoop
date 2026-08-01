import { createHash } from 'node:crypto';

export const PROVIDER_REDACTION_POLICY_SCHEMA = 'zj-loop.provider_redaction_policy.v1' as const;
export const PROVIDER_REDACTION_RESULT_SCHEMA = 'zj-loop.provider_redaction_result.v1' as const;

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

const CRITICAL_SEGMENTS = new Set([
  'claims',
  'file_refs',
  'evidence_refs',
  'resource_scope',
  'execution_id',
  'task_id',
  'network_id',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function digestSecret(value: string): string {
  return 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
}

function ruleId(kind: RedactionRule['kind'], index: number, id?: string): string {
  const normalized = id?.trim();
  return normalized || kind + '-' + (index + 1);
}

function validateFlags(flags: string): void {
  if (!/^[dgimsuvy]*$/.test(flags) || new Set(flags).size !== flags.length) throw new Error('redaction-policy-invalid');
}

export function createRedactionPolicy(input: RedactionPolicyInput): RedactionPolicy {
  if (!input || typeof input.policy_version !== 'string' || input.policy_version.length === 0 || input.policy_version.length > 128) throw new Error('redaction-policy-invalid');
  const rules: RedactionRule[] = [];
  const ids = new Set<string>();
  for (const [index, literal] of (input.literals ?? []).entries()) {
    if (typeof literal !== 'string' || literal.length === 0) throw new Error('redaction-policy-invalid');
    const id = ruleId('literal', index);
    if (ids.has(id)) throw new Error('redaction-policy-invalid');
    ids.add(id);
    rules.push({ id, kind: 'literal', regex: new RegExp(escapeRegex(literal), 'gu'), secret_digest: digestSecret(literal) });
  }
  for (const [index, pattern] of (input.patterns ?? []).entries()) {
    if (!pattern || typeof pattern.id !== 'string' || pattern.id.length === 0 || typeof pattern.source !== 'string' || pattern.source.length === 0) throw new Error('redaction-policy-invalid');
    const id = ruleId('pattern', index, pattern.id);
    if (ids.has(id)) throw new Error('redaction-policy-invalid');
    const flags = pattern.flags ?? 'gu';
    validateFlags(flags);
    try {
      const regex = new RegExp(pattern.source, flags.includes('g') ? flags : flags + 'g');
      ids.add(id);
      rules.push({ id, kind: 'pattern', regex, secret_digest: digestSecret(pattern.source) });
    } catch {
      throw new Error('redaction-policy-invalid');
    }
  }
  return Object.freeze({ schema: PROVIDER_REDACTION_POLICY_SCHEMA, policy_version: input.policy_version, rules: Object.freeze(rules) });
}

function criticalPath(path: string[]): boolean {
  return path.some((segment) => CRITICAL_SEGMENTS.has(segment) || segment.endsWith('_digest') || segment.endsWith('_sha256'));
}

function scan(value: unknown, path: string[], rules: readonly RedactionRule[], hit: { rule_ids: Set<string>; secret_digests: Set<string>; match_count: number }): boolean {
  if (typeof value === 'string') {
    for (const rule of rules) {
      rule.regex.lastIndex = 0;
      const matches = value.match(rule.regex);
      if (!matches || matches.length === 0) continue;
      if (!criticalPath(path)) continue;
      hit.rule_ids.add(rule.id);
      hit.secret_digests.add(rule.secret_digest);
      hit.match_count += matches.length;
      return true;
    }
    return false;
  }
  if (Array.isArray(value)) return value.some((item, index) => scan(item, path.concat(String(index)), rules, hit));
  if (isRecord(value)) return Object.entries(value).some(([key, item]) => scan(item, path.concat(key), rules, hit));
  return false;
}

function redactText(value: string, rules: readonly RedactionRule[], hit: { rule_ids: Set<string>; secret_digests: Set<string>; match_count: number }): string {
  let result = value;
  for (const rule of rules) {
    rule.regex.lastIndex = 0;
    result = result.replace(rule.regex, () => {
      hit.rule_ids.add(rule.id);
      hit.secret_digests.add(rule.secret_digest);
      hit.match_count += 1;
      return '[REDACTED:' + rule.id + ']';
    });
  }
  return result;
}

function redactValue(value: unknown, path: string[], rules: readonly RedactionRule[], hit: { rule_ids: Set<string>; secret_digests: Set<string>; match_count: number }): unknown {
  if (typeof value === 'string') return redactText(value, rules, hit);
  if (Array.isArray(value)) return value.map((item, index) => redactValue(item, path.concat(String(index)), rules, hit));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item, path.concat(key), rules, hit)]));
  return value;
}

function metadata(policy: RedactionPolicy, hit: { rule_ids: Set<string>; secret_digests: Set<string>; match_count: number }): RedactionMetadata {
  const projection = {
    policy_version: policy.policy_version,
    rule_ids: Array.from(hit.rule_ids).sort(),
    match_count: hit.match_count,
    secret_digests: Array.from(hit.secret_digests).sort(),
  };
  return {
    schema: PROVIDER_REDACTION_RESULT_SCHEMA,
    ...projection,
    policy: projection,
  };
}

export function redactProviderOutput(input: { policy: RedactionPolicy; stdout: string; stderr: string; final_message: string; task_result?: Record<string, unknown> }): ProviderRedactionResult {
  const { policy } = input;
  if (!policy || policy.schema !== PROVIDER_REDACTION_POLICY_SCHEMA || !Array.isArray(policy.rules)) {
    const fallback = createRedactionPolicy({ policy_version: 'invalid' });
    return { ...metadata(fallback, { rule_ids: new Set(), secret_digests: new Set(), match_count: 0 }), status: 'blocked', reason: 'redaction-invalid' };
  }
  const hit = { rule_ids: new Set<string>(), secret_digests: new Set<string>(), match_count: 0 };
  const critical = input.task_result !== undefined && scan(input.task_result, [], policy.rules, hit);
  if (critical) return { ...metadata(policy, hit), status: 'blocked', reason: 'critical-field-redaction' };
  const taskResult = input.task_result === undefined ? undefined : redactValue(input.task_result, [], policy.rules, hit) as Record<string, unknown>;
  const stdout = redactText(input.stdout, policy.rules, hit);
  const stderr = redactText(input.stderr, policy.rules, hit);
  const finalMessage = redactText(input.final_message, policy.rules, hit);
  return {
    ...metadata(policy, hit),
    status: 'redacted',
    stdout,
    stderr,
    final_message: finalMessage,
    ...(taskResult === undefined ? {} : { task_result: taskResult }),
  };
}
