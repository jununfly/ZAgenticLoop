export interface LoopSignals {
    stateFile: {
        present: boolean;
        paths: string[];
    };
    loopConfig: {
        present: boolean;
        path?: string;
    };
    skills: {
        count: number;
        loopSkills: string[];
    };
    verifier: {
        present: boolean;
    };
    triage: {
        present: boolean;
    };
    agentsMd: {
        present: boolean;
    };
    patterns: {
        documented: boolean;
    };
    safety: {
        loopMdMentionsSafety: boolean;
        safetyDocPresent: boolean;
    };
    routeTable: {
        present: boolean;
    };
    starters: {
        used: boolean;
    };
    github: {
        present: boolean;
        workflows: boolean;
    };
    provider: {
        kind: 'github' | 'gitlab' | 'manual';
        remote: string;
        githubActions: boolean;
        gitlabCi: boolean;
        glabMentioned: boolean;
    };
    mcp: {
        present: boolean;
    };
    worktreeEvidence: {
        present: boolean;
    };
    registry: {
        present: boolean;
    };
    cost: {
        budgetDoc: boolean;
        runLog: boolean;
        loopMdBudget: boolean;
        budgetSkill: boolean;
    };
    constraints: {
        present: boolean;
        hasConstraintsSkill: boolean;
    };
    loopActivity: {
        present: boolean;
        evidence: string[];
    };
}
export interface Finding {
    level: 'ok' | 'warn' | 'fail';
    category: FindingCategory;
    message: string;
    affectsScore: boolean;
    nextSteps: NextStep[];
}
export type FindingCategory = 'pass' | 'blocker' | 'readiness-gap' | 'hardening' | 'future-tooling';
export type NextStep = {
    kind: 'command';
    label: string;
    command: string;
} | {
    kind: 'manual-review';
    label: string;
} | {
    kind: 'validate';
    label: string;
    command: string;
} | {
    kind: 'info';
    label: string;
};
export interface AuditResult {
    target: string;
    score: number;
    level: 'L0' | 'L1' | 'L2' | 'L3';
    assessment: string;
    signals: LoopSignals;
    findings: Finding[];
    recommendations: string[];
}
export declare function computeScore(signals: LoopSignals): {
    score: number;
    level: 'L0' | 'L1' | 'L2' | 'L3';
    assessment: string;
};
export declare function auditProject(target: string): Promise<AuditResult>;
