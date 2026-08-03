#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultCliIo, runCli, type CliIo } from './cli.js';
import { createMacOSKeychainHumanSigner } from './macos-keychain-human-signer.js';
import type { HumanSigner } from './human-signer.js';
import { createContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';
import { projectRealAgentDogfoodLifecycle, type RealAgentDogfoodEvent } from './real-agent-dogfood-lifecycle.js';
import { createSqliteStateStore } from './sqlite-state-store.js';
import { createRealAgentDogfoodReviewDecision, recordRealAgentDogfoodReviewDecision } from './real-agent-dogfood-review-decision.js';
import type { RealAgentDogfoodReviewRevisionRequirement } from './real-agent-dogfood-review-decision.js';
import { publishRealAgentDogfoodReviewPackage } from './real-agent-dogfood-review-package-publisher.js';
import { readRealAgentDogfoodReviewPackage } from './real-agent-dogfood-review-package.js';

const SCHEMA = 'zj-loop.real_agent_dogfood_review_cli.v1';

type ReviewCliDeps = { signer?: HumanSigner; now?: () => string };

function required(options: Record<string, string | boolean | undefined>, name: string): string {
  const value = options[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name}-required`);
  return value;
}

function signerFor(options: Record<string, string | boolean | undefined>, deps: ReviewCliDeps): HumanSigner {
  if (deps.signer) return deps.signer;
  if (process.platform !== 'darwin') throw new Error('review-signer-adapter-required');
  const humanId = required(options, 'human-id');
  const keyTag = required(options, 'key-tag');
  const helperPath = required(options, 'helper-path');
  return createMacOSKeychainHumanSigner({ human_id: humanId, key_tag: keyTag, helper_path: helperPath });
}

async function readPackage(options: Record<string, string | boolean | undefined>, actor: string) {
  const evidenceStore = await createContentAddressedEvidenceStore({ root: required(options, 'evidence-store') });
  const reviewPackage = await readRealAgentDogfoodReviewPackage({ evidenceStore, evidence_digest: required(options, 'package-evidence'), actor });
  return { evidenceStore, reviewPackage };
}

async function show(options: Record<string, string | boolean | undefined>) {
  const { reviewPackage } = await readPackage(options, 'review-cli:show');
  return { schema: SCHEMA, status: reviewPackage.decisionability === 'ready' ? 'review-pending' : 'blocked', decisionability: reviewPackage.decisionability, warning_ids: reviewPackage.findings.filter((finding) => finding.status === 'warning').map((finding) => finding.finding_id).sort(), package: reviewPackage, side_effects_executed: false };
}

function jsonOption<T>(options: Record<string, string | boolean | undefined>, name: string, fallback: T): T {
  const value = options[name];
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  try { return JSON.parse(value) as T; } catch { throw new Error(`${name}-json-invalid`); }
}

async function decide(options: Record<string, string | boolean | undefined>, deps: ReviewCliDeps) {
  const statePath = required(options, 'state-store');
  const networkId = required(options, 'network-id');
  const dogfoodId = required(options, 'dogfood-id');
  const evidenceStore = await createContentAddressedEvidenceStore({ root: required(options, 'evidence-store') });
  const packageEvidence = required(options, 'package-evidence');
  const stateStore = createSqliteStateStore({ filename: statePath });
  try {
    const snapshot = await stateStore.readEvents({ network_id: networkId, aggregate_type: 'real-agent-dogfood', aggregate_id: dogfoodId });
    const lifecycle = projectRealAgentDogfoodLifecycle(snapshot.events as unknown as RealAgentDogfoodEvent[]);
    const reviewPackage = await readRealAgentDogfoodReviewPackage({ evidenceStore, evidence_digest: packageEvidence, actor: `review-cli:${dogfoodId}` });
    if (lifecycle.status !== 'review-pending') throw new Error('real-agent-dogfood-review-lifecycle-not-pending');
    if (reviewPackage.network_id !== networkId || reviewPackage.dogfood_id !== dogfoodId || reviewPackage.execution_id !== lifecycle.execution_id || reviewPackage.attempt !== lifecycle.attempt || reviewPackage.lifecycle_revision !== snapshot.snapshot_revision || reviewPackage.lifecycle_digest !== lifecycle.lifecycle_digest) throw new Error('real-agent-dogfood-review-package-lifecycle-drift');
    const publication = await publishRealAgentDogfoodReviewPackage({ stateStore, review_package: reviewPackage, evidence_digest: packageEvidence, expected_revision: snapshot.snapshot_revision, now: deps.now?.() ?? new Date().toISOString() });
    if (publication.status === 'conflict') throw new Error(publication.reason ?? 'real-agent-dogfood-review-package-publication-conflict');
    const signer = signerFor(options, deps);
    const decision = await createRealAgentDogfoodReviewDecision({ signer, review_package: reviewPackage, decision: required(options, 'decision') as 'accept' | 'reject' | 'request-revision', comment: required(options, 'comment'), acknowledged_warning_ids: jsonOption<string[]>(options, 'acknowledged-warning-ids', []), revision_requirements: jsonOption<RealAgentDogfoodReviewRevisionRequirement[]>(options, 'revision-requirements', []), decided_at: deps.now?.() ?? new Date().toISOString() });
    const decisionEvidence = await evidenceStore.put({ content: JSON.stringify(decision), kind: 'real-agent-dogfood-review-decision' });
    const identity = await signer.getPublicIdentity();
    const recorded = await recordRealAgentDogfoodReviewDecision({ stateStore, lifecycle, review_package: reviewPackage, decision, identity, expected_revision: await stateStore.getRevision(networkId), now: deps.now?.() ?? new Date().toISOString() });
    return { schema: SCHEMA, status: recorded.status, network_id: networkId, dogfood_id: dogfoodId, execution_id: reviewPackage.execution_id, attempt: reviewPackage.attempt, package_evidence_digest: packageEvidence, package_publication_status: publication.status, decision_evidence_digest: decisionEvidence.digest, state_revision: recorded.revision, side_effects_executed: true };
  } finally { await stateStore.close(); }
}

export function runRealAgentDogfoodReviewCli(argv: readonly string[] = process.argv.slice(2), io: CliIo = defaultCliIo, deps: ReviewCliDeps = {}): Promise<number> {
  return runCli({
    name: 'zj-loop-real-agent-dogfood-review',
    description: 'Inspect and record a signed Human decision for a provider-neutral OPN review package.',
    usage: 'zj-loop-real-agent-dogfood-review <show|decide> [options]',
    options: [
      { name: 'command', type: 'positional', description: 'show or decide' },
      { name: 'state-store', flag: 'state-store', type: 'string', description: 'SQLite StateStore path' },
      { name: 'evidence-store', flag: 'evidence-store', type: 'string', description: 'Content-addressed EvidenceStore root' },
      { name: 'package-evidence', flag: 'package-evidence', type: 'string', description: 'Review package evidence digest' },
      { name: 'network-id', flag: 'network-id', type: 'string', description: 'Network id' },
      { name: 'dogfood-id', flag: 'dogfood-id', type: 'string', description: 'Dogfood id' },
      { name: 'decision', flag: 'decision', type: 'enum', values: ['accept', 'reject', 'request-revision'], description: 'Human review decision' },
      { name: 'comment', flag: 'comment', type: 'string', description: 'Human review comment' },
      { name: 'acknowledged-warning-ids', flag: 'acknowledged-warning-ids', type: 'string', description: 'JSON array of warning IDs acknowledged by Human' },
      { name: 'revision-requirements', flag: 'revision-requirements', type: 'string', description: 'JSON array of structured revision requirements' },
      { name: 'human-id', flag: 'human-id', type: 'string', description: 'Human id for macOS Keychain signer' },
      { name: 'key-tag', flag: 'key-tag', type: 'string', description: 'macOS Keychain key tag' },
      { name: 'helper-path', flag: 'helper-path', type: 'string', description: 'macOS Keychain signer helper path' },
    ],
    async handler({ options }) {
      const command = String(options.command);
      const result = command === 'show' ? await show(options) : command === 'decide' ? await decide(options, deps) : (() => { throw new Error('unsupported-review-command'); })();
      io.stdout(JSON.stringify(result));
      return 0;
    },
  }, argv, io);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exitCode = await runRealAgentDogfoodReviewCli();
