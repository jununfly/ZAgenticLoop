import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
const DEFAULT_POLICY_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../rules/readiness.v1.yaml');
let cachedDefaultPolicy;
export function loadDefaultReadinessPolicy() {
    cachedDefaultPolicy ??= parseReadinessPolicy(readFileSync(DEFAULT_POLICY_PATH, 'utf8'));
    return cachedDefaultPolicy;
}
export function parseReadinessPolicy(source) {
    const policy = parse(source);
    assertPolicy(policy);
    return policy;
}
export function evaluateReadinessPolicy(signals, policy = loadDefaultReadinessPolicy()) {
    const score = clampScore(policy.score.base +
        policy.score.contributions.reduce((sum, contribution) => {
            return sum + (evaluateCondition(contribution.when, { signals, policy }) ? contribution.points : 0);
        }, 0));
    const level = policy.levels.find((rule) => {
        return score >= rule.threshold && (!rule.when || evaluateCondition(rule.when, { signals, policy, score }));
    })?.level ?? 'L0';
    const assessment = policy.assessments.find((rule) => !rule.when || evaluateCondition(rule.when, { signals, policy, score }))?.message ??
        'Not loop-ready — start with a starter from this repo (minimal-loop or pr-babysitter).';
    return { score, level, assessment };
}
function evaluateCondition(condition, context) {
    if (typeof condition === 'string') {
        return Boolean(readPath(context.signals, condition));
    }
    if (condition.all)
        return condition.all.every((item) => evaluateCondition(item, context));
    if (condition.any)
        return condition.any.some((item) => evaluateCondition(item, context));
    if (condition.not)
        return !evaluateCondition(condition.not, context);
    if (condition.predicate) {
        const predicate = context.policy.predicates[condition.predicate];
        if (!predicate)
            throw new Error(`Unknown readiness predicate: ${condition.predicate}`);
        return evaluateCondition(predicate, context);
    }
    if (condition.scoreGte !== undefined) {
        return (context.score ?? 0) >= condition.scoreGte;
    }
    if (condition.path) {
        const value = readPath(context.signals, condition.path);
        if ('eq' in condition)
            return value === condition.eq;
        if (condition.gte !== undefined)
            return typeof value === 'number' && value >= condition.gte;
        return Boolean(value);
    }
    throw new Error(`Invalid readiness condition: ${JSON.stringify(condition)}`);
}
function readPath(source, dotPath) {
    return dotPath.split('.').reduce((current, key) => {
        if (current && typeof current === 'object' && key in current) {
            return current[key];
        }
        return undefined;
    }, source);
}
function clampScore(score) {
    return Math.min(100, Math.max(0, score));
}
function assertPolicy(policy) {
    if (policy?.schemaVersion !== 1)
        throw new Error('Unsupported readiness policy schemaVersion.');
    if (typeof policy.score?.base !== 'number')
        throw new Error('Readiness policy score.base must be a number.');
    if (!Array.isArray(policy.score?.contributions))
        throw new Error('Readiness policy score.contributions must be an array.');
    if (!Array.isArray(policy.levels))
        throw new Error('Readiness policy levels must be an array.');
    if (!Array.isArray(policy.assessments))
        throw new Error('Readiness policy assessments must be an array.');
}
