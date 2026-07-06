import path from 'node:path';
import { execSync } from 'node:child_process';
import { collectProjectEvidenceFacts, createNodeProjectFileSystem, hasAnyProjectPath, } from '@jununfly/zj-loop-core';
import { LOOP_ARTIFACTS, artifactCandidates, skillPathCandidates } from './artifacts.js';
import { evaluateReadinessGuidance, evaluateReadinessPolicy } from './readiness-rules.js';
const WORKTREE_HINTS = ['worktree', 'worktrees', 'git worktree'];
const BUDGET_HINTS = [/budget/i, /max tokens/i, /token cap/i, /kill switch/i, /loop-pause-all/i];
const ROUTE_TABLE_FILES = ['zj-loop/zj-loop-route-table.yaml'];
async function readFirstProjectText(fs, candidates) {
    for (const candidate of candidates) {
        const content = await fs.readTextIfExists(candidate);
        if (content !== null)
            return { path: candidate, content };
    }
    return null;
}
async function findExistingProjectPaths(fs, candidates) {
    const found = [];
    for (const candidate of candidates) {
        if (await fs.exists(candidate))
            found.push(candidate);
    }
    return found;
}
async function detectLoopActivity(root, fs) {
    const evidence = [];
    const stateCandidates = [
        'zj-loop/STATE.md',
        'zj-loop/pr-steward-state.md',
        'zj-loop/ci-sweeper-state.md',
        'zj-loop/post-merge-state.md',
        'zj-loop/dependency-sweeper-state.md',
        'zj-loop/changelog-drafter-state.md',
        'zj-loop/issue-triage-state.md',
        'zj-loop/roadmap-sliced-state.md',
    ];
    // 1. Look for "Last run" timestamps or dated entries inside state files (strong real-usage signal)
    for (const sf of stateCandidates) {
        try {
            const txt = await fs.readTextIfExists(sf);
            if (txt) {
                if (/last\s*run|last updated|^\s*-\s*\d{4}-\d{2}-\d{2}/im.test(txt) || /triage|loop run|changelog drafter/i.test(txt)) {
                    evidence.push(`state:${sf}`);
                }
            }
        }
        catch { }
    }
    // 2. Presence of run log artifacts or dedicated log templates being used
    const logHints = ['zj-loop-run-log', 'run-log', 'loop.log', 'audit-report'];
    try {
        const entries = [
            ...(await fs.listEntries('.')),
            ...(await fs.listEntries(LOOP_ARTIFACTS.directory)),
        ];
        for (const entry of entries) {
            if (entry.kind === 'file' && logHints.some(h => entry.name.toLowerCase().includes(h))) {
                evidence.push(`log:${entry.name}`);
            }
        }
    }
    catch { }
    // 3. Workflow or LOOP evidence of scheduled execution
    try {
        const workflows = await fs.listEntries('.github/workflows');
        if (workflows.length > 0) {
            if (workflows.some(w => /triage|changelog|daily|loop|audit|pr-steward/i.test(w.name))) {
                evidence.push('github:loop-workflows');
            }
        }
    }
    catch { }
    // 4. Light git history scan for loop-related commits (best dynamic proof)
    try {
        const log = execSync('git log --oneline -25 -- .', {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 1500,
        });
        const lower = log.toLowerCase();
        if (/state\.md|loop|triage|changelog-drafter|post-merge|daily triage|audit/i.test(lower)) {
            const firstMatch = log.trim().split('\n')[0] || '';
            evidence.push(`git:${firstMatch.slice(0, 60)}`);
        }
    }
    catch {
        // git not available or not a repo — ignore gracefully
    }
    // 5. Check ZJ-LOOP.md or a state for explicit "Last run" human-readable proof
    try {
        const loopConfig = await readFirstProjectText(fs, artifactCandidates(LOOP_ARTIFACTS.config));
        if (loopConfig) {
            if (/last run|cadence|scheduled|automation/i.test(loopConfig.content))
                evidence.push(`${loopConfig.path}:active`);
        }
    }
    catch { }
    return { present: evidence.length > 0, evidence: Array.from(new Set(evidence)).slice(0, 4) };
}
export function computeScore(signals) {
    return evaluateReadinessPolicy(signals);
}
export async function auditProject(target) {
    const root = path.resolve(target);
    const fs = createNodeProjectFileSystem(root);
    const evidence = await collectProjectEvidenceFacts(fs);
    const statePaths = Array.from(new Set([
        ...evidence.statePaths,
        ...(await findExistingProjectPaths(fs, LOOP_ARTIFACTS.state.candidates)),
    ]));
    const loopConfig = await readFirstProjectText(fs, artifactCandidates(LOOP_ARTIFACTS.config));
    const loopMd = Boolean(loopConfig?.content.length);
    const agentsMd = evidence.agentsMd.present;
    const skillNames = evidence.skillNames;
    const loopSkills = evidence.loopSkillNames;
    const verifier = skillNames.includes('zj-loop-verifier');
    const triage = skillNames.includes('zj-loop-triage') ||
        skillNames.includes('zj-pr-review-triage') ||
        skillNames.includes('zj-ci-triage') ||
        skillNames.includes('zj-dependency-triage') ||
        skillNames.includes('zj-post-merge-scan') ||
        skillNames.includes('zj-changelog-scan') ||
        skillNames.includes('zj-issue-triage');
    const loopMdContent = loopConfig?.content ?? evidence.loopConfig.content;
    // New expanded signals
    const githubDir = evidence.github.present;
    const hasWorkflows = evidence.github.workflows;
    // Proper safety doc detection
    const safetyDocPresent = evidence.safety.docPresent;
    const mcpPresent = evidence.mcp.filePresent ||
        /MCP|mcp server|plugins & connectors/i.test(loopMdContent);
    // Light evidence of worktree usage (common in patterns/starters/LOOP)
    let worktreeEvidence = false;
    const candidateMd = [
        LOOP_ARTIFACTS.config.primary,
        'patterns/pr-steward.md',
        `starters/minimal-loop/${LOOP_ARTIFACTS.config.primary}`,
        `starters/minimal-loop-claude/${LOOP_ARTIFACTS.config.primary}`,
        `starters/minimal-loop-codex/${LOOP_ARTIFACTS.config.primary}`,
        'docs/operating-loops.md',
    ];
    for (const c of candidateMd) {
        try {
            const txt = await fs.readTextIfExists(c);
            if (txt) {
                if (WORKTREE_HINTS.some(h => txt.toLowerCase().includes(h))) {
                    worktreeEvidence = true;
                    break;
                }
            }
        }
        catch { }
    }
    const registryPresent = await fs.exists('patterns/registry.yaml');
    const budgetDoc = await hasAnyProjectPath(fs, artifactCandidates(LOOP_ARTIFACTS.budget));
    const runLog = await hasAnyProjectPath(fs, artifactCandidates(LOOP_ARTIFACTS.runLog));
    const loopMdBudget = BUDGET_HINTS.some((re) => re.test(loopMdContent));
    const budgetSkill = await hasAnyProjectPath(fs, skillPathCandidates([LOOP_ARTIFACTS.skills.budget.primary, ...LOOP_ARTIFACTS.skills.budget.legacy]));
    const loopActivity = await detectLoopActivity(root, fs);
    const constraintsFile = await hasAnyProjectPath(fs, artifactCandidates(LOOP_ARTIFACTS.constraints));
    const constraintsSkill = await hasAnyProjectPath(fs, skillPathCandidates([LOOP_ARTIFACTS.skills.constraints.primary, ...LOOP_ARTIFACTS.skills.constraints.legacy]));
    const routeTablePresent = await hasAnyProjectPath(fs, [
        ...ROUTE_TABLE_FILES,
        ...artifactCandidates(LOOP_ARTIFACTS.routeTable),
    ]);
    const signals = {
        stateFile: { present: statePaths.length > 0, paths: statePaths },
        loopConfig: { present: loopMd, path: loopConfig?.path },
        skills: { count: loopSkills.length, loopSkills },
        verifier: { present: verifier },
        triage: { present: triage },
        agentsMd: { present: agentsMd },
        patterns: { documented: loopMd },
        safety: { loopMdMentionsSafety: /gate|denylist|auto-merge|safety/i.test(loopMdContent), safetyDocPresent },
        routeTable: { present: routeTablePresent },
        starters: { used: loopSkills.includes('zj-loop-triage') },
        github: { present: githubDir, workflows: hasWorkflows },
        mcp: { present: mcpPresent },
        constraints: { present: constraintsFile, hasConstraintsSkill: constraintsSkill },
        worktreeEvidence: { present: worktreeEvidence },
        registry: { present: registryPresent },
        cost: { budgetDoc, runLog, loopMdBudget, budgetSkill },
        loopActivity,
    };
    const { score, level, assessment } = computeScore(signals);
    const { findings, recommendations } = evaluateReadinessGuidance(signals, score);
    return {
        target: root,
        score,
        level,
        assessment,
        signals,
        findings,
        recommendations,
    };
}
