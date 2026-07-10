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
export declare const DEFAULT_STATE_FILES: readonly ["zj-loop/STATE.md", "zj-loop/pr-steward-state.md", "zj-loop/ci-sweeper-state.md", "zj-loop/post-merge-state.md", "zj-loop/dependency-sweeper-state.md", "zj-loop/changelog-drafter-state.md", "zj-loop/issue-triage-state.md"];
export declare const DEFAULT_REQUIRED_LOOP_FILES: readonly ["zj-loop/STATE.md", "zj-loop/ZJ-LOOP.md", "AGENTS.md"];
export declare const LOOP_CONFIG_FILE_CANDIDATES: readonly ["zj-loop/ZJ-LOOP.md"];
export declare const DEFAULT_SAFETY_FILES: readonly ["zj-loop/zj-loop-safety.md"];
export declare const DEFAULT_ROUTE_TABLE_FILES: readonly ["zj-loop/zj-loop-route-table.yaml"];
export declare const DEFAULT_MCP_FILES: readonly [".mcp.json", "mcp.json", ".mcp/config.json"];
export type ProjectProviderKind = 'github' | 'gitlab' | 'manual';
export declare const DEFAULT_LOOP_SKILL_NAMES: readonly ["zj-loop-triage", "zj-minimal-fix", "zj-loop-verifier", "zj-pr-review-triage", "zj-ci-triage", "zj-post-merge-scan", "zj-dependency-triage", "zj-rebase-and-clean", "zj-changelog-scan", "zj-loop-constraints", "zj-loop-budget", "zj-draft-release-notes", "zj-issue-triage"];
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
    provider: {
        kind: ProjectProviderKind;
        remote: string;
        githubActions: boolean;
        gitlabCi: boolean;
        glabMentioned: boolean;
    };
    skillNames: string[];
    loopSkillNames: string[];
    safety: {
        docPresent: boolean;
    };
    routeTable: {
        present: boolean;
    };
    mcp: {
        filePresent: boolean;
    };
}
export declare function createNodeProjectFileSystem(root: string): ProjectFileSystem;
export declare function findExistingProjectPaths(fs: ProjectFileSystem, candidates: readonly string[]): Promise<string[]>;
export declare function hasAnyProjectPath(fs: ProjectFileSystem, candidates: readonly string[]): Promise<boolean>;
export declare function readFirstProjectText(fs: ProjectFileSystem, candidates: readonly string[]): Promise<{
    path: string;
    content: string;
} | null>;
export declare function listProjectSkillNames(fs: ProjectFileSystem, options?: {
    skillDirs?: readonly string[];
    agentDirs?: readonly string[];
}): Promise<string[]>;
export declare function collectProjectEvidenceFacts(fs: ProjectFileSystem): Promise<ProjectEvidenceFacts>;
export declare function detectProjectProvider(input: {
    remote?: string;
    githubActions?: boolean;
    gitlabCi?: boolean;
    glabMentioned?: boolean;
}): ProjectProviderKind;
