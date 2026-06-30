import path from 'node:path';
import { createNodeProjectFileSystem, loadPatternRegistry, } from '@jununfly/zj-loop-core';
const STATE_FILE_CANDIDATES = [
    'STATE.md',
    'pr-babysitter-state.md',
    'ci-sweeper-state.md',
    'post-merge-state.md',
    'dependency-sweeper-state.md',
    'changelog-drafter-state.md',
    'issue-triage-state.md',
];
/** Reject path segments that could escape the project root. */
export function assertSafeSegment(name, label) {
    if (!name || name.includes('\0') || name.includes('..') || name.includes('/') || name.includes('\\')) {
        throw new Error(`Invalid ${label}: ${name}`);
    }
}
async function allowedPatternIds(root) {
    const registry = await loadRegistry(root);
    if (registry)
        return new Set(registry.patterns.map((p) => p.id));
    return new Set(await listPatternDocs(root));
}
function fsFor(root) {
    return createNodeProjectFileSystem(root);
}
export async function fileExists(p) {
    return fsFor(path.dirname(p)).exists(path.basename(p));
}
export async function resolveProjectRoot(hint) {
    if (hint)
        return path.resolve(hint);
    return process.env.LOOP_PROJECT_ROOT
        ? path.resolve(process.env.LOOP_PROJECT_ROOT)
        : process.cwd();
}
export async function readFileIfExists(filePath) {
    return fsFor(path.dirname(filePath)).readTextIfExists(path.basename(filePath));
}
export async function loadRegistry(root) {
    const fs = fsFor(root);
    if (!(await fs.exists('patterns/registry.yaml')))
        return null;
    return loadPatternRegistry({ candidates: [fs.resolve('patterns/registry.yaml')] });
}
export async function loadPatternDoc(root, patternId) {
    try {
        assertSafeSegment(patternId, 'patternId');
    }
    catch {
        return null;
    }
    const allowed = await allowedPatternIds(root);
    if (!allowed.has(patternId))
        return null;
    return fsFor(root).readTextIfExists(`patterns/${patternId}.md`);
}
export async function listSkills(root) {
    const fs = fsFor(root);
    const skillDirs = [
        'skills',
        '.grok/skills',
        '.claude/skills',
        '.codex/skills',
    ];
    const results = [];
    for (const dir of skillDirs) {
        const entries = await fs.listEntries(dir);
        for (const e of entries) {
            if (e.kind !== 'directory')
                continue;
            const skillPath = `${dir}/${e.name}/SKILL.md`;
            const content = await fs.readTextIfExists(skillPath);
            if (content) {
                results.push({ name: e.name, path: fs.resolve(skillPath), content });
            }
        }
    }
    return results;
}
export async function loadSkill(root, skillName) {
    const skills = await listSkills(root);
    return skills.find(s => s.name === skillName) ?? null;
}
export async function loadState(root, stateFile) {
    const target = stateFile ?? 'STATE.md';
    try {
        assertSafeSegment(target, 'stateFile');
    }
    catch {
        return null;
    }
    if (!STATE_FILE_CANDIDATES.includes(target))
        return null;
    return fsFor(root).readTextIfExists(target);
}
export async function listStateFiles(root) {
    const fs = fsFor(root);
    const found = [];
    for (const f of STATE_FILE_CANDIDATES) {
        if (await fs.exists(f))
            found.push(f);
    }
    return found;
}
export async function loadLoopConfig(root) {
    return fsFor(root).readTextIfExists('LOOP.md');
}
export async function loadBudget(root) {
    return fsFor(root).readTextIfExists('loop-budget.md');
}
export async function loadRunLog(root) {
    return fsFor(root).readTextIfExists('loop-run-log.md');
}
export async function loadSafetyDoc(root) {
    const fs = fsFor(root);
    for (const f of ['docs/safety.md', 'safety.md', 'SECURITY.md']) {
        const content = await fs.readTextIfExists(f);
        if (content)
            return content;
    }
    return null;
}
export async function listPatternDocs(root) {
    const entries = await fsFor(root).listEntries('patterns');
    return entries
        .filter(e => e.kind === 'file' && e.name.endsWith('.md') && e.name !== 'README.md')
        .map(e => e.name.replace('.md', ''));
}
