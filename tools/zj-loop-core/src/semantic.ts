import type { PatternRegistry, RegistryPattern } from './registry.js';

export type ReadinessLevel = 'L1' | 'L2' | 'L3';

export const VALID_READINESS_LEVELS: ReadinessLevel[] = ['L1', 'L2', 'L3'];

export type SemanticSeverity = 'info' | 'warn' | 'error';

export interface SemanticSourceRef {
  kind: 'registry' | 'pattern-doc' | 'cost-policy' | 'recommendation-policy' | 'derived';
  path?: string;
  field?: string;
  patternId?: string;
}

export interface SemanticReason {
  code: string;
  message: string;
  scoreImpact?: number;
  source?: SemanticSourceRef;
}

export interface SemanticWarning {
  code: string;
  severity: SemanticSeverity;
  message: string;
  source?: SemanticSourceRef;
}

export interface SemanticQueryMeta {
  query: string;
  policyVersion: 1;
  sources: SemanticSourceRef[];
  warnings: SemanticWarning[];
}

export interface PatternSummary {
  id: string;
  name: string;
  goal?: string;
  cadence: string;
  risk?: string;
  weekOneMode?: string;
  tokenCostTier: string;
  stateFile?: string;
  requiredSkills: string[];
  humanGates: string[];
  starter?: string;
}

export interface ListPatternSummariesResult {
  meta: SemanticQueryMeta;
  patterns: PatternSummary[];
}

export interface PatternDocInput {
  path: string;
  text: string;
}

export interface PatternProfileRequest {
  patternId: string;
  patternDoc?: PatternDocInput;
}

export interface PatternProfileResult {
  meta: SemanticQueryMeta;
  pattern: RegistryPattern;
  summary: PatternSummary;
  documentation?: {
    path: string;
    text: string;
    present: true;
  };
}

export type PatternProfileError = {
  code: 'pattern_not_found';
  patternId: string;
  availablePatternIds: string[];
};

export interface RecommendPatternsRequest {
  useCase: string;
  level?: ReadinessLevel;
  risk?: 'low' | 'medium' | 'high' | string;
  cadence?: string;
  toolTarget?: 'grok' | 'claude' | 'codex' | string;
  limit?: number;
}

export interface PatternRecommendation {
  pattern: PatternSummary;
  score: number;
  confidence: 'low' | 'medium' | 'high';
  reasons: SemanticReason[];
  warnings: SemanticWarning[];
  disqualified: boolean;
}

export interface RecommendPatternsResult {
  meta: SemanticQueryMeta;
  request: RecommendPatternsRequest;
  recommendations: PatternRecommendation[];
}

export interface EstimatePatternCostRequest {
  patternId: string;
  level: ReadinessLevel;
  cadence?: string;
  conservative?: boolean;
}

export interface EstimateInput {
  pattern: RegistryPattern;
  cadence?: string;
  level: ReadinessLevel;
  conservative?: boolean;
}

export interface TokenScenario {
  tokensPerRun: number;
  tokensPerDay: number;
}

export interface RealisticTokenScenario extends TokenScenario {
  assumptions: string;
  mix: {
    noop: number;
    report: number;
    action: number;
  };
}

export interface PatternCostEstimate {
  patternId: string;
  patternName: string;
  cadence: string;
  level: ReadinessLevel;
  runsPerDay: number;
  tokenCostTier: string;
  suggestedDailyCap: number;
  earlyExitRequired: boolean;
  scenarios: {
    noop: TokenScenario;
    report: TokenScenario;
    action: TokenScenario;
    realistic: RealisticTokenScenario;
  };
  warnings: string[];
}

export type EstimateResult = PatternCostEstimate;

export interface EstimatePatternCostResult {
  meta: SemanticQueryMeta;
  estimate: PatternCostEstimate;
}

export type EstimatePatternCostError =
  | { code: 'pattern_not_found'; patternId: string; availablePatternIds: string[] }
  | { code: 'invalid_level'; level: string; validLevels: ReadinessLevel[] }
  | { code: 'invalid_cadence'; cadence: string; message: string };

export interface RequiredSkill {
  name: string;
  source: SemanticSourceRef;
  required: true;
}

export interface ListRequiredSkillsResult {
  meta: SemanticQueryMeta;
  patternId: string;
  skills: RequiredSkill[];
}

export type ListRequiredSkillsError = {
  code: 'pattern_not_found';
  patternId: string;
  availablePatternIds: string[];
};

const INTERVAL_MS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

function meta(query: string, sources: SemanticSourceRef[], warnings: SemanticWarning[] = []): SemanticQueryMeta {
  return { query, policyVersion: 1, sources, warnings };
}

function registrySource(field?: string, patternId?: string): SemanticSourceRef {
  return { kind: 'registry', path: 'patterns/registry.yaml', field, patternId };
}

function availablePatternIds(registry: PatternRegistry): string[] {
  return registry.patterns.map((p) => p.id);
}

function findPattern(registry: PatternRegistry, patternId: string): RegistryPattern | undefined {
  return registry.patterns.find((p) => p.id === patternId);
}

export function patternToSummary(pattern: RegistryPattern): PatternSummary {
  return {
    id: pattern.id,
    name: pattern.name,
    goal: pattern.goal,
    cadence: pattern.cadence,
    risk: pattern.risk,
    weekOneMode: pattern.week_one_mode,
    tokenCostTier: pattern.token_cost,
    stateFile: pattern.state,
    requiredSkills: pattern.skills,
    humanGates: pattern.human_gates,
    starter: pattern.starter,
  };
}

export function listPatternSummaries(registry: PatternRegistry): ListPatternSummariesResult {
  return {
    meta: meta('listPatternSummaries', [registrySource()]),
    patterns: registry.patterns.map(patternToSummary),
  };
}

export function getPatternProfile(
  registry: PatternRegistry,
  request: PatternProfileRequest,
): PatternProfileResult | PatternProfileError {
  const pattern = findPattern(registry, request.patternId);
  if (!pattern) {
    return { code: 'pattern_not_found', patternId: request.patternId, availablePatternIds: availablePatternIds(registry) };
  }

  const sources = [registrySource(undefined, pattern.id)];
  if (request.patternDoc) sources.push({ kind: 'pattern-doc', path: request.patternDoc.path, patternId: pattern.id });

  return {
    meta: meta('getPatternProfile', sources),
    pattern,
    summary: patternToSummary(pattern),
    documentation: request.patternDoc
      ? { path: request.patternDoc.path, text: request.patternDoc.text, present: true }
      : undefined,
  };
}

function pushReason(
  reasons: SemanticReason[],
  code: string,
  message: string,
  scoreImpact: number,
  source: SemanticSourceRef,
): number {
  reasons.push({ code, message, scoreImpact, source });
  return scoreImpact;
}

function includesNeedle(haystack: string | undefined, needle: string): boolean {
  return Boolean(haystack?.toLowerCase().includes(needle));
}

function confidenceFor(score: number): 'low' | 'medium' | 'high' {
  if (score >= 8) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

export function recommendPatterns(
  registry: PatternRegistry,
  request: RecommendPatternsRequest,
): RecommendPatternsResult {
  const lower = request.useCase.toLowerCase();
  const words = lower.split(/\s+/).filter((w) => w.length >= 3);

  const recommendations = registry.patterns.map((pattern) => {
    const reasons: SemanticReason[] = [];
    let score = 0;

    for (const word of words) {
      if (includesNeedle(pattern.id, word)) score += pushReason(reasons, 'match.id', `Matched pattern id: ${word}`, 2, registrySource('id', pattern.id));
      if (includesNeedle(pattern.name, word)) score += pushReason(reasons, 'match.name', `Matched pattern name: ${word}`, 2, registrySource('name', pattern.id));
      if (includesNeedle(pattern.goal, word)) score += pushReason(reasons, 'match.goal', `Matched pattern goal: ${word}`, 2, registrySource('goal', pattern.id));
      for (const skill of pattern.skills) {
        if (includesNeedle(skill, word)) score += pushReason(reasons, 'match.skill', `Matched required skill: ${skill}`, 2, registrySource('skills', pattern.id));
      }
      for (const phase of pattern.phases) {
        if (includesNeedle(phase, word)) score += pushReason(reasons, 'match.phase', `Matched phase: ${phase}`, 2, registrySource('phases', pattern.id));
      }
    }

    if (lower.includes('ci') && pattern.id.includes('ci')) score += pushReason(reasons, 'boost.ci', 'CI use case boost', 5, { kind: 'recommendation-policy', patternId: pattern.id });
    if (lower.includes('pr') && pattern.id.includes('pr')) score += pushReason(reasons, 'boost.pr', 'PR use case boost', 5, { kind: 'recommendation-policy', patternId: pattern.id });
    if (lower.includes('review') && pattern.id.includes('pr')) score += pushReason(reasons, 'boost.pr', 'Review use case boost', 3, { kind: 'recommendation-policy', patternId: pattern.id });
    if (lower.includes('depend') && pattern.id.includes('dependency')) score += pushReason(reasons, 'boost.dependency', 'Dependency use case boost', 5, { kind: 'recommendation-policy', patternId: pattern.id });
    if (lower.includes('issue') && pattern.id.includes('issue')) score += pushReason(reasons, 'boost.issue', 'Issue use case boost', 5, { kind: 'recommendation-policy', patternId: pattern.id });
    if (lower.includes('changelog') && pattern.id.includes('changelog')) score += pushReason(reasons, 'boost.changelog', 'Changelog use case boost', 5, { kind: 'recommendation-policy', patternId: pattern.id });

    return {
      pattern: patternToSummary(pattern),
      score,
      confidence: confidenceFor(score),
      reasons,
      warnings: [],
      disqualified: false,
    };
  });

  recommendations.sort((a, b) => b.score - a.score || a.pattern.id.localeCompare(b.pattern.id));

  return {
    meta: meta('recommendPatterns', [{ kind: 'registry', path: 'patterns/registry.yaml' }, { kind: 'recommendation-policy' }]),
    request,
    recommendations: recommendations.slice(0, request.limit ?? 3),
  };
}

export function assertValidLevel(level: string): asserts level is ReadinessLevel {
  if (!VALID_READINESS_LEVELS.includes(level as ReadinessLevel)) {
    throw new Error(`Invalid level: ${level}. Valid: ${VALID_READINESS_LEVELS.join(', ')}`);
  }
}

export function parseInterval(token: string): number {
  const m = token.match(/^(\d+)([mhd])$/);
  if (!m) throw new Error(`Invalid cadence interval: ${token}`);
  const unit = m[2] as keyof typeof INTERVAL_MS;
  return Number(m[1]) * INTERVAL_MS[unit];
}

export function runsPerDayForInterval(interval: string): number {
  const ms = parseInterval(interval);
  return Math.floor(86_400_000 / ms);
}

export function cadenceToRunsPerDay(cadence: string, conservative = false): number {
  const parts = cadence.split('-').map((p) => p.trim());
  if (parts.length === 1) return runsPerDayForInterval(parts[0]);

  const runs = parts.map(runsPerDayForInterval);
  return conservative ? Math.min(...runs) : Math.max(...runs);
}

function realisticMix(level: ReadinessLevel, earlyExitRequired: boolean): {
  noop: number;
  report: number;
  action: number;
  assumptions: string;
} {
  if (level === 'L1') {
    return {
      noop: earlyExitRequired ? 0.9 : 0.6,
      report: earlyExitRequired ? 0.1 : 0.4,
      action: 0,
      assumptions: earlyExitRequired
        ? 'L1: 90% early-exit, 10% full triage'
        : 'L1: 60% no-op, 40% full triage',
    };
  }
  if (level === 'L2') {
    return {
      noop: earlyExitRequired ? 0.85 : 0.5,
      report: earlyExitRequired ? 0.1 : 0.3,
      action: earlyExitRequired ? 0.05 : 0.2,
      assumptions: earlyExitRequired
        ? 'L2: 85% early-exit, 10% triage, 5% implementer+verifier'
        : 'L2: 50% no-op, 30% triage, 20% action',
    };
  }
  return {
    noop: 0.4,
    report: 0.35,
    action: 0.25,
        assumptions: 'L3: 40% no-op, 35% triage, 25% action (unattended — monitor closely)',
  };
}

function costWarnings(estimate: PatternCostEstimate): SemanticWarning[] {
  const warnings: SemanticWarning[] = [];
  const source: SemanticSourceRef = { kind: 'cost-policy', patternId: estimate.patternId };
  if (estimate.earlyExitRequired) {
    warnings.push({
      code: 'cost.early_exit_required',
      severity: 'warn',
      message: 'Early-exit triage is required - empty watchlist should exit in <5k tokens.',
      source,
    });
  }
  if (estimate.scenarios.action.tokensPerDay > estimate.suggestedDailyCap) {
    warnings.push({
      code: 'cost.action_exceeds_daily_cap',
      severity: 'warn',
      message: 'Worst case action-every-run scenario exceeds suggested daily cap.',
      source,
    });
  }
  if (estimate.scenarios.realistic.tokensPerDay > estimate.suggestedDailyCap) {
    warnings.push({
      code: 'cost.realistic_exceeds_daily_cap',
      severity: 'warn',
      message: 'Realistic estimate exceeds suggested daily cap.',
      source,
    });
  }
  if (estimate.runsPerDay >= 96) {
    warnings.push({
      code: 'cost.high_cadence',
      severity: 'warn',
      message: `High cadence (${estimate.runsPerDay} runs/day) - verify early-exit is working.`,
      source,
    });
  }
  return warnings;
}

function costWarningMessages(estimate: Omit<PatternCostEstimate, 'warnings'>): string[] {
  const warnings: string[] = [];
  if (estimate.earlyExitRequired) {
    warnings.push('Early-exit triage is required — empty watchlist should exit in <5k tokens.');
  }
  if (estimate.scenarios.action.tokensPerDay > estimate.suggestedDailyCap) {
    warnings.push('Worst case (action every run) exceeds suggested daily cap.');
  }
  if (estimate.scenarios.realistic.tokensPerDay > estimate.suggestedDailyCap) {
    warnings.push('Realistic estimate exceeds suggested daily cap — slow cadence or tighten scope.');
  }
  if (estimate.runsPerDay >= 96) {
    warnings.push(`High cadence (${estimate.runsPerDay} runs/day) — verify early-exit is working.`);
  }
  return warnings;
}

export function estimateCost(input: EstimateInput): EstimateResult {
  assertValidLevel(input.level);
  const cadence = input.cadence ?? input.pattern.cadence;
  const runsPerDay = cadenceToRunsPerDay(cadence, input.conservative);
  const { cost, token_cost: tokenCostTier } = input.pattern;
  const mix = realisticMix(input.level, cost.early_exit_required);

  const noopDay = cost.tokens_noop * runsPerDay;
  const reportDay = cost.tokens_report * runsPerDay;
  const actionDay = cost.tokens_action * runsPerDay;

  const realisticPerRun =
    cost.tokens_noop * mix.noop +
    cost.tokens_report * mix.report +
    cost.tokens_action * mix.action;
  const realisticDay = Math.round(realisticPerRun * runsPerDay);

  const estimate = {
    patternId: input.pattern.id,
    patternName: input.pattern.name,
    cadence,
    level: input.level,
    runsPerDay,
    tokenCostTier,
    suggestedDailyCap: cost.suggested_daily_cap,
    earlyExitRequired: cost.early_exit_required,
    scenarios: {
      noop: { tokensPerRun: cost.tokens_noop, tokensPerDay: noopDay },
      report: { tokensPerRun: cost.tokens_report, tokensPerDay: reportDay },
      action: { tokensPerRun: cost.tokens_action, tokensPerDay: actionDay },
      realistic: {
        tokensPerRun: Math.round(realisticPerRun),
        tokensPerDay: realisticDay,
        assumptions: mix.assumptions,
        mix: { noop: mix.noop, report: mix.report, action: mix.action },
      },
    },
  };
  return { ...estimate, warnings: costWarningMessages(estimate) };
}

export function estimatePatternCost(
  registry: PatternRegistry,
  request: EstimatePatternCostRequest,
): EstimatePatternCostResult | EstimatePatternCostError {
  if (!VALID_READINESS_LEVELS.includes(request.level as ReadinessLevel)) {
    return { code: 'invalid_level', level: request.level, validLevels: VALID_READINESS_LEVELS };
  }

  const pattern = findPattern(registry, request.patternId);
  if (!pattern) {
    return { code: 'pattern_not_found', patternId: request.patternId, availablePatternIds: availablePatternIds(registry) };
  }

  try {
    const estimate = estimateCost({
      pattern,
      cadence: request.cadence,
      level: request.level,
      conservative: request.conservative,
    });
    return {
      meta: meta('estimatePatternCost', [registrySource('cost', pattern.id), { kind: 'cost-policy', patternId: pattern.id }], costWarnings(estimate)),
      estimate,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { code: 'invalid_cadence', cadence: request.cadence ?? pattern.cadence, message };
  }
}

export function listRequiredSkills(
  registry: PatternRegistry,
  patternId: string,
): ListRequiredSkillsResult | ListRequiredSkillsError {
  const pattern = findPattern(registry, patternId);
  if (!pattern) {
    return { code: 'pattern_not_found', patternId, availablePatternIds: availablePatternIds(registry) };
  }

  return {
    meta: meta('listRequiredSkills', [registrySource('skills', pattern.id)]),
    patternId,
    skills: pattern.skills.map((name) => ({
      name,
      source: registrySource('skills', pattern.id),
      required: true,
    })),
  };
}
