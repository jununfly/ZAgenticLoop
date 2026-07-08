import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import {
  collectProjectEvidenceFacts,
  createNodeProjectFileSystem,
  hasAnyProjectPath,
  type ProjectFileSystem,
} from '@jununfly/zj-loop-core';
import { LOOP_ARTIFACTS, artifactCandidates, skillPathCandidates } from './artifacts.js';
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
  routeTable: { present: boolean };
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
  category: FindingCategory;
  message: string;
  affectsScore: boolean;
  nextSteps: NextStep[];
}

export type FindingCategory = 'pass' | 'blocker' | 'readiness-gap' | 'hardening' | 'future-tooling';

export type NextStep =
  | { kind: 'command'; label: string; command: string }
  | { kind: 'manual-review'; label: string }
  | { kind: 'validate'; label: string; command: string }
  | { kind: 'info'; label: string };

export interface AuditResult {
  target: string;
  score: number;
  level: 'L0' | 'L1' | 'L2' | 'L3';
  assessment: string;
  signals: LoopSignals;
  findings: Finding[];
  recommendations: string[];
}

const WORKTREE_HINTS = ['worktree', 'worktrees', 'git worktree'];
const BUDGET_HINTS = [/budget/i, /max tokens/i, /token cap/i, /kill switch/i, /loop-pause-all/i];
const ROUTE_TABLE_FILES = ['zj-loop/zj-loop-route-table.yaml'] as const;
const GENERATED_WORKFLOW_PATTERN = /^zj-loop-.+\.yml$/;
const EXECUTION_MODES = new Set(['report-only', 'request-only', 'claim-only', 'dry-run', 'live']);
const SIDE_EFFECT_LEVELS = ['none', 'evidence', 'request', 'claim', 'issue-comment', 'label', 'branch', 'pr', 'draft-pr', 'cleanup'];
const MATURITY_LEVELS = new Set(['missing', 'designed', 'replayed', 'dogfooded', 'user-project-ready']);
const CONSUMER_KIND_LIMITS: Record<string, { modes: string[]; maxSideEffect: string }> = {
  'producer-router': { modes: ['report-only', 'request-only'], maxSideEffect: 'request' },
  'report-consumer': { modes: ['report-only'], maxSideEffect: 'evidence' },
  'human-gate': { modes: ['report-only'], maxSideEffect: 'evidence' },
  'fix-runner': { modes: ['request-only', 'claim-only', 'dry-run', 'live'], maxSideEffect: 'pr' },
  'draft-consumer': { modes: ['report-only', 'request-only', 'dry-run', 'live'], maxSideEffect: 'draft-pr' },
  'cleanup-consumer': { modes: ['report-only', 'dry-run', 'live'], maxSideEffect: 'cleanup' },
  'activation-consumer': { modes: ['request-only', 'dry-run', 'live'], maxSideEffect: 'branch' },
  'triage-action-consumer': { modes: ['request-only', 'dry-run', 'live'], maxSideEffect: 'label' },
};

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

async function findExistingProjectPaths(
  fs: ProjectFileSystem,
  candidates: readonly string[],
): Promise<string[]> {
  const found: string[] = [];
  for (const candidate of candidates) {
    if (await fs.exists(candidate)) found.push(candidate);
  }
  return found;
}

async function detectLoopActivity(
  root: string,
  fs: ProjectFileSystem,
): Promise<{ present: boolean; evidence: string[] }> {
  const evidence: string[] = [];
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
    } catch {}
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
  } catch {}

  // 3. Workflow or LOOP evidence of scheduled execution
  try {
    const workflows = await fs.listEntries('.github/workflows');
    if (workflows.length > 0) {
      if (workflows.some(w => /triage|changelog|daily|loop|audit|pr-steward/i.test(w.name))) {
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

  // 5. Check ZJ-LOOP.md or a state for explicit "Last run" human-readable proof
  try {
    const loopConfig = await readFirstProjectText(fs, artifactCandidates(LOOP_ARTIFACTS.config));
    if (loopConfig) {
      if (/last run|cadence|scheduled|automation/i.test(loopConfig.content)) evidence.push(`${loopConfig.path}:active`);
    }
  } catch {}

  return { present: evidence.length > 0, evidence: Array.from(new Set(evidence)).slice(0, 4) };
}

async function auditGeneratedWorkflowBundle(fs: ProjectFileSystem): Promise<Finding[]> {
  const findings: Finding[] = [];
  let workflowEntries: Awaited<ReturnType<ProjectFileSystem['listEntries']>>;
  try {
    workflowEntries = await fs.listEntries('.github/workflows');
  } catch {
    return findings;
  }

  const generatedWorkflowNames = workflowEntries
    .filter((entry) => entry.kind === 'file' && GENERATED_WORKFLOW_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (!generatedWorkflowNames.length) return findings;

  const routeTableFinding = await auditWorkflowBundleRouteTable(fs);
  if (routeTableFinding) findings.push(routeTableFinding);

  for (const name of generatedWorkflowNames) {
    const workflowPath = `.github/workflows/${name}`;
    const content = await fs.readTextIfExists(workflowPath);
    if (!content) continue;
    const hash = extractWorkflowTemplateHash(content);
    const computed = workflowTemplateHash(content);
    const hasGeneratedMarker = /^# zj-loop-generated: true$/m.test(content);
    const hasTemplateId = /^# zj-loop-template-id: github-actions\/.+$/m.test(content);
    const hasTemplateVersion = /^# zj-loop-template-version: \d+$/m.test(content);
    const hasPinnedCore = /@jununfly\/zj-loop-core@\d+\.\d+\.\d+/.test(content);
    const hasFloatingCore = /@jununfly\/zj-loop-core@(latest|\^|~)/.test(content);
    if (!hasGeneratedMarker || !hasTemplateId || !hasTemplateVersion || !hash || hash !== computed) {
      findings.push({
        level: 'fail',
        category: 'blocker',
        message: `${workflowPath} has missing or invalid zj-loop generated metadata`,
        affectsScore: false,
        nextSteps: [
          {
            kind: 'command',
            label: 'Redeploy or upgrade the GitHub Actions bundle',
            command: 'npx @jununfly/zj-loop-init . --upgrade github-actions',
          },
        ],
      });
      continue;
    }
    if (hasFloatingCore || !hasPinnedCore) {
      findings.push({
        level: 'fail',
        category: 'blocker',
        message: `${workflowPath} must pin @jununfly/zj-loop-core version`,
        affectsScore: false,
        nextSteps: [
          {
            kind: 'command',
            label: 'Redeploy pinned generated workflows',
            command: 'npx @jununfly/zj-loop-init . --upgrade github-actions',
          },
        ],
      });
    }
  }

  if (!findings.length) {
    findings.push({
      level: 'ok',
      category: 'pass',
      message: `Generated GitHub Actions workflow bundle metadata valid (${generatedWorkflowNames.length} workflows)`,
      affectsScore: false,
      nextSteps: [],
    });
  }

  return findings;
}

async function auditWorkflowBundleRouteTable(fs: ProjectFileSystem): Promise<Finding | null> {
  const routeTable = await fs.readTextIfExists('zj-loop/zj-loop-route-table.yaml');
  if (!routeTable) {
    return {
      level: 'fail',
      category: 'blocker',
      message: 'Generated GitHub Actions workflow bundle requires zj-loop/zj-loop-route-table.yaml',
      affectsScore: false,
      nextSteps: [
        {
          kind: 'command',
          label: 'Install the Route Table used by generated workflows',
          command: 'npx @jununfly/zj-loop-init . --add route-table',
        },
      ],
    };
  }

  try {
    const parsed = parseYaml(routeTable) as {
      kind?: string;
      routes?: Array<{ route_id?: string; enabled?: boolean; request_kind?: string }>;
      disabled_dispatch_routes?: Array<{ route_id?: string; enabled?: boolean; request_kind?: string }>;
    } | null;
    if (!parsed || parsed.kind !== 'zj-loop-route-table') throw new Error('invalid route table');
    const routes = [...(parsed.routes ?? []), ...(parsed.disabled_dispatch_routes ?? [])];
    const smoke = routes.find((route) => route.route_id === 'manual-smoke-report');
    if (!smoke || smoke.enabled !== true || (smoke.request_kind ?? 'report-only') !== 'report-only') {
      return {
        level: 'fail',
        category: 'blocker',
        message: 'Generated GitHub Actions workflow bundle requires enabled report-only manual-smoke-report route',
        affectsScore: false,
        nextSteps: [
          {
            kind: 'command',
            label: 'Enable the manual smoke route',
            command: 'npx --yes --package @jununfly/zj-loop-core zj-loop-route enable manual-smoke-report',
          },
        ],
      };
    }
  } catch {
    return {
      level: 'fail',
      category: 'blocker',
      message: 'zj-loop/zj-loop-route-table.yaml is not a valid zj-loop Route Table',
      affectsScore: false,
      nextSteps: [
        {
          kind: 'command',
          label: 'Regenerate the Route Table',
          command: 'npx @jununfly/zj-loop-init . --add route-table --force',
        },
      ],
    };
  }

  return null;
}

async function auditRouteExecutionContractWarnings(fs: ProjectFileSystem): Promise<Finding[]> {
  const routeTable = await fs.readTextIfExists('zj-loop/zj-loop-route-table.yaml');
  if (!routeTable) return [];

  const findings: Finding[] = [];
  const hasGeneratedWorkflowBundle = await projectHasGeneratedWorkflowBundle(fs);
  let rawRoutes: Array<Record<string, unknown>> = [];
  try {
    const raw = parseYaml(routeTable) as {
      routes?: Array<Record<string, unknown>>;
      disabled_dispatch_routes?: Array<Record<string, unknown>>;
    } | null;
    rawRoutes = [...(raw?.routes ?? []), ...(raw?.disabled_dispatch_routes ?? [])];

    for (const route of rawRoutes) {
      const validation = validateRawRouteExecutionContract(route);
      if (validation.errors.length || validation.warnings.length) {
        const hardErrors = validation.errors.filter((error) =>
          error.includes('live execution requires') ||
          error.includes('cannot use execution.mode') ||
          error.includes('cannot use side_effect_level') ||
          error.includes('cannot claim max_side_effect_level') ||
          error.includes('unknown consumer_kind') ||
          error.includes('unknown execution.mode') ||
          error.includes('unknown side_effect_level') ||
          error.includes('unknown maturity.'),
        );
        findings.push({
          level: hardErrors.length ? 'fail' : 'warn',
          category: hardErrors.length ? 'blocker' : 'hardening',
          message: `Route ${validation.routeId} execution contract needs attention: ${[...validation.errors, ...validation.warnings].join('; ')}`,
          affectsScore: false,
          nextSteps: [
            {
              kind: 'manual-review',
              label: 'Align Route Table execution mode, maturity, side effect level, and capabilities',
            },
          ],
        });
      }
    }
  } catch {
    return [];
  }

  const requiredFields = ['consumer_kind', 'execution', 'maturity', 'capabilities'];
  for (const route of rawRoutes) {
    const routeId = typeof route.route_id === 'string' ? route.route_id : 'unknown-route';
    const missing = requiredFields.filter((field) => route[field] === undefined);
    if (missing.length) {
      findings.push({
        level: hasGeneratedWorkflowBundle ? 'fail' : 'warn',
        category: hasGeneratedWorkflowBundle ? 'blocker' : 'hardening',
        message: `Route ${routeId} is missing execution transparency fields: ${missing.join(', ')}`,
        affectsScore: false,
        nextSteps: [
          {
            kind: 'manual-review',
            label: 'Add consumer_kind, execution, maturity, and capabilities fields to the Route Table row',
          },
        ],
      });
    }
  }

  return findings;
}

async function projectHasGeneratedWorkflowBundle(fs: ProjectFileSystem): Promise<boolean> {
  let workflowEntries: Awaited<ReturnType<ProjectFileSystem['listEntries']>>;
  try {
    workflowEntries = await fs.listEntries('.github/workflows');
  } catch {
    return false;
  }
  return workflowEntries.some((entry) => entry.kind === 'file' && GENERATED_WORKFLOW_PATTERN.test(entry.name));
}

function validateRawRouteExecutionContract(route: Record<string, unknown>): {
  routeId: string;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const routeId = typeof route.route_id === 'string' ? route.route_id : 'unknown-route';
  const consumerKind = stringField(route.consumer_kind);
  const execution = objectField(route.execution);
  const maturity = objectField(route.maturity);
  const capabilities = objectField(route.capabilities);
  const mode = stringField(execution?.mode);
  const sideEffectLevel = stringField(execution?.side_effect_level);
  const maturityProtocol = stringField(maturity?.protocol);
  const maturityRunner = stringField(maturity?.runner);
  const maxSideEffectLevel = stringField(capabilities?.max_side_effect_level) ?? sideEffectLevel;
  const recentSuccessEvidence = arrayField(execution?.recent_success_evidence);
  const requestKind = stringField(route.request_kind) ?? 'report-only';

  const limits = consumerKind ? CONSUMER_KIND_LIMITS[consumerKind] : undefined;
  if (consumerKind && !limits) errors.push(`unknown consumer_kind: ${consumerKind}`);
  if (mode && !EXECUTION_MODES.has(mode)) errors.push(`unknown execution.mode: ${mode}`);
  if (sideEffectLevel && !SIDE_EFFECT_LEVELS.includes(sideEffectLevel)) errors.push(`unknown side_effect_level: ${sideEffectLevel}`);
  if (maturityProtocol && !MATURITY_LEVELS.has(maturityProtocol)) errors.push(`unknown maturity.protocol: ${maturityProtocol}`);
  if (maturityRunner && !MATURITY_LEVELS.has(maturityRunner)) errors.push(`unknown maturity.runner: ${maturityRunner}`);
  if (limits && mode && !limits.modes.includes(mode)) errors.push(`${consumerKind} cannot use execution.mode=${mode}`);
  if (limits && sideEffectLevel && sideEffectRank(sideEffectLevel) > sideEffectRank(limits.maxSideEffect)) {
    errors.push(`${consumerKind} cannot use side_effect_level=${sideEffectLevel}`);
  }
  if (limits && maxSideEffectLevel && sideEffectRank(maxSideEffectLevel) > sideEffectRank(limits.maxSideEffect)) {
    errors.push(`${consumerKind} cannot claim max_side_effect_level=${maxSideEffectLevel}`);
  }
  if (mode === 'live') {
    const runnerReady = maturityRunner === 'dogfooded' || maturityRunner === 'user-project-ready';
    if (!runnerReady || !sideEffectLevel || sideEffectRank(sideEffectLevel) <= sideEffectRank('evidence') || recentSuccessEvidence.length === 0) {
      errors.push('live execution requires runner maturity dogfooded or user-project-ready and recent success evidence');
    }
  }
  if (requestKind === 'report-only' && mode && mode !== 'report-only' && mode !== 'dry-run') {
    warnings.push('report-only request kind should not imply request consumption or work execution');
  }
  return { routeId, errors, warnings };
}

function objectField(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sideEffectRank(level: string): number {
  const index = SIDE_EFFECT_LEVELS.indexOf(level);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

function workflowTemplateHash(text: string): string {
  const canonical = text.replace(/^# zj-loop-template-hash: .+$/m, '# zj-loop-template-hash: <computed>');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function extractWorkflowTemplateHash(text: string): string | null {
  return text.match(/^# zj-loop-template-hash: (?<hash>[a-f0-9]{16})$/m)?.groups?.hash ?? null;
}

export function computeScore(signals: LoopSignals): { score: number; level: 'L0' | 'L1' | 'L2' | 'L3'; assessment: string } {
  return evaluateReadinessPolicy(signals);
}

export async function auditProject(target: string): Promise<AuditResult> {
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
        if (WORKTREE_HINTS.some(h => txt.toLowerCase().includes(h))) { worktreeEvidence = true; break; }
      }
    } catch {}
  }

  const registryPresent = await fs.exists('patterns/registry.yaml');

  const budgetDoc = await hasAnyProjectPath(fs, artifactCandidates(LOOP_ARTIFACTS.budget));
  const runLog = await hasAnyProjectPath(fs, artifactCandidates(LOOP_ARTIFACTS.runLog));
  const loopMdBudget = BUDGET_HINTS.some((re) => re.test(loopMdContent));

  const budgetSkill = await hasAnyProjectPath(
    fs,
    skillPathCandidates([LOOP_ARTIFACTS.skills.budget.primary, ...LOOP_ARTIFACTS.skills.budget.legacy]),
  );

  const loopActivity = await detectLoopActivity(root, fs);

  const constraintsFile = await hasAnyProjectPath(fs, artifactCandidates(LOOP_ARTIFACTS.constraints));
  const constraintsSkill = await hasAnyProjectPath(
    fs,
    skillPathCandidates([LOOP_ARTIFACTS.skills.constraints.primary, ...LOOP_ARTIFACTS.skills.constraints.legacy]),
  );
  const routeTablePresent = await hasAnyProjectPath(fs, [
    ...ROUTE_TABLE_FILES,
    ...artifactCandidates(LOOP_ARTIFACTS.routeTable),
  ]);

  const signals: LoopSignals = {
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
  const workflowBundleFindings = await auditGeneratedWorkflowBundle(fs);
  const routeExecutionFindings = await auditRouteExecutionContractWarnings(fs);

  return {
    target: root,
    score,
    level,
    assessment,
    signals,
    findings: [...workflowBundleFindings, ...routeExecutionFindings, ...findings],
    recommendations,
  };
}
