import type { LoopSignals } from './auditor.js';
export type ReadinessLevel = 'L0' | 'L1' | 'L2' | 'L3';
type Condition = string | {
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
export type ReadinessPolicy = {
    schemaVersion: 1;
    score: {
        base: number;
        contributions: ScoreContribution[];
    };
    predicates: Record<string, Condition>;
    levels: LevelRule[];
    assessments: AssessmentRule[];
};
export type ReadinessEvaluation = {
    score: number;
    level: ReadinessLevel;
    assessment: string;
};
export declare function loadDefaultReadinessPolicy(): ReadinessPolicy;
export declare function parseReadinessPolicy(source: string): ReadinessPolicy;
export declare function evaluateReadinessPolicy(signals: LoopSignals, policy?: ReadinessPolicy): ReadinessEvaluation;
export {};
