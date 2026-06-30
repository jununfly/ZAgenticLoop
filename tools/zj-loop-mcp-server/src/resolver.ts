import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { loadPatternRegistry, type PatternRegistry, type RegistryPattern } from '@jununfly/zj-loop-core';

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

export async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function resolveProjectRoot(hint?: string): Promise<string> {
  if (hint) return path.resolve(hint);
  return process.env.LOOP_PROJECT_ROOT
    ? path.resolve(process.env.LOOP_PROJECT_ROOT)
    : process.cwd();
}

export async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

export type PatternInfo = RegistryPattern;
export type RegistryData = PatternRegistry;

export interface SkillInfo {
  name: string;
  path: string;
  content: string;
}

export async function loadRegistry(root: string): Promise<RegistryData | null> {
  const registryPath = path.join(root, 'patterns', 'registry.yaml');
  if (!(await fileExists(registryPath))) return null;
  return loadPatternRegistry({ candidates: [registryPath] });
}

export async function loadPatternDoc(root: string, patternId: string): Promise<string | null> {
  try {
    assertSafeSegment(patternId, 'patternId');
  } catch {
    return null;
  }
  const allowed = await allowedPatternIds(root);
  if (!allowed.has(patternId)) return null;
  const filePath = path.join(root, 'patterns', `${patternId}.md`);
  return readFileIfExists(filePath);
}

export async function listSkills(root: string): Promise<SkillInfo[]> {
  const skillDirs = [
    path.join(root, 'skills'),
    path.join(root, '.grok', 'skills'),
    path.join(root, '.claude', 'skills'),
    path.join(root, '.codex', 'skills'),
  ];

  const results: SkillInfo[] = [];
  for (const dir of skillDirs) {
    if (!(await fileExists(dir))) continue;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const skillMd = path.join(dir, e.name, 'SKILL.md');
        const content = await readFileIfExists(skillMd);
        if (content) {
          results.push({ name: e.name, path: skillMd, content });
        }
      }
    } catch { /* dir unreadable */ }
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
  return readFileIfExists(path.join(root, target));
}

export async function listStateFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const f of STATE_FILE_CANDIDATES) {
    if (await fileExists(path.join(root, f))) found.push(f);
  }
  return found;
}

export async function loadLoopConfig(root: string): Promise<string | null> {
  return readFileIfExists(path.join(root, 'LOOP.md'));
}

export async function loadBudget(root: string): Promise<string | null> {
  return readFileIfExists(path.join(root, 'loop-budget.md'));
}

export async function loadRunLog(root: string): Promise<string | null> {
  return readFileIfExists(path.join(root, 'loop-run-log.md'));
}

export async function loadSafetyDoc(root: string): Promise<string | null> {
  for (const f of ['docs/safety.md', 'safety.md', 'SECURITY.md']) {
    const content = await readFileIfExists(path.join(root, f));
    if (content) return content;
  }
  return null;
}

export async function listPatternDocs(root: string): Promise<string[]> {
  const patternsDir = path.join(root, 'patterns');
  if (!(await fileExists(patternsDir))) return [];
  try {
    const entries = await readdir(patternsDir);
    return entries
      .filter(e => e.endsWith('.md') && e !== 'README.md')
      .map(e => e.replace('.md', ''));
  } catch {
    return [];
  }
}
