import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  createNodeProjectFileSystem,
  findExistingProjectPaths,
  hasAnyProjectPath,
  listProjectSkillNames,
  type ProjectFileSystem,
} from '@jununfly/zj-loop-core';
import { evaluateReadinessGuidance, evaluateReadinessPolicy } from './readiness-rules.js';

export interface LoopSignals {
  stateFile: { present: boolean; paths: string[] };
  loopConfig: { present: boolean; path?: string };
  skills: { count: number; loopSkills: string[] };
  verifier: { present: boolean };
  triage: { present: boolean };
  agentsMd: { present: boolean };
  patterns: { documented: boolean };
  safety: { loopMdMentionsSafety: boolean; safetyDocPresent: boolean };
  starters: { used: boolean };
  github: { present: boolean; workflows: boolean };
  mcp: { present: boolean };
  worktreeEvidence: { present: boolean };
  registry: { present: boolean };
  cost: {
    budgetDoc: boolean;
    runLog: boolean;
    loopMdBudget: boolean;
    budgetSkill: boolean;
  };
  constraints: { present: boolean; hasConstraintsSkill: boolean };
  loopActivity: { present: boolean; evidence: string[] };
}

export interface Finding {
  level: 'ok' | 'warn' | 'fail';
  message: string;
}

export interface AuditResult {
  target: string;
  score: number;
  level: 'L0' | 'L1' | 'L2' | 'L3';
  assessment: string;
  signals: LoopSignals;
  findings: Finding[];
  recommendations: string[];
}

const STATE_FILES = [
  'STATE.md',
  'pr-babysitter-state.md',
  'ci-sweeper-state.md',
  'post-merge-state.md',
  'dependency-sweeper-state.md',
  'changelog-drafter-state.md',
  'issue-triage-state.md',
];

const LOOP_SKILL_NAMES = [
  'loop-triage',
  'minimal-fix',
  'loop-verifier',
  'pr-review-triage',
  'ci-triage',
  'post-merge-scan',
  'dependency-triage',
  'rebase-and-clean',
  'changelog-scan',
  'loop-constraints',
  'draft-release-notes',
  'issue-triage',
];

const SAFETY_FILES = ['safety.md', 'docs/safety.md', 'SECURITY.md'];
const MCP_FILES = ['.mcp.json', 'mcp.json', '.mcp/config.json'];
const WORKTREE_HINTS = ['worktree', 'worktrees', 'git worktree'];
const BUDGET_HINTS = [/budget/i, /max tokens/i, /token cap/i, /kill switch/i, /loop-pause-all/i];

async function detectLoopActivity(
  root: string,
  fs: ProjectFileSystem,
): Promise<{ present: boolean; evidence: string[] }> {
  const evidence: string[] = [];
  const stateCandidates = [...STATE_FILES, 'STATE.md'];

  // 1. Look for "Last run" timestamps or dated entries inside state files (strong real-usage signal)
  for (const sf of stateCandidates) {
    try {
      const txt = await fs.readTextIfExists(sf);
      if (txt) {
        if (/last\s*run|last updated|^\s*-\s*\d{4}-\d{2}-\d{2}/im.test(txt) || /triage|loop run|changelog drafter/i.test(txt)) {
          evidence.push(`state:${sf}`);
        }
      }
    } catch {}
  }

  // 2. Presence of run log artifacts or dedicated log templates being used
  const logHints = ['loop-run-log', 'run-log', 'loop.log', 'audit-report'];
  try {
    const entries = await fs.listEntries('.');
    for (const entry of entries) {
      if (entry.kind === 'file' && logHints.some(h => entry.name.toLowerCase().includes(h))) {
        evidence.push(`log:${entry.name}`);
      }
    }
  } catch {}

  // 3. Workflow or LOOP evidence of scheduled execution
  try {
    const workflows = await fs.listEntries('.github/workflows');
    if (workflows.length > 0) {
      if (workflows.some(w => /triage|changelog|daily|loop|audit|pr-babysit/i.test(w.name))) {
        evidence.push('github:loop-workflows');
      }
    }
  } catch {}

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
  } catch {
    // git not available or not a repo — ignore gracefully
  }

  // 5. Check LOOP.md or a state for explicit "Last run" human-readable proof
  try {
    const txt = await fs.readTextIfExists('LOOP.md');
    if (txt) {
      if (/last run|cadence|scheduled|automation/i.test(txt)) evidence.push('LOOP.md:active');
    }
  } catch {}

  return { present: evidence.length > 0, evidence: Array.from(new Set(evidence)).slice(0, 4) };
}

export function computeScore(signals: LoopSignals): { score: number; level: 'L0' | 'L1' | 'L2' | 'L3'; assessment: string } {
  return evaluateReadinessPolicy(signals);
}

export async function auditProject(target: string): Promise<AuditResult> {
  const root = path.resolve(target);
  const fs = createNodeProjectFileSystem(root);

  const statePaths = await findExistingProjectPaths(fs, STATE_FILES);

  const loopMd = await fs.exists('LOOP.md');
  const agentsMd = await hasAnyProjectPath(fs, ['AGENTS.md', 'CLAUDE.md']);
  const skillNames = await listProjectSkillNames(fs);
  const loopSkills = skillNames.filter((s) => LOOP_SKILL_NAMES.includes(s));

  const verifier = skillNames.includes('loop-verifier');
  const triage = skillNames.includes('loop-triage') ||
    skillNames.includes('pr-review-triage') ||
    skillNames.includes('ci-triage') ||
    skillNames.includes('dependency-triage') ||
    skillNames.includes('post-merge-scan') ||
    skillNames.includes('changelog-scan') ||
    skillNames.includes('issue-triage');

  let loopMdContent = '';
  if (loopMd) {
    loopMdContent = (await fs.readTextIfExists('LOOP.md')) ?? '';
  }

  // New expanded signals
  const githubDir = await fs.exists('.github');
  const hasWorkflows = await fs.exists('.github/workflows');

  // Proper safety doc detection
  const safetyDocPresent = await hasAnyProjectPath(fs, SAFETY_FILES);

  const mcpPresent = await hasAnyProjectPath(fs, MCP_FILES) ||
    /MCP|mcp server|plugins & connectors/i.test(loopMdContent);

  // Light evidence of worktree usage (common in patterns/starters/LOOP)
  let worktreeEvidence = false;
  const candidateMd = [
    'LOOP.md',
    'patterns/pr-babysitter.md',
    'starters/minimal-loop/LOOP.md',
    'starters/minimal-loop-claude/LOOP.md',
    'starters/minimal-loop-codex/LOOP.md',
    'docs/operating-loops.md',
  ];
  for (const c of candidateMd) {
    try {
      const txt = await fs.readTextIfExists(c);
      if (txt) {
        if (WORKTREE_HINTS.some(h => txt.toLowerCase().includes(h))) { worktreeEvidence = true; break; }
      }
    } catch {}
  }

  const registryPresent = await fs.exists('patterns/registry.yaml');

  const budgetDoc = await fs.exists('loop-budget.md');
  const runLog = await fs.exists('loop-run-log.md');
  const loopMdBudget = BUDGET_HINTS.some((re) => re.test(loopMdContent));

  const budgetSkill = await hasAnyProjectPath(fs, [
    'skills/loop-budget/SKILL.md',
    '.grok/skills/loop-budget/SKILL.md',
    '.claude/skills/loop-budget/SKILL.md',
    '.codex/skills/loop-budget/SKILL.md',
  ]);

  const loopActivity = await detectLoopActivity(root, fs);

  const constraintsFile = await fs.exists('loop-constraints.md');
  const constraintsSkill = await hasAnyProjectPath(fs, [
    'skills/loop-constraints/SKILL.md',
    '.grok/skills/loop-constraints/SKILL.md',
    '.claude/skills/loop-constraints/SKILL.md',
    '.codex/skills/loop-constraints/SKILL.md',
  ]);

  const signals: LoopSignals = {
    stateFile: { present: statePaths.length > 0, paths: statePaths },
    loopConfig: { present: loopMd, path: loopMd ? 'LOOP.md' : undefined },
    skills: { count: loopSkills.length, loopSkills },
    verifier: { present: verifier },
    triage: { present: triage },
    agentsMd: { present: agentsMd },
    patterns: { documented: loopMd },
    safety: { loopMdMentionsSafety: /gate|denylist|auto-merge|safety/i.test(loopMdContent), safetyDocPresent },
    starters: { used: loopSkills.includes('loop-triage') },
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
