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
export declare const DEFAULT_STATE_FILES: readonly ["STATE.md", "pr-babysitter-state.md", "ci-sweeper-state.md", "post-merge-state.md", "dependency-sweeper-state.md", "changelog-drafter-state.md", "issue-triage-state.md"];
export declare const DEFAULT_REQUIRED_LOOP_FILES: readonly ["STATE.md", "LOOP.md", "AGENTS.md"];
export declare const DEFAULT_SAFETY_FILES: readonly ["safety.md", "docs/safety.md", "SECURITY.md"];
export declare const DEFAULT_MCP_FILES: readonly [".mcp.json", "mcp.json", ".mcp/config.json"];
export declare const DEFAULT_LOOP_SKILL_NAMES: readonly ["loop-triage", "minimal-fix", "loop-verifier", "pr-review-triage", "ci-triage", "post-merge-scan", "dependency-triage", "rebase-and-clean", "changelog-scan", "loop-constraints", "draft-release-notes", "issue-triage"];
export interface ProjectEvidenceFacts {
    statePaths: string[];
    requiredLoopFiles: string[];
    missingRequiredLoopFiles: string[];
    loopConfig: {
        present: boolean;
        content: string;
    };
    agentsMd: {
        present: boolean;
    };
    github: {
        present: boolean;
        workflows: boolean;
    };
    skillNames: string[];
    loopSkillNames: string[];
    safety: {
        docPresent: boolean;
    };
    mcp: {
        filePresent: boolean;
    };
}
export declare function createNodeProjectFileSystem(root: string): ProjectFileSystem;
export declare function findExistingProjectPaths(fs: ProjectFileSystem, candidates: readonly string[]): Promise<string[]>;
export declare function hasAnyProjectPath(fs: ProjectFileSystem, candidates: readonly string[]): Promise<boolean>;
export declare function listProjectSkillNames(fs: ProjectFileSystem, options?: {
    skillDirs?: readonly string[];
    agentDirs?: readonly string[];
}): Promise<string[]>;
export declare function collectProjectEvidenceFacts(fs: ProjectFileSystem): Promise<ProjectEvidenceFacts>;
