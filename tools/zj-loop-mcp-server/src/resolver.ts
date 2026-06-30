import path from 'node:path';
import {
  createNodeProjectFileSystem,
  loadPatternRegistry,
  type PatternRegistry,
  type ProjectFileSystem,
  type RegistryPattern,
} from '@jununfly/zj-loop-core';

const STATE_FILE_CANDIDATES = [
  'STATE.md',
  'pr-babysitter-state.md',
  'ci-sweeper-state.md',
  'post-merge-state.md',
  'dependency-sweeper-state.md',
  'changelog-drafter-state.md',
  'issue-triage-state.md',
] as const;

/** Reject path segments that could escape the project root. */
export function assertSafeSegment(name: string, label: string): void {
  if (!name || name.includes('\0') || name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new Error(`Invalid ${label}: ${name}`);
  }
}

async function allowedPatternIds(root: string): Promise<Set<string>> {
  const registry = await loadRegistry(root);
  if (registry) return new Set(registry.patterns.map((p) => p.id));
  return new Set(await listPatternDocs(root));
}

function fsFor(root: string): ProjectFileSystem {
  return createNodeProjectFileSystem(root);
}

export async function fileExists(p: string): Promise<boolean> {
  return fsFor(path.dirname(p)).exists(path.basename(p));
}

export async function resolveProjectRoot(hint?: string): Promise<string> {
  if (hint) return path.resolve(hint);
  return process.env.LOOP_PROJECT_ROOT
    ? path.resolve(process.env.LOOP_PROJECT_ROOT)
    : process.cwd();
}

export async function readFileIfExists(filePath: string): Promise<string | null> {
  return fsFor(path.dirname(filePath)).readTextIfExists(path.basename(filePath));
}

export type PatternInfo = RegistryPattern;
export type RegistryData = PatternRegistry;

export interface SkillInfo {
  name: string;
  path: string;
  content: string;
}

export async function loadRegistry(root: string): Promise<RegistryData | null> {
  const fs = fsFor(root);
  if (!(await fs.exists('patterns/registry.yaml'))) return null;
  return loadPatternRegistry({ candidates: [fs.resolve('patterns/registry.yaml')] });
}

export async function loadPatternDoc(root: string, patternId: string): Promise<string | null> {
  try {
    assertSafeSegment(patternId, 'patternId');
  } catch {
    return null;
  }
  const allowed = await allowedPatternIds(root);
  if (!allowed.has(patternId)) return null;
  return fsFor(root).readTextIfExists(`patterns/${patternId}.md`);
}

export async function listSkills(root: string): Promise<SkillInfo[]> {
  const fs = fsFor(root);
  const skillDirs = [
    'skills',
    '.grok/skills',
    '.claude/skills',
    '.codex/skills',
  ];

  const results: SkillInfo[] = [];
  for (const dir of skillDirs) {
    const entries = await fs.listEntries(dir);
    for (const e of entries) {
      if (e.kind !== 'directory') continue;
      const skillPath = `${dir}/${e.name}/SKILL.md`;
      const content = await fs.readTextIfExists(skillPath);
      if (content) {
        results.push({ name: e.name, path: fs.resolve(skillPath), content });
      }
    }
  }
  return results;
}

export async function loadSkill(root: string, skillName: string): Promise<SkillInfo | null> {
  const skills = await listSkills(root);
  return skills.find(s => s.name === skillName) ?? null;
}

export async function loadState(root: string, stateFile?: string): Promise<string | null> {
  const target = stateFile ?? 'STATE.md';
  try {
    assertSafeSegment(target, 'stateFile');
  } catch {
    return null;
  }
  if (!(STATE_FILE_CANDIDATES as readonly string[]).includes(target)) return null;
  return fsFor(root).readTextIfExists(target);
}

export async function listStateFiles(root: string): Promise<string[]> {
  const fs = fsFor(root);
  const found: string[] = [];
  for (const f of STATE_FILE_CANDIDATES) {
    if (await fs.exists(f)) found.push(f);
  }
  return found;
}

export async function loadLoopConfig(root: string): Promise<string | null> {
  return fsFor(root).readTextIfExists('LOOP.md');
}

export async function loadBudget(root: string): Promise<string | null> {
  return fsFor(root).readTextIfExists('loop-budget.md');
}

export async function loadRunLog(root: string): Promise<string | null> {
  return fsFor(root).readTextIfExists('loop-run-log.md');
}

export async function loadSafetyDoc(root: string): Promise<string | null> {
  const fs = fsFor(root);
  for (const f of ['docs/safety.md', 'safety.md', 'SECURITY.md']) {
    const content = await fs.readTextIfExists(f);
    if (content) return content;
  }
  return null;
}

export async function listPatternDocs(root: string): Promise<string[]> {
  const entries = await fsFor(root).listEntries('patterns');
  return entries
    .filter(e => e.kind === 'file' && e.name.endsWith('.md') && e.name !== 'README.md')
    .map(e => e.name.replace('.md', ''));
}
