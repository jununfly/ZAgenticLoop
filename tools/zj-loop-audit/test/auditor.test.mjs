import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditProject, computeScore } from '../dist/auditor.js';
import { evaluateReadinessGuidance, evaluateReadinessPolicy, parseReadinessPolicy } from '../dist/readiness-rules.js';
import { formatBadge } from '../dist/reporter.js';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

function emptySignals() {
  return {
    stateFile: { present: false, paths: [] },
    loopConfig: { present: false },
    skills: { count: 0, loopSkills: [] },
    verifier: { present: false },
    triage: { present: false },
    agentsMd: { present: false },
    patterns: { documented: false },
    safety: { loopMdMentionsSafety: false, safetyDocPresent: false },
    starters: { used: false },
    github: { present: false, workflows: false },
    mcp: { present: false },
    worktreeEvidence: { present: false },
    registry: { present: false },
    constraints: { present: false, hasConstraintsSkill: false },
    cost: { budgetDoc: false, runLog: false, loopMdBudget: false, budgetSkill: false },
    loopActivity: { present: false, evidence: [] },
  };
}

function l3CandidateSignals(overrides = {}) {
  return {
    ...emptySignals(),
    stateFile: { present: true, paths: ['STATE.md'] },
    loopConfig: { present: true, path: 'LOOP.md' },
    skills: { count: 3, loopSkills: ['loop-triage', 'minimal-fix', 'loop-verifier'] },
    verifier: { present: true },
    triage: { present: true },
    agentsMd: { present: true },
    patterns: { documented: true },
    safety: { loopMdMentionsSafety: true, safetyDocPresent: true },
    github: { present: true, workflows: true },
    mcp: { present: true },
    worktreeEvidence: { present: true },
    registry: { present: true },
    constraints: { present: true, hasConstraintsSkill: true },
    cost: { budgetDoc: true, runLog: true, loopMdBudget: true, budgetSkill: true },
    loopActivity: { present: true, evidence: ['git:state update', 'state:STATE.md'] },
    ...overrides,
  };
}

test('computeScore: empty project is L0', () => {
  const { score, level } = computeScore(emptySignals());
  assert.equal(level, 'L0');
  assert.ok(score < 38);
});

test('computeScore: state + triage reaches L1', () => {
  const s = emptySignals();
  s.stateFile = { present: true, paths: ['STATE.md'] };
  s.triage = { present: true };
  const { level, score } = computeScore(s);
  assert.equal(level, 'L1');
  assert.ok(score >= 38);
});

test('computeScore: full L2 signals', () => {
  const s = emptySignals();
  s.stateFile = { present: true, paths: ['STATE.md'] };
  s.triage = { present: true };
  s.skills = { count: 2, loopSkills: ['loop-triage', 'loop-verifier'] };
  s.verifier = { present: true };
  const { level, score } = computeScore(s);
  assert.equal(level, 'L2');
  assert.ok(score >= 58 && score < 78);
});

test('computeScore: L3 requires verifier, high score, cost observability, and activity', () => {
  const { level, score } = computeScore(l3CandidateSignals());
  assert.equal(level, 'L3');
  assert.ok(score >= 78);
});

test('computeScore: L3 blocked without cost observability', () => {
  const s = l3CandidateSignals({
    cost: { budgetDoc: false, runLog: false, loopMdBudget: false, budgetSkill: false },
  });
  const { level } = computeScore(s);
  assert.equal(level, 'L2');
});

test('computeScore: high structure without activity caps at L2', () => {
  const s = emptySignals();
  s.stateFile = { present: true, paths: ['STATE.md'] };
  s.triage = { present: true };
  s.loopConfig = { present: true, path: 'LOOP.md' };
  s.agentsMd = { present: true };
  s.skills = { count: 3, loopSkills: ['loop-triage', 'minimal-fix', 'loop-verifier'] };
  s.verifier = { present: true };
  s.safety = { loopMdMentionsSafety: true, safetyDocPresent: true };
  s.github = { present: true, workflows: true };
  s.registry = { present: true };
  s.cost = { budgetDoc: true, runLog: true, loopMdBudget: true, budgetSkill: true };
  const { level } = computeScore(s);
  assert.equal(level, 'L2');
});

test('readiness default policy matrix: gates, assessment bands, and guidance anchors', () => {
  const cases = [
    {
      name: 'L3 happy path',
      signals: l3CandidateSignals(),
      expected: {
        level: 'L3',
        assessment: 'Strong loop readiness',
        findings: [
          { level: 'ok', message: 'Loop activity detected' },
          { level: 'ok', message: 'loop-budget.md present' },
        ],
        recommendations: [],
      },
    },
    {
      name: 'high score capped at L2 without cost observability',
      signals: l3CandidateSignals({
        cost: { budgetDoc: false, runLog: false, loopMdBudget: false, budgetSkill: false },
      }),
      expected: {
        level: 'L2',
        assessment: 'Strong signals but missing cost observability',
        findings: [
          { level: 'warn', message: 'Score qualifies for L3 but cost observability is incomplete' },
          { level: 'warn', message: 'No loop-budget.md' },
          { level: 'warn', message: 'No loop-run-log.md' },
        ],
        recommendations: [
          'Scaffold with zj-loop-init or copy templates/loop-budget.md.template',
          'Copy templates/loop-run-log.md.template to loop-run-log.md',
        ],
      },
    },
    {
      name: 'high score capped at L2 without proven activity',
      signals: l3CandidateSignals({
        loopActivity: { present: false, evidence: [] },
      }),
      expected: {
        level: 'L2',
        assessment: 'Strong structure but no proven loop runs yet',
        findings: [
          { level: 'warn', message: 'Score qualifies for L3 but no proven loop activity yet' },
          { level: 'warn', message: 'No evidence of actual loop runs detected' },
        ],
        recommendations: [
          'Run one loop (report-only), update + commit STATE.md (or pattern state). This turns structure into proven usage.',
        ],
      },
    },
    {
      name: 'L1 foundation keeps setup recommendations visible',
      signals: {
        ...emptySignals(),
        stateFile: { present: true, paths: ['STATE.md'] },
        triage: { present: true },
        skills: { count: 1, loopSkills: ['loop-triage'] },
      },
      expected: {
        level: 'L1',
        assessment: 'Early loop setup',
        findings: [
          { level: 'ok', message: 'State file(s): STATE.md' },
          { level: 'ok', message: 'Triage skill present' },
          { level: 'warn', message: 'No loop-verifier skill' },
          { level: 'warn', message: 'No LOOP.md documenting cadence, limits, and gates' },
        ],
        recommendations: [
          'Add verifier: .grok/skills/loop-verifier, .claude/agents/loop-verifier.md, or .codex/agents/verifier.toml',
          'Copy starters/minimal-loop/LOOP.md and customize',
        ],
      },
    },
  ];

  for (const { name, signals, expected } of cases) {
    const evaluation = computeScore(signals);
    const guidance = evaluateReadinessGuidance(signals, evaluation.score);

    assert.equal(evaluation.level, expected.level, name);
    assert.match(evaluation.assessment, new RegExp(expected.assessment), name);

    for (const finding of expected.findings) {
      assert.ok(
        guidance.findings.some((actual) =>
          actual.level === finding.level && actual.message.includes(finding.message),
        ),
        `${name}: missing finding ${finding.level} ${finding.message}`,
      );
    }

    for (const recommendation of expected.recommendations) {
      assert.ok(
        guidance.recommendations.includes(recommendation),
        `${name}: missing recommendation ${recommendation}`,
      );
    }
  }
});

test('readiness rules: evaluates custom score, predicates, gates, and assessment bands', () => {
  const policy = parseReadinessPolicy(`
schemaVersion: 1
score:
  base: 1
  contributions:
    - id: state
      when: stateFile.present
      points: 10
predicates:
  missingActivity:
    not: loopActivity.present
levels:
  - level: L1
    threshold: 10
    when: stateFile.present
  - level: L0
    threshold: 0
assessments:
  - when:
      all:
        - scoreGte: 10
        - predicate: missingActivity
    message: Custom no activity
  - message: Custom default
`);
  const result = evaluateReadinessPolicy({ ...emptySignals(), stateFile: { present: true, paths: ['STATE.md'] } }, policy);
  assert.deepEqual(result, { score: 11, level: 'L1', assessment: 'Custom no activity' });
});

test('readiness rules: evaluates guidance findings, recommendations, and signal templates', () => {
  const policy = parseReadinessPolicy(`
schemaVersion: 1
score:
  base: 0
  contributions: []
predicates: {}
levels:
  - level: L0
    threshold: 0
assessments:
  - message: Default
guidance:
  - when: stateFile.present
    finding:
      level: ok
      message: "State files: {stateFile.paths}"
    recommendations:
      - "Review {stateFile.paths}"
`);
  const result = evaluateReadinessGuidance(
    { ...emptySignals(), stateFile: { present: true, paths: ['STATE.md', 'ci-sweeper-state.md'] } },
    0,
    policy,
  );
  assert.deepEqual(result, {
    findings: [{ level: 'ok', message: 'State files: STATE.md, ci-sweeper-state.md' }],
    recommendations: ['Review STATE.md, ci-sweeper-state.md'],
  });
});

test('auditProject: empty directory scores low', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-audit-empty-'));
  try {
    const result = await auditProject(dir);
    assert.equal(result.level, 'L0');
    assert.ok(result.score < 40);
    assert.ok(result.findings.some((f) => f.level === 'fail'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('auditProject: minimal L1 layout', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-audit-l1-'));
  try {
    await writeFile(path.join(dir, 'STATE.md'), '# State\n');
    await mkdir(path.join(dir, '.grok', 'skills', 'loop-triage'), { recursive: true });
    await writeFile(
      path.join(dir, '.grok', 'skills', 'loop-triage', 'SKILL.md'),
      '---\nname: loop-triage\ndescription: triage\n---\n# Triage\n',
    );
    const result = await auditProject(dir);
    assert.equal(result.level, 'L1');
    assert.ok(result.signals.triage.present);
    assert.ok(result.signals.stateFile.present);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('formatBadge: includes level and score', () => {
  const badge = formatBadge({
    target: '/tmp',
    score: 72,
    level: 'L2',
    assessment: 'test',
    signals: emptySignals(),
    findings: [],
    recommendations: [],
  });
  assert.match(badge, /Loop Ready L2 \(72\/100\)/);
  assert.match(badge, /img\.shields\.io/);
  assert.match(badge, /jununfly\.github\.io\/ZAgenticLoop/);
});

test('auditProject: git commit with triage counts as loop activity', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-audit-git-'));
  try {
    execSync('git init', { cwd: dir, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: dir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: dir, stdio: 'ignore' });
    await writeFile(path.join(dir, 'README.md'), '# test\n');
    execSync('git add README.md', { cwd: dir, stdio: 'ignore' });
    execSync('git commit -m "chore: daily triage update"', { cwd: dir, stdio: 'ignore' });
    const result = await auditProject(dir);
    assert.ok(result.signals.loopActivity.present);
    assert.ok(result.signals.loopActivity.evidence.some((e) => e.startsWith('git:')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('auditProject: L2 with verifier skill', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-audit-l2-'));
  try {
    await writeFile(path.join(dir, 'STATE.md'), '# State\n');
    for (const skill of ['loop-triage', 'loop-verifier']) {
      await mkdir(path.join(dir, '.grok', 'skills', skill), { recursive: true });
      await writeFile(
        path.join(dir, '.grok', 'skills', skill, 'SKILL.md'),
        `---\nname: ${skill}\ndescription: test\n---\n# ${skill}\n`,
      );
    }
    const result = await auditProject(dir);
    assert.equal(result.level, 'L2');
    assert.ok(result.signals.verifier.present);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
}

test('cli: --help exits without auditing', () => {
  const result = runCli(['--help']);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /zj-loop-audit — Loop Readiness Score CLI/);
});

test('cli: unknown options fail fast', () => {
  const result = runCli(['--wat']);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Unknown option: --wat/);
});

test('cli: empty project JSON exits 2 and remains parseable', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-audit-cli-empty-'));
  try {
    const result = runCli([dir, '--json']);
    assert.equal(result.status, 2);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.level, 'L0');
    assert.ok(report.score < 40);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('cli: --fix remains an alias for --suggest', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-audit-cli-fix-'));
  try {
    const result = runCli([dir, '--fix']);
    assert.equal(result.status, 2);
    assert.match(result.stdout, /Suggested actions/);
    assert.match(result.stdout, /zj-loop-init/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
