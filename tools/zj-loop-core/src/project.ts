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
