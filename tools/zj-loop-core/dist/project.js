import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
export const DEFAULT_SKILL_DIRS = [
    '.grok/skills',
    '.claude/skills',
    '.codex/skills',
    'skills',
];
export const DEFAULT_AGENT_DIRS = [
    '.claude/agents',
    '.codex/agents',
];
function toProjectPath(relativePath) {
    return relativePath === '.' ? '.' : path.normalize(relativePath);
}
export function createNodeProjectFileSystem(root) {
    const projectRoot = path.resolve(root);
    return {
        root: projectRoot,
        resolve(relativePath) {
            return path.join(projectRoot, toProjectPath(relativePath));
        },
        async exists(relativePath) {
            try {
                await stat(this.resolve(relativePath));
                return true;
            }
            catch {
                return false;
            }
        },
        async readTextIfExists(relativePath) {
            try {
                return await readFile(this.resolve(relativePath), 'utf8');
            }
            catch {
                return null;
            }
        },
        async listEntries(relativePath) {
            try {
                const entries = await readdir(this.resolve(relativePath), { withFileTypes: true });
                return entries.map((entry) => ({
                    name: entry.name,
                    kind: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
                }));
            }
            catch {
                return [];
            }
        },
    };
}
export async function findExistingProjectPaths(fs, candidates) {
    const paths = [];
    for (const candidate of candidates) {
        if (await fs.exists(candidate))
            paths.push(candidate);
    }
    return paths;
}
export async function hasAnyProjectPath(fs, candidates) {
    return (await findExistingProjectPaths(fs, candidates)).length > 0;
}
export async function listProjectSkillNames(fs, options = {}) {
    const skillDirs = options.skillDirs ?? DEFAULT_SKILL_DIRS;
    const agentDirs = options.agentDirs ?? DEFAULT_AGENT_DIRS;
    const found = [];
    for (const dir of skillDirs) {
        const entries = await fs.listEntries(dir);
        for (const entry of entries) {
            if (entry.kind === 'directory')
                found.push(entry.name);
            if (entry.kind === 'file' && entry.name === 'SKILL.md')
                found.push('root-skill');
        }
    }
    for (const dir of agentDirs) {
        const entries = await fs.listEntries(dir);
        for (const entry of entries) {
            if (entry.kind !== 'file')
                continue;
            const base = entry.name.replace(/\.(md|toml)$/i, '');
            if (base.includes('verifier') || base === 'loop-verifier') {
                found.push('loop-verifier');
            }
        }
    }
    return found;
}
