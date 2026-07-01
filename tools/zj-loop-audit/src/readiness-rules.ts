import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { Finding, LoopSignals } from './auditor.js';

export type ReadinessLevel = 'L0' | 'L1' | 'L2' | 'L3';

type Condition =
  | string
  | {
      path?: string;
      eq?: unknown;
      gte?: number;
      predicate?: string;
      scoreGte?: number;
      all?: Condition[];
      any?: Condition[];
      not?: Condition;
    };

type ScoreContribution = {
  id: string;
  when: Condition;
  points: number;
};

type LevelRule = {
  level: ReadinessLevel;
  threshold: number;
  when?: Condition;
};

type AssessmentRule = {
  when?: Condition;
  message: string;
};

type GuidanceRule = {
  when?: Condition;
  finding?: Finding;
  recommendations?: string[];
};

export type ReadinessPolicy = {
  schemaVersion: 1;
  score: {
    base: number;
    contributions: ScoreContribution[];
  };
  predicates: Record<string, Condition>;
  levels: LevelRule[];
  assessments: AssessmentRule[];
  guidance?: GuidanceRule[];
};

export type ReadinessEvaluation = {
  score: number;
  level: ReadinessLevel;
  assessment: string;
};

export type ReadinessGuidance = {
  findings: Finding[];
  recommendations: string[];
};

const DEFAULT_POLICY_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../rules/readiness.v1.yaml',
);

let cachedDefaultPolicy: ReadinessPolicy | undefined;

export function loadDefaultReadinessPolicy(): ReadinessPolicy {
  cachedDefaultPolicy ??= parseReadinessPolicy(readFileSync(DEFAULT_POLICY_PATH, 'utf8'));
  return cachedDefaultPolicy;
}

export function parseReadinessPolicy(source: string): ReadinessPolicy {
  const policy = parse(source) as ReadinessPolicy;
  assertPolicy(policy);
  return policy;
}

export function evaluateReadinessPolicy(
  signals: LoopSignals,
  policy: ReadinessPolicy = loadDefaultReadinessPolicy(),
): ReadinessEvaluation {
  const score = clampScore(
    policy.score.base +
      policy.score.contributions.reduce((sum, contribution) => {
        return sum + (evaluateCondition(contribution.when, { signals, policy }) ? contribution.points : 0);
      }, 0),
  );

  const level = policy.levels.find((rule) => {
    return score >= rule.threshold && (!rule.when || evaluateCondition(rule.when, { signals, policy, score }));
  })?.level ?? 'L0';

  const assessment =
    policy.assessments.find((rule) => !rule.when || evaluateCondition(rule.when, { signals, policy, score }))?.message ??
    'Not loop-ready — start with a starter from this repo (minimal-loop or pr-babysitter).';

  return { score, level, assessment };
}

export function evaluateReadinessGuidance(
  signals: LoopSignals,
  score: number,
  policy: ReadinessPolicy = loadDefaultReadinessPolicy(),
): ReadinessGuidance {
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  for (const rule of policy.guidance ?? []) {
    if (rule.when && !evaluateCondition(rule.when, { signals, policy, score })) continue;

    if (rule.finding) {
      findings.push({
        level: rule.finding.level,
        message: renderTemplate(rule.finding.message, signals),
      });
    }

    for (const recommendation of rule.recommendations ?? []) {
      recommendations.push(renderTemplate(recommendation, signals));
    }
  }

  return { findings, recommendations };
}

function evaluateCondition(
  condition: Condition,
  context: { signals: LoopSignals; policy: ReadinessPolicy; score?: number },
): boolean {
  if (typeof condition === 'string') {
    return Boolean(readPath(context.signals, condition));
  }

  if (condition.all) return condition.all.every((item) => evaluateCondition(item, context));
  if (condition.any) return condition.any.some((item) => evaluateCondition(item, context));
  if (condition.not) return !evaluateCondition(condition.not, context);

  if (condition.predicate) {
    const predicate = context.policy.predicates[condition.predicate];
    if (!predicate) throw new Error(`Unknown readiness predicate: ${condition.predicate}`);
    return evaluateCondition(predicate, context);
  }

  if (condition.scoreGte !== undefined) {
    return (context.score ?? 0) >= condition.scoreGte;
  }

  if (condition.path) {
    const value = readPath(context.signals, condition.path);
    if ('eq' in condition) return value === condition.eq;
    if (condition.gte !== undefined) return typeof value === 'number' && value >= condition.gte;
    return Boolean(value);
  }

  throw new Error(`Invalid readiness condition: ${JSON.stringify(condition)}`);
}

function readPath(source: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

function renderTemplate(template: string, signals: LoopSignals): string {
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_match, key: string) => {
    const value = readPath(signals, key);
    if (Array.isArray(value)) return value.join(', ');
    if (value === undefined || value === null) return '';
    return String(value);
  });
}

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, score));
}

function assertPolicy(policy: ReadinessPolicy): void {
  if (policy?.schemaVersion !== 1) throw new Error('Unsupported readiness policy schemaVersion.');
  if (typeof policy.score?.base !== 'number') throw new Error('Readiness policy score.base must be a number.');
  if (!Array.isArray(policy.score?.contributions)) throw new Error('Readiness policy score.contributions must be an array.');
  if (!Array.isArray(policy.levels)) throw new Error('Readiness policy levels must be an array.');
  if (!Array.isArray(policy.assessments)) throw new Error('Readiness policy assessments must be an array.');
  if (policy.guidance !== undefined && !Array.isArray(policy.guidance)) throw new Error('Readiness policy guidance must be an array.');
}
