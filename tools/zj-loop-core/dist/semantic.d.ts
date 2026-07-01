import type { PatternRegistry, RegistryPattern } from './registry.js';
export type ReadinessLevel = 'L1' | 'L2' | 'L3';
export declare const VALID_READINESS_LEVELS: ReadinessLevel[];
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
export type EstimatePatternCostError = {
    code: 'pattern_not_found';
    patternId: string;
    availablePatternIds: string[];
} | {
    code: 'invalid_level';
    level: string;
    validLevels: ReadinessLevel[];
} | {
    code: 'invalid_cadence';
    cadence: string;
    message: string;
};
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
export declare function patternToSummary(pattern: RegistryPattern): PatternSummary;
export declare function listPatternSummaries(registry: PatternRegistry): ListPatternSummariesResult;
export declare function getPatternProfile(registry: PatternRegistry, request: PatternProfileRequest): PatternProfileResult | PatternProfileError;
export declare function recommendPatterns(registry: PatternRegistry, request: RecommendPatternsRequest): RecommendPatternsResult;
export declare function assertValidLevel(level: string): asserts level is ReadinessLevel;
export declare function parseInterval(token: string): number;
export declare function runsPerDayForInterval(interval: string): number;
export declare function cadenceToRunsPerDay(cadence: string, conservative?: boolean): number;
export declare function estimateCost(input: EstimateInput): EstimateResult;
export declare function estimatePatternCost(registry: PatternRegistry, request: EstimatePatternCostRequest): EstimatePatternCostResult | EstimatePatternCostError;
export declare function listRequiredSkills(registry: PatternRegistry, patternId: string): ListRequiredSkillsResult | ListRequiredSkillsError;
