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
export const DEFAULT_STATE_FILES = [
    'zj-loop/STATE.md',
    'zj-loop/pr-steward-state.md',
    'zj-loop/ci-sweeper-state.md',
    'zj-loop/post-merge-state.md',
    'zj-loop/dependency-sweeper-state.md',
    'zj-loop/changelog-drafter-state.md',
    'zj-loop/issue-triage-state.md',
];
export const DEFAULT_REQUIRED_LOOP_FILES = [
    'zj-loop/STATE.md',
    'zj-loop/ZJ-LOOP.md',
    'AGENTS.md',
];
export const LOOP_CONFIG_FILE_CANDIDATES = [
    'zj-loop/ZJ-LOOP.md',
];
export const DEFAULT_SAFETY_FILES = [
    'zj-loop/zj-loop-safety.md',
];
export const DEFAULT_ROUTE_TABLE_FILES = [
    'zj-loop/zj-loop-route-table.yaml',
];
export const DEFAULT_MCP_FILES = [
    '.mcp.json',
    'mcp.json',
    '.mcp/config.json',
];
export const DEFAULT_LOOP_SKILL_NAMES = [
    'zj-loop-triage',
    'zj-minimal-fix',
    'zj-loop-verifier',
    'zj-pr-review-triage',
    'zj-ci-triage',
    'zj-post-merge-scan',
    'zj-dependency-triage',
    'zj-rebase-and-clean',
    'zj-changelog-scan',
    'zj-loop-constraints',
    'zj-loop-budget',
    'zj-draft-release-notes',
    'zj-issue-triage',
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
export async function readFirstProjectText(fs, candidates) {
    for (const candidate of candidates) {
        const content = await fs.readTextIfExists(candidate);
        if (content !== null)
            return { path: candidate, content };
    }
    return null;
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
            if (base.includes('verifier') || base === 'zj-loop-verifier') {
                found.push('zj-loop-verifier');
            }
        }
    }
    return found;
}
export async function collectProjectEvidenceFacts(fs) {
    const statePaths = await findExistingProjectPaths(fs, DEFAULT_STATE_FILES);
    const requiredLoopFiles = await findExistingProjectPaths(fs, DEFAULT_REQUIRED_LOOP_FILES);
    const missingRequiredLoopFiles = DEFAULT_REQUIRED_LOOP_FILES.filter((requiredFile) => !requiredLoopFiles.includes(requiredFile));
    const loopConfig = await readFirstProjectText(fs, LOOP_CONFIG_FILE_CANDIDATES);
    const skillNames = await listProjectSkillNames(fs);
    const githubPresent = await fs.exists('.github');
    const githubWorkflows = await fs.exists('.github/workflows');
    const gitlabCi = await fs.exists('.gitlab-ci.yml');
    const gitConfig = await fs.readTextIfExists('.git/config');
    const remote = extractOriginRemote(gitConfig ?? '');
    const glabMentioned = await hasGlabMention(fs, loopConfig?.content ?? '');
    const provider = detectProjectProvider({
        remote,
        githubActions: githubWorkflows,
        gitlabCi,
        glabMentioned,
    });
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
            present: githubPresent,
            workflows: githubWorkflows,
        },
        provider: {
            kind: provider,
            remote,
            githubActions: githubWorkflows,
            gitlabCi,
            glabMentioned,
        },
        skillNames,
        loopSkillNames: skillNames.filter((skillName) => DEFAULT_LOOP_SKILL_NAMES.includes(skillName)),
        safety: {
            docPresent: await hasAnyProjectPath(fs, DEFAULT_SAFETY_FILES),
        },
        routeTable: {
            present: await hasAnyProjectPath(fs, DEFAULT_ROUTE_TABLE_FILES),
        },
        mcp: {
            filePresent: await hasAnyProjectPath(fs, DEFAULT_MCP_FILES),
        },
    };
}
export function detectProjectProvider(input) {
    const remote = String(input.remote ?? '').toLowerCase();
    if (remote.includes('github.com') || input.githubActions === true)
        return 'github';
    if (remote.includes('gitlab') || input.gitlabCi === true || input.glabMentioned === true)
        return 'gitlab';
    return 'manual';
}
function extractOriginRemote(gitConfig) {
    const lines = String(gitConfig ?? '').split(/\r?\n/);
    let inOrigin = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (/^\[remote\s+"origin"\]$/.test(trimmed)) {
            inOrigin = true;
            continue;
        }
        if (/^\[.+\]$/.test(trimmed)) {
            inOrigin = false;
            continue;
        }
        if (inOrigin && trimmed.startsWith('url =')) {
            return trimmed.slice('url ='.length).trim();
        }
    }
    return '';
}
async function hasGlabMention(fs, loopConfigContent) {
    if (/\bglab\b/i.test(loopConfigContent))
        return true;
    for (const candidate of ['README.md', 'AGENTS.md', 'CLAUDE.md']) {
        const content = await fs.readTextIfExists(candidate);
        if (content && /\bglab\b/i.test(content))
            return true;
    }
    return false;
}
