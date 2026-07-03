import path from 'node:path';
import {
  createNodeProjectFileSystem,
  loadPatternRegistry,
  type PatternRegistry,
  type ProjectFileSystem,
  type RegistryPattern,
} from '@jununfly/zj-loop-core';

const STATE_FILE_CANDIDATES = [
  'zj-loop/STATE.md',
  'zj-loop/pr-babysitter-state.md',
  'zj-loop/ci-sweeper-state.md',
  'zj-loop/post-merge-state.md',
  'zj-loop/dependency-sweeper-state.md',
  'zj-loop/changelog-drafter-state.md',
  'zj-loop/issue-triage-state.md',
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

async function readFirstProjectText(
  fs: ProjectFileSystem,
  candidates: readonly string[],
): Promise<{ path: string; content: string } | null> {
  for (const candidate of candidates) {
    const content = await fs.readTextIfExists(candidate);
    if (content !== null) return { path: candidate, content };
  }
  return null;
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
  const target = stateFile ?? 'zj-loop/STATE.md';
  if (!target || target.includes('\0') || target.includes('..') || target.includes('\\')) {
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
  return (await readFirstProjectText(fsFor(root), ['zj-loop/ZJ-LOOP.md']))?.content ?? null;
}

export async function loadBudget(root: string): Promise<string | null> {
  return (await readFirstProjectText(fsFor(root), ['zj-loop/zj-loop-budget.md']))?.content ?? null;
}

export async function loadRunLog(root: string): Promise<string | null> {
  return (await readFirstProjectText(fsFor(root), ['zj-loop/zj-loop-run-log.md']))?.content ?? null;
}

export async function loadSafetyDoc(root: string): Promise<string | null> {
  const fs = fsFor(root);
  for (const f of ['docs/safety.md', 'safety.md', 'SECURITY.md']) {
    const content = await fs.readTextIfExists(f);
    if (content) return content;
  }
  return null;
}

function summarizeMarkdown(content: string | null, limit = 6): string[] {
  if (!content) return [];
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== '---')
    .slice(0, limit)
    .map((line) => line.length > 180 ? `${line.slice(0, 177)}...` : line);
}

async function summarizeFixedDocument(
  root: string,
  key: OperationalDocumentSummary['key'],
  uri: string,
  candidates: readonly string[],
): Promise<OperationalDocumentSummary> {
  const fs = fsFor(root);
  for (const candidate of candidates) {
    const content = await fs.readTextIfExists(candidate);
    if (content) {
      return {
        key,
        uri,
        path: candidate,
        present: true,
        highlights: summarizeMarkdown(content),
      };
    }
  }
  return { key, uri, path: null, present: false, highlights: [] };
}

export async function summarizeOperationalContext(root: string): Promise<OperationalContextSummary> {
  const documents = await Promise.all([
    summarizeFixedDocument(root, 'config', 'loop://config', ['zj-loop/ZJ-LOOP.md']),
    summarizeFixedDocument(root, 'budget', 'loop://budget', ['zj-loop/zj-loop-budget.md']),
    summarizeFixedDocument(root, 'runLog', 'loop://run-log', ['zj-loop/zj-loop-run-log.md']),
    summarizeFixedDocument(root, 'safety', 'loop://safety', ['docs/safety.md', 'safety.md', 'SECURITY.md']),
  ]);

  return {
    documents,
    missing: documents.filter((doc) => !doc.present).map((doc) => doc.key),
    rawResources: documents.map((doc) => doc.uri),
  };
}

export async function listPatternDocs(root: string): Promise<string[]> {
  const entries = await fsFor(root).listEntries('patterns');
  return entries
    .filter(e => e.kind === 'file' && e.name.endsWith('.md') && e.name !== 'README.md')
    .map(e => e.name.replace('.md', ''));
}
