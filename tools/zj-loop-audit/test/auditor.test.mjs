import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditProject, computeScore } from '../dist/auditor.js';
import { evaluateReadinessGuidance, evaluateReadinessPolicy, parseReadinessPolicy } from '../dist/readiness-rules.js';
import { formatBadge, formatHuman, formatMarkdown } from '../dist/reporter.js';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

function renderWorkflowTemplate(text) {
  const canonical = text.replace(/^# zj-loop-template-hash: .+$/m, '# zj-loop-template-hash: <computed>');
  const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 16);
  return text.replace(/^# zj-loop-template-hash: .+$/m, `# zj-loop-template-hash: ${hash}`);
}

async function writeMinimalRouteTable(dir) {
  await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
  await writeFile(
    path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'),
    `schemaVersion: 1
kind: zj-loop-route-table
routes:
  - route_id: manual-smoke-report
    enabled: true
    request_kind: report-only
    consumer: manual-smoke
    consumer_kind: report-consumer
    execution:
      mode: report-only
      side_effect_level: evidence
    maturity:
      protocol: designed
      runner: missing
    capabilities:
      scopes: [manual-smoke]
      verifiers: [workflow-summary]
      max_side_effect_level: evidence
`,
  );
}

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
    routeTable: { present: false },
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
    stateFile: { present: true, paths: ['zj-loop/STATE.md'] },
    loopConfig: { present: true, path: 'zj-loop/ZJ-LOOP.md' },
    skills: { count: 3, loopSkills: ['zj-loop-triage', 'zj-minimal-fix', 'zj-loop-verifier'] },
    verifier: { present: true },
    triage: { present: true },
    agentsMd: { present: true },
    patterns: { documented: true },
    safety: { loopMdMentionsSafety: true, safetyDocPresent: true },
    routeTable: { present: true },
    github: { present: true, workflows: true },
    mcp: { present: true },
    worktreeEvidence: { present: true },
    registry: { present: true },
    constraints: { present: true, hasConstraintsSkill: true },
    cost: { budgetDoc: true, runLog: true, loopMdBudget: true, budgetSkill: true },
    loopActivity: { present: true, evidence: ['git:state update', 'state:zj-loop/STATE.md'] },
    ...overrides,
  };
}

test('computeScore: empty project is L0', () => {
  const { score, level } = computeScore(emptySignals());
  assert.equal(level, 'L0');
  assert.ok(score < 38);
});

test('auditProject validates generated GitHub Actions workflow metadata', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-audit-workflow-valid-'));
  try {
    await mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    await writeMinimalRouteTable(dir);
    await writeFile(
      path.join(dir, '.github', 'workflows', 'zj-loop-smoke.yml'),
      renderWorkflowTemplate(`# zj-loop-generated: true
# zj-loop-template-id: github-actions/zj-loop-smoke
# zj-loop-template-version: 1
# zj-loop-template-hash: generated-by-zj-loop-init

name: ZJ Loop Smoke

jobs:
  smoke:
    steps:
      - run: npx --yes --package @jununfly/zj-loop-core@0.1.2 zj-loop-route dispatch manual-smoke-report
`),
    );

    const result = await auditProject(dir);
    assert.ok(result.findings.some((finding) =>
      finding.level === 'ok' && finding.message.includes('Generated GitHub Actions workflow bundle metadata valid'),
    ));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('auditProject fails generated workflow health when Route Table is missing', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-audit-workflow-route-table-missing-'));
  try {
    await mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    await writeFile(
      path.join(dir, '.github', 'workflows', 'zj-loop-smoke.yml'),
      renderWorkflowTemplate(`# zj-loop-generated: true
# zj-loop-template-id: github-actions/zj-loop-smoke
# zj-loop-template-version: 1
# zj-loop-template-hash: generated-by-zj-loop-init

name: ZJ Loop Smoke

jobs:
  smoke:
    steps:
      - run: npx --yes --package @jununfly/zj-loop-core@0.1.2 zj-loop-route dispatch manual-smoke-report
`),
    );

    const result = await auditProject(dir);
    assert.ok(result.findings.some((finding) =>
      finding.level === 'fail' && finding.message.includes('requires zj-loop/zj-loop-route-table.yaml'),
    ));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('auditProject warns for missing or inconsistent route execution transparency fields', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-audit-route-execution-warning-'));
  try {
    await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
    await writeFile(
      path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'),
      `schemaVersion: 1
kind: zj-loop-route-table
routes:
  - route_id: manual-smoke-report
    enabled: true
    request_kind: report-only
    consumer: manual-smoke
  - route_id: ci-sweeper
    enabled: true
    request_kind: issue-fix-request
    consumer: ci-sweeper
    consumer_kind: fix-runner
    execution:
      mode: live
      side_effect_level: pr
    maturity:
      protocol: dogfooded
      runner: dogfooded
    capabilities:
      scopes: [ci]
      verifiers: [ci-validate-gates]
      max_side_effect_level: pr
`,
    );

    const result = await auditProject(dir);
    assert.ok(result.findings.some((finding) =>
      finding.level === 'warn' &&
      finding.message.includes('Route manual-smoke-report is missing execution transparency fields'),
    ));
    assert.ok(result.findings.some((finding) =>
      finding.level === 'fail' &&
      finding.message.includes('Route ci-sweeper execution contract needs attention'),
    ));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('auditProject fails generated bundles with route rows missing execution transparency fields', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-audit-generated-route-execution-fail-'));
  try {
    await mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
    await writeFile(
      path.join(dir, 'zj-loop', 'zj-loop-route-table.yaml'),
      `schemaVersion: 1
kind: zj-loop-route-table
routes:
  - route_id: manual-smoke-report
    enabled: true
    request_kind: report-only
    consumer: manual-smoke
`,
    );
    await writeFile(
      path.join(dir, '.github', 'workflows', 'zj-loop-smoke.yml'),
      renderWorkflowTemplate(`# zj-loop-generated: true
# zj-loop-template-id: github-actions/zj-loop-smoke
# zj-loop-template-version: 1
# zj-loop-template-hash: generated-by-zj-loop-init

name: ZJ Loop Smoke

jobs:
  smoke:
    steps:
      - run: npx --yes --package @jununfly/zj-loop-core@0.1.2 zj-loop-route dispatch manual-smoke-report
`),
    );

    const result = await auditProject(dir);
    assert.ok(result.findings.some((finding) =>
      finding.level === 'fail' &&
      finding.message.includes('Route manual-smoke-report is missing execution transparency fields'),
    ));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('auditProject fails generated workflow health when metadata hash is invalid', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-audit-workflow-invalid-'));
  try {
    await mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    await writeMinimalRouteTable(dir);
    await writeFile(
      path.join(dir, '.github', 'workflows', 'zj-loop-smoke.yml'),
      `# zj-loop-generated: true
# zj-loop-template-id: github-actions/zj-loop-smoke
# zj-loop-template-version: 1
# zj-loop-template-hash: 0000000000000000

name: ZJ Loop Smoke

jobs:
  smoke:
    steps:
      - run: npx --yes --package @jununfly/zj-loop-core@0.1.2 zj-loop-route dispatch manual-smoke-report
`,
    );

    const result = await auditProject(dir);
    assert.ok(result.findings.some((finding) =>
      finding.level === 'fail' && finding.message.includes('missing or invalid zj-loop generated metadata'),
    ));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('computeScore: state + triage reaches L1', () => {
  const s = emptySignals();
  s.stateFile = { present: true, paths: ['zj-loop/STATE.md'] };
  s.triage = { present: true };
  const { level, score } = computeScore(s);
  assert.equal(level, 'L1');
  assert.ok(score >= 38);
});

test('computeScore: full L2 signals', () => {
  const s = emptySignals();
  s.stateFile = { present: true, paths: ['zj-loop/STATE.md'] };
  s.triage = { present: true };
  s.skills = { count: 2, loopSkills: ['zj-loop-triage', 'zj-loop-verifier'] };
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
  s.stateFile = { present: true, paths: ['zj-loop/STATE.md'] };
  s.triage = { present: true };
  s.loopConfig = { present: true, path: 'zj-loop/ZJ-LOOP.md' };
  s.agentsMd = { present: true };
  s.skills = { count: 3, loopSkills: ['zj-loop-triage', 'zj-minimal-fix', 'zj-loop-verifier'] };
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
          { level: 'ok', message: 'zj-loop/zj-loop-route-table.yaml present' },
          { level: 'ok', message: 'zj-loop/zj-loop-budget.md present' },
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
          { level: 'warn', message: 'No zj-loop/zj-loop-budget.md' },
          { level: 'warn', message: 'No zj-loop/zj-loop-run-log.md' },
        ],
        recommendations: [
          'Scaffold with zj-loop-init or copy templates/zj-loop-budget.md.template',
          'Copy templates/zj-loop-run-log.md.template to zj-loop/zj-loop-run-log.md',
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
          'Run one loop (report-only), update + commit zj-loop/STATE.md (or pattern state). This turns structure into proven usage.',
        ],
      },
    },
    {
      name: 'L1 foundation keeps setup recommendations visible',
      signals: {
        ...emptySignals(),
        stateFile: { present: true, paths: ['zj-loop/STATE.md'] },
        triage: { present: true },
        skills: { count: 1, loopSkills: ['zj-loop-triage'] },
      },
      expected: {
        level: 'L1',
        assessment: 'Early loop setup',
        findings: [
          { level: 'ok', message: 'State file(s): zj-loop/STATE.md' },
          { level: 'ok', message: 'Triage skill present' },
          { level: 'warn', message: 'No zj-loop-verifier skill' },
          { level: 'warn', message: 'No zj-loop/ZJ-LOOP.md documenting cadence, limits, and gates' },
          { level: 'warn', message: 'No zj-loop/zj-loop-route-table.yaml' },
        ],
        recommendations: [
          'Add verifier: .grok/skills/zj-loop-verifier, .claude/agents/zj-loop-verifier.md, or .codex/agents/verifier.toml',
          'Copy starters/minimal-loop/ZJ-LOOP.md to zj-loop/ZJ-LOOP.md and customize',
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
  const result = evaluateReadinessPolicy({ ...emptySignals(), stateFile: { present: true, paths: ['zj-loop/STATE.md'] } }, policy);
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
      category: pass
      message: "State files: {stateFile.paths}"
      affectsScore: false
      nextSteps:
        - kind: validate
          label: "Review {stateFile.paths}"
          command: "test -f zj-loop/STATE.md"
    recommendations:
      - "Review {stateFile.paths}"
`);
  const result = evaluateReadinessGuidance(
    { ...emptySignals(), stateFile: { present: true, paths: ['zj-loop/STATE.md', 'zj-loop/ci-sweeper-state.md'] } },
    0,
    policy,
  );
  assert.deepEqual(result, {
    findings: [
      {
        level: 'ok',
        category: 'pass',
        message: 'State files: zj-loop/STATE.md, zj-loop/ci-sweeper-state.md',
        affectsScore: false,
        nextSteps: [
          {
            kind: 'validate',
            label: 'Review zj-loop/STATE.md, zj-loop/ci-sweeper-state.md',
            command: 'test -f zj-loop/STATE.md',
          },
        ],
      },
    ],
    recommendations: ['Review zj-loop/STATE.md, zj-loop/ci-sweeper-state.md'],
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
    await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
    await writeFile(path.join(dir, 'zj-loop', 'STATE.md'), '# State\n');
    await mkdir(path.join(dir, '.grok', 'skills', 'zj-loop-triage'), { recursive: true });
    await writeFile(
      path.join(dir, '.grok', 'skills', 'zj-loop-triage', 'SKILL.md'),
      '---\nname: zj-loop-triage\ndescription: triage\n---\n# Triage\n',
    );
    const result = await auditProject(dir);
    assert.equal(result.level, 'L1');
    assert.ok(result.signals.triage.present);
    assert.ok(result.signals.stateFile.present);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('auditProject: recognizes roadmap-sliced state from init artifact contract', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-audit-roadmap-state-'));
  try {
    await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
    await writeFile(path.join(dir, 'zj-loop', 'roadmap-sliced-state.md'), '# Roadmap-Sliced State\n\nLast run: never\n');
    await mkdir(path.join(dir, '.codex', 'skills', 'zj-roadmap-driven'), { recursive: true });
    await writeFile(
      path.join(dir, '.codex', 'skills', 'zj-roadmap-driven', 'SKILL.md'),
      '---\nname: zj-roadmap-driven\ndescription: roadmap\n---\n# Roadmap\n',
    );

    const result = await auditProject(dir);

    assert.equal(result.signals.stateFile.present, true);
    assert.ok(result.signals.stateFile.paths.includes('zj-loop/roadmap-sliced-state.md'));
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

test('reporter: explains hard gates separately from numeric score', () => {
  const result = {
    target: '/tmp',
    score: 90,
    level: 'L0',
    assessment: 'Strong structure but blocked.',
    signals: {
      ...l3CandidateSignals(),
      stateFile: { present: false, paths: [] },
    },
    findings: [],
    recommendations: [],
  };

  assert.match(formatHuman(result), /Level gate: L0 because hard gate failed: no recognized state file/);
  assert.match(formatMarkdown(result), /Level Gate.*no recognized state file/);
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
    await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
    await writeFile(path.join(dir, 'zj-loop', 'STATE.md'), '# State\n');
    for (const skill of ['zj-loop-triage', 'zj-loop-verifier']) {
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

test('cli: --suggest does not recommend copying artifacts that already exist', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-audit-cli-suggest-'));
  try {
    await mkdir(path.join(dir, 'zj-loop'), { recursive: true });
    await writeFile(path.join(dir, 'zj-loop', 'STATE.md'), '# State\n');
    await writeFile(path.join(dir, 'zj-loop', 'ZJ-LOOP.md'), '# Loop\n\n## Human Gates\n- Review release changes.\n');
    await writeFile(path.join(dir, 'zj-loop', 'zj-loop-budget.md'), '# Budget\n');
    await writeFile(path.join(dir, 'zj-loop', 'zj-loop-run-log.md'), '# Run Log\n');

    const result = runCli([dir, '--suggest']);

    assert.equal(result.stderr, '');
    assert.doesNotMatch(result.stdout, /cp templates\/zj-loop-budget\.md\.template/);
    assert.doesNotMatch(result.stdout, /cp templates\/zj-loop-run-log\.md\.template/);
    assert.match(result.stdout, /Readiness gaps:/);
    assert.match(result.stdout, /Hardening:/);
    assert.match(result.stdout, /Future tooling:/);
    assert.match(result.stdout, /Score impact: affects score\/level/);
    assert.match(result.stdout, /Add a Budget section to zj-loop\/ZJ-LOOP\.md/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('cli: --suggest uses zj-loop directory for missing scaffold artifacts', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zj-loop-audit-cli-suggest-dir-'));
  try {
    const result = runCli([dir, '--suggest']);

    assert.equal(result.stderr, '');
    assert.match(result.stdout, /mkdir -p zj-loop/);
    assert.match(result.stdout, /cp starters\/minimal-loop\/STATE\.md\.example zj-loop\/STATE\.md/);
    assert.match(result.stdout, /cp starters\/minimal-loop\/ZJ-LOOP\.md zj-loop\/ZJ-LOOP\.md/);
    assert.match(result.stdout, /cp templates\/zj-loop-budget\.md\.template zj-loop\/zj-loop-budget\.md/);
    assert.match(result.stdout, /cp templates\/zj-loop-run-log\.md\.template zj-loop\/zj-loop-run-log\.md/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
