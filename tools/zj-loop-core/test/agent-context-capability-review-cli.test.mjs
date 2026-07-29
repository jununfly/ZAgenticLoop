import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';

const cli = path.resolve('dist/agent-context-capability-review-cli.js');

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: process.cwd() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const input = {
  report_metadata: {
    generated_at: '2026-07-29T00:00:00.000Z',
    generator: 'agent-local-review',
    workspace_commit: 'a'.repeat(40),
  },
  target: {
    path: 'tools/zj-loop-core/src/agent-context.ts',
    scope: 'context reconstruction and activation reference validation',
    commit: 'a'.repeat(40),
  },
  goal: 'Review the bounded context reconstruction capability.',
  capability_status: 'implemented',
  observed_flow: ['Read pinned state records.', 'Reconstruct a stable context snapshot.'],
  contracts_and_invariants: ['State head must remain stable.', 'Missing activation refs fail closed.'],
  facts: ['The module exposes reconstructAgentContext.'],
  inferences: ['The implementation is suitable for a bounded read-only review.'],
  unverified: ['Live provider parity outside the existing GitLab path.'],
  evidence_refs: {
    context_tests: {
      path: 'tools/zj-loop-core/test/agent-context.test.mjs',
      hash: 'd'.repeat(64),
      command: 'npm run test:agent-local',
      description: 'Deterministic context reconstruction tests.',
      classification: 'fact',
    },
  },
  failure_or_blocked_cases: [{
    code: 'activation-ref-missing',
    status: 'blocked',
    condition: 'Activation snapshot ref is absent.',
    observed_behavior: 'Context reconstruction returns blocked.',
    evidence_refs: ['context_tests'],
  }],
  risks_and_unknowns: ['This report does not prove a provider-neutral StateStore.'],
  verification_results: [{
    command: 'npm run test:agent-local',
    status: 'passed',
    summary: 'Agent-local and context tests passed.',
    evidence_refs: ['context_tests'],
  }],
  verification_manifest: [{
    command: 'npm run test:agent-local',
    status: 'passed',
    exit_code: 0,
    output_sha256: 'c'.repeat(64),
    output_path: 'docs/testing/artifacts/agent-local-gate.txt',
    captured_at: '2026-07-29T00:00:00.000Z',
  }],
  recommended_next_action: ['Human review of the bounded capability report.'],
  review_handoff: {
    status: 'needs-human-review',
    summary: 'Review the bounded context reconstruction capability.',
    risks: ['Provider-neutral StateStore remains unimplemented.'],
    decisions_needed: ['Accept or request revision of the report.'],
  },
  human_decision: { status: 'pending', decided_by: null, decided_at: null, rationale: null },
};

test('review CLI writes a canonical report from structured input', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-review-'));
  const inputPath = path.join(root, 'input.json');
  const outputPath = path.join(root, 'report.json');
  await writeFile(inputPath, `${JSON.stringify(input)}\n`);

  const result = await run(['--input', inputPath, '--out', outputPath, '--json']);
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.equal(report.schema, 'zj-loop.agent_context_capability_review.v1');
  assert.equal(report.human_decision.status, 'pending');
  assert.match(result.stdout, /agent_context_capability_review\.v1/);
});

test('review CLI fails when input is omitted', async () => {
  const result = await run(['--json']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /--input is required/);
});

test('review CLI rejects a mismatched evidence hash when verification is requested', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-review-'));
  const inputPath = path.join(root, 'input.json');
  await writeFile(inputPath, `${JSON.stringify({
    ...input,
    evidence_refs: {
      ...input.evidence_refs,
      context_tests: { ...input.evidence_refs.context_tests, hash: 'd'.repeat(64) },
    },
  })}\n`);

  const result = await run(['--input', inputPath, '--root', path.resolve('..', '..'), '--json']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /(evidence hash mismatch|manifest output hash mismatch)/);
});

test('review CLI verifies evidence against a pinned git ref', async () => {
  const root = path.resolve('..', '..');
  const currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const evidencePath = path.join(root, 'tools/zj-loop-core/test/agent-context.test.mjs');
  const evidenceHash = createHash('sha256').update(await readFile(evidencePath)).digest('hex');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-review-'));
  const inputPath = path.join(rootDir, 'input.json');
  const pinnedInput = {
    ...input,
    target: { ...input.target, commit: currentCommit },
    report_metadata: { ...input.report_metadata, workspace_commit: currentCommit },
    evidence_refs: { ...input.evidence_refs, context_tests: { ...input.evidence_refs.context_tests, hash: evidenceHash } },
  };
  await writeFile(inputPath, `${JSON.stringify(pinnedInput)}\n`);
  const result = await run(['--input', inputPath, '--root', root, '--ref', 'HEAD', '--json']);
  assert.equal(result.code, 1, 'fixture hash is intentionally not the current HEAD blob');
  assert.match(result.stderr, /(evidence hash mismatch|manifest output hash mismatch)/);
});

test('review CLI rejects an evidence symlink that escapes root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zj-loop-review-'));
  const outside = path.join(root, 'outside.txt');
  const inside = path.join(root, 'inside.txt');
  const inputPath = path.join(root, 'input.json');
  await writeFile(outside, 'outside\n');
  await symlink(outside, inside);
  const hash = createHash('sha256').update(await readFile(outside)).digest('hex');
  const symlinkInput = {
    ...input,
    evidence_refs: {
      ...input.evidence_refs,
      context_tests: { ...input.evidence_refs.context_tests, path: 'inside.txt', hash },
    },
  };
  await writeFile(inputPath, `${JSON.stringify(symlinkInput)}\n`);
  const result = await run(['--input', inputPath, '--root', root, '--json']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /evidence path escapes root/);
});
