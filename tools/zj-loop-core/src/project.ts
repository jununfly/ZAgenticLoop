import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

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

export const DEFAULT_SKILL_DIRS = [
  '.grok/skills',
  '.claude/skills',
  '.codex/skills',
  'skills',
] as const;

export const DEFAULT_AGENT_DIRS = [
  '.claude/agents',
  '.codex/agents',
] as const;

export const DEFAULT_STATE_FILES = [
  'zj-loop/STATE.md',
  'zj-loop/pr-babysitter-state.md',
  'zj-loop/ci-sweeper-state.md',
  'zj-loop/post-merge-state.md',
  'zj-loop/dependency-sweeper-state.md',
  'zj-loop/changelog-drafter-state.md',
  'zj-loop/issue-triage-state.md',
] as const;

export const DEFAULT_REQUIRED_LOOP_FILES = [
  'zj-loop/STATE.md',
  'zj-loop/ZJ-LOOP.md',
  'AGENTS.md',
] as const;

export const LOOP_CONFIG_FILE_CANDIDATES = [
  'zj-loop/ZJ-LOOP.md',
] as const;

export const DEFAULT_SAFETY_FILES = [
  'safety.md',
  'docs/safety.md',
  'SECURITY.md',
] as const;

export const DEFAULT_MCP_FILES = [
  '.mcp.json',
  'mcp.json',
  '.mcp/config.json',
] as const;

export const DEFAULT_LOOP_SKILL_NAMES = [
  'loop-triage',
  'minimal-fix',
  'loop-verifier',
  'pr-review-triage',
  'ci-triage',
  'post-merge-scan',
  'dependency-triage',
  'rebase-and-clean',
  'changelog-scan',
  'zj-loop-constraints',
  'zj-loop-budget',
  'draft-release-notes',
  'issue-triage',
] as const;

export interface ProjectEvidenceFacts {
  statePaths: string[];
  requiredLoopFiles: string[];
  missingRequiredLoopFiles: string[];
  loopConfig: { present: boolean; content: string };
  agentsMd: { present: boolean };
  github: { present: boolean; workflows: boolean };
  skillNames: string[];
  loopSkillNames: string[];
  safety: { docPresent: boolean };
  mcp: { filePresent: boolean };
}

function toProjectPath(relativePath: string): string {
  return relativePath === '.' ? '.' : path.normalize(relativePath);
}

export function createNodeProjectFileSystem(root: string): ProjectFileSystem {
  const projectRoot = path.resolve(root);

  return {
    root: projectRoot,
    resolve(relativePath: string): string {
      return path.join(projectRoot, toProjectPath(relativePath));
    },
    async exists(relativePath: string): Promise<boolean> {
      try {
        await stat(this.resolve(relativePath));
        return true;
      } catch {
        return false;
      }
    },
    async readTextIfExists(relativePath: string): Promise<string | null> {
      try {
        return await readFile(this.resolve(relativePath), 'utf8');
      } catch {
        return null;
      }
    },
    async listEntries(relativePath: string): Promise<ProjectDirectoryEntry[]> {
      try {
        const entries = await readdir(this.resolve(relativePath), { withFileTypes: true });
        return entries.map((entry) => ({
          name: entry.name,
          kind: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        }));
      } catch {
        return [];
      }
    },
  };
}

export async function findExistingProjectPaths(
  fs: ProjectFileSystem,
  candidates: readonly string[],
): Promise<string[]> {
  const paths: string[] = [];
  for (const candidate of candidates) {
    if (await fs.exists(candidate)) paths.push(candidate);
  }
  return paths;
}

export async function hasAnyProjectPath(
  fs: ProjectFileSystem,
  candidates: readonly string[],
): Promise<boolean> {
  return (await findExistingProjectPaths(fs, candidates)).length > 0;
}

export async function readFirstProjectText(
  fs: ProjectFileSystem,
  candidates: readonly string[],
): Promise<{ path: string; content: string } | null> {
  for (const candidate of candidates) {
    const content = await fs.readTextIfExists(candidate);
    if (content !== null) return { path: candidate, content };
  }
  return null;
}

export async function listProjectSkillNames(
  fs: ProjectFileSystem,
  options: {
    skillDirs?: readonly string[];
    agentDirs?: readonly string[];
  } = {},
): Promise<string[]> {
  const skillDirs = options.skillDirs ?? DEFAULT_SKILL_DIRS;
  const agentDirs = options.agentDirs ?? DEFAULT_AGENT_DIRS;
  const found: string[] = [];

  for (const dir of skillDirs) {
    const entries = await fs.listEntries(dir);
    for (const entry of entries) {
      if (entry.kind === 'directory') found.push(entry.name);
      if (entry.kind === 'file' && entry.name === 'SKILL.md') found.push('root-skill');
    }
  }

  for (const dir of agentDirs) {
    const entries = await fs.listEntries(dir);
    for (const entry of entries) {
      if (entry.kind !== 'file') continue;
      const base = entry.name.replace(/\.(md|toml)$/i, '');
      if (base.includes('verifier') || base === 'loop-verifier') {
        found.push('loop-verifier');
      }
    }
  }

  return found;
}

export async function collectProjectEvidenceFacts(fs: ProjectFileSystem): Promise<ProjectEvidenceFacts> {
  const statePaths = await findExistingProjectPaths(fs, DEFAULT_STATE_FILES);
  const requiredLoopFiles = await findExistingProjectPaths(fs, DEFAULT_REQUIRED_LOOP_FILES);
  const missingRequiredLoopFiles = DEFAULT_REQUIRED_LOOP_FILES.filter(
    (requiredFile) => !requiredLoopFiles.includes(requiredFile),
  );
  const loopConfig = await readFirstProjectText(fs, LOOP_CONFIG_FILE_CANDIDATES);
  const skillNames = await listProjectSkillNames(fs);

  return {
    statePaths,
    requiredLoopFiles,
    missingRequiredLoopFiles,
    loopConfig: {
      present: Boolean(loopConfig?.content.length),
      content: loopConfig?.content ?? '',
    },
    agentsMd: {
      present: await hasAnyProjectPath(fs, ['AGENTS.md', 'CLAUDE.md']),
    },
    github: {
      present: await fs.exists('.github'),
      workflows: await fs.exists('.github/workflows'),
    },
    skillNames,
    loopSkillNames: skillNames.filter((skillName) =>
      DEFAULT_LOOP_SKILL_NAMES.includes(skillName as (typeof DEFAULT_LOOP_SKILL_NAMES)[number]),
    ),
    safety: {
      docPresent: await hasAnyProjectPath(fs, DEFAULT_SAFETY_FILES),
    },
    mcp: {
      filePresent: await hasAnyProjectPath(fs, DEFAULT_MCP_FILES),
    },
  };
}
