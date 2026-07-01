import { type PatternRegistry, type RegistryPattern } from '@jununfly/zj-loop-core';
/** Reject path segments that could escape the project root. */
export declare function assertSafeSegment(name: string, label: string): void;
export declare function fileExists(p: string): Promise<boolean>;
export declare function resolveProjectRoot(hint?: string): Promise<string>;
export declare function readFileIfExists(filePath: string): Promise<string | null>;
export type PatternInfo = RegistryPattern;
export type RegistryData = PatternRegistry;
export interface SkillInfo {
    name: string;
    path: string;
    content: string;
}
export interface OperationalDocumentSummary {
    key: 'config' | 'budget' | 'runLog' | 'safety';
    uri: string;
    path: string | null;
    present: boolean;
    highlights: string[];
}
export interface OperationalContextSummary {
    documents: OperationalDocumentSummary[];
    missing: string[];
    rawResources: string[];
}
export declare function loadRegistry(root: string): Promise<RegistryData | null>;
export declare function loadPatternDoc(root: string, patternId: string): Promise<string | null>;
export declare function listSkills(root: string): Promise<SkillInfo[]>;
export declare function loadSkill(root: string, skillName: string): Promise<SkillInfo | null>;
export declare function loadState(root: string, stateFile?: string): Promise<string | null>;
export declare function listStateFiles(root: string): Promise<string[]>;
export declare function loadLoopConfig(root: string): Promise<string | null>;
export declare function loadBudget(root: string): Promise<string | null>;
export declare function loadRunLog(root: string): Promise<string | null>;
export declare function loadSafetyDoc(root: string): Promise<string | null>;
export declare function summarizeOperationalContext(root: string): Promise<OperationalContextSummary>;
export declare function listPatternDocs(root: string): Promise<string[]>;
