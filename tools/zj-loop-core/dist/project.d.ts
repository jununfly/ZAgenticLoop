export type ProjectEntryKind = 'file' | 'directory' | 'other';
export interface ProjectDirectoryEntry {
    name: string;
    kind: ProjectEntryKind;
}
export interface ProjectFileSystem {
    root: string;
    resolve(relativePath: string): string;
    exists(relativePath: string): Promise<boolean>;
    readTextIfExists(relativePath: string): Promise<string | null>;
    listEntries(relativePath: string): Promise<ProjectDirectoryEntry[]>;
}
export declare const DEFAULT_SKILL_DIRS: readonly [".grok/skills", ".claude/skills", ".codex/skills", "skills"];
export declare const DEFAULT_AGENT_DIRS: readonly [".claude/agents", ".codex/agents"];
export declare function createNodeProjectFileSystem(root: string): ProjectFileSystem;
export declare function findExistingProjectPaths(fs: ProjectFileSystem, candidates: readonly string[]): Promise<string[]>;
export declare function hasAnyProjectPath(fs: ProjectFileSystem, candidates: readonly string[]): Promise<boolean>;
export declare function listProjectSkillNames(fs: ProjectFileSystem, options?: {
    skillDirs?: readonly string[];
    agentDirs?: readonly string[];
}): Promise<string[]>;
