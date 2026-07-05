import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { Finding, FindingCategory, LoopSignals, NextStep } from './auditor.js';

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
    'Not loop-ready — start with a starter from this repo (minimal-loop or pr-steward).';

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
        category: rule.finding.category,
        message: renderTemplate(rule.finding.message, signals),
        affectsScore: rule.finding.affectsScore,
        nextSteps: rule.finding.nextSteps.map((step) => renderNextStep(step, signals)),
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

function renderNextStep(step: NextStep, signals: LoopSignals): NextStep {
  if ('command' in step) {
    return {
      ...step,
      label: renderTemplate(step.label, signals),
      command: renderTemplate(step.command, signals),
    };
  }

  return {
    ...step,
    label: renderTemplate(step.label, signals),
  };
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
  for (const [index, rule] of (policy.guidance ?? []).entries()) {
    if (!rule.finding) continue;
    assertFinding(rule.finding, `guidance[${index}].finding`);
  }
}

function assertFinding(finding: Finding, path: string): void {
  if (!['ok', 'warn', 'fail'].includes(finding.level)) {
    throw new Error(`${path}.level must be ok, warn, or fail.`);
  }
  if (!isFindingCategory(finding.category)) {
    throw new Error(`${path}.category must be pass, blocker, readiness-gap, hardening, or future-tooling.`);
  }
  if (typeof finding.message !== 'string' || finding.message.length === 0) {
    throw new Error(`${path}.message must be a non-empty string.`);
  }
  if (typeof finding.affectsScore !== 'boolean') {
    throw new Error(`${path}.affectsScore must be a boolean.`);
  }
  if (!Array.isArray(finding.nextSteps)) {
    throw new Error(`${path}.nextSteps must be an array.`);
  }
  for (const [index, step] of finding.nextSteps.entries()) {
    assertNextStep(step, `${path}.nextSteps[${index}]`);
  }
}

function isFindingCategory(value: unknown): value is FindingCategory {
  return value === 'pass' ||
    value === 'blocker' ||
    value === 'readiness-gap' ||
    value === 'hardening' ||
    value === 'future-tooling';
}

function assertNextStep(step: NextStep, path: string): void {
  if (!step || typeof step !== 'object') throw new Error(`${path} must be an object.`);
  if (!['command', 'manual-review', 'validate', 'info'].includes(step.kind)) {
    throw new Error(`${path}.kind must be command, manual-review, validate, or info.`);
  }
  if (typeof step.label !== 'string' || step.label.length === 0) {
    throw new Error(`${path}.label must be a non-empty string.`);
  }
  if ((step.kind === 'command' || step.kind === 'validate') && typeof step.command !== 'string') {
    throw new Error(`${path}.command must be a string for ${step.kind} steps.`);
  }
}
