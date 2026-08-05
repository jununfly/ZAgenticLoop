import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { REAL_AGENT_DOGFOOD_GRAPH_PHASES } from './real-agent-dogfood-graph-orchestrator.js';
const execFile = promisify(execFileCallback);
export const REAL_AGENT_DOGFOOD_CONFORMANCE_SCHEMA = 'zj-loop.real_agent_dogfood_conformance_evidence.v1';
export const REAL_AGENT_DOGFOOD_CONFORMANCE_DIGEST_PROFILE = 'zj-loop.real-agent-dogfood-conformance.v1';
export const REAL_AGENT_DOGFOOD_CONFORMANCE_COMMAND = ['npm', 'test'];
const FAILURE_MATRIX = ['worker-lease-expiry', 'worker-lease-digest-mismatch', 'lifecycle-revision-conflict', 'graph-phase-append-conflict', 'worker-lease-release-conflict', 'cleanup-uncertainty', 'replay-idempotency', 'replay-digest-conflict'];
export const REAL_AGENT_DOGFOOD_FAILURE_MATRIX_DIGEST = `sha256:${createHash('sha256').update(JSON.stringify(FAILURE_MATRIX), 'utf8').digest('hex')}`;
function validEvidenceDigest(value) { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value); }
export async function runRealAgentDogfoodGraphConformance(input) {
    void input.plan;
    const seed = [...(input.completed_phases ?? [])];
    if (seed.some((phase, index) => phase !== REAL_AGENT_DOGFOOD_GRAPH_PHASES[index]))
        throw new Error('graph-conformance-completed-phases-invalid');
    const phaseEvidence = { ...(input.phase_evidence ?? {}) };
    if (seed.some((phase) => !validEvidenceDigest(phaseEvidence[phase])))
        throw new Error('graph-conformance-history-evidence-invalid');
    const completed = seed;
    for (const phase of REAL_AGENT_DOGFOOD_GRAPH_PHASES.slice(seed.length)) {
        let result;
        try {
            result = await input.stages[phase]();
        }
        catch {
            result = { status: 'outcome-uncertain', reason: `${phase.replaceAll('_', '-')}-outcome-uncertain` };
        }
        if (result.status !== 'passed')
            return { schema: 'zj-loop.real_agent_dogfood_graph_conformance.v1', status: result.status, completed_phases: completed, current_phase: phase, ...(result.reason ? { reason: result.reason } : {}), phase_evidence: phaseEvidence, side_effects_executed: completed.includes('merge') };
        if (!validEvidenceDigest(result.evidence_digest))
            return { schema: 'zj-loop.real_agent_dogfood_graph_conformance.v1', status: 'outcome-uncertain', completed_phases: completed, current_phase: phase, reason: 'phase-evidence-required', phase_evidence: phaseEvidence, side_effects_executed: completed.includes('merge') };
        phaseEvidence[phase] = result.evidence_digest;
        completed.push(phase);
    }
    let replay;
    try {
        replay = await input.replay();
    }
    catch {
        return { schema: 'zj-loop.real_agent_dogfood_graph_conformance.v1', status: 'outcome-uncertain', completed_phases: completed, reason: 'replay-outcome-uncertain', phase_evidence: phaseEvidence, side_effects_executed: true };
    }
    if (replay.status !== 'passed' || replay.integrity_status !== 'complete' || !validEvidenceDigest(replay.read_model_digest))
        return { schema: 'zj-loop.real_agent_dogfood_graph_conformance.v1', status: 'outcome-uncertain', completed_phases: completed, reason: 'replay-gate-failed', phase_evidence: phaseEvidence, replay, side_effects_executed: true };
    return { schema: 'zj-loop.real_agent_dogfood_graph_conformance.v1', status: 'closed', completed_phases: completed, phase_evidence: phaseEvidence, replay, side_effects_executed: true };
}
function canonical(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('real-agent-dogfood-conformance-canonicalization-invalid');
    return json;
}
function digest(value) { return `sha256:${createHash('sha256').update(typeof value === 'string' ? value : canonical(value), 'utf8').digest('hex')}`; }
export async function generateRealAgentDogfoodConformanceEvidence(input) {
    if (!input.repo_root.trim() || !/^sha256:[0-9a-f]{64}$/.test(input.plan_digest))
        throw new Error('real-agent-dogfood-conformance-input-invalid');
    const packageRoot = path.join(input.repo_root, 'tools', 'zj-loop-core');
    const gitHead = input.git_head ?? (async (cwd) => (await execFile('git', ['rev-parse', 'HEAD'], { cwd })).stdout.trim());
    const run = input.run ?? (async (cwd, command) => {
        try {
            const result = await execFile(command[0], command.slice(1), { cwd, maxBuffer: 8 * 1024 * 1024 });
            return { exit_code: 0, stdout: result.stdout, stderr: result.stderr };
        }
        catch (error) {
            const failure = error;
            return { exit_code: typeof failure.code === 'number' ? failure.code : 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
        }
    });
    const [coreCommit, result] = await Promise.all([gitHead(input.repo_root), run(packageRoot, REAL_AGENT_DOGFOOD_CONFORMANCE_COMMAND)]);
    if (!/^[0-9a-f]{40}$/i.test(coreCommit))
        throw new Error('real-agent-dogfood-conformance-core-commit-invalid');
    const evidence = {
        schema: REAL_AGENT_DOGFOOD_CONFORMANCE_SCHEMA,
        status: result.exit_code === 0 ? 'passed' : 'blocked',
        plan_digest: input.plan_digest,
        core_commit: coreCommit,
        package_root: packageRoot,
        test_command: [...REAL_AGENT_DOGFOOD_CONFORMANCE_COMMAND],
        failure_matrix_digest: REAL_AGENT_DOGFOOD_FAILURE_MATRIX_DIGEST,
        digest_profile: REAL_AGENT_DOGFOOD_CONFORMANCE_DIGEST_PROFILE,
        exit_code: result.exit_code,
        output_digest: digest(`${result.stdout}\n${result.stderr}`),
        side_effects_executed: false,
    };
    const stored = await input.evidenceStore.put({ content: JSON.stringify(evidence), kind: 'real-agent-dogfood-conformance' });
    return { status: evidence.status, evidence_digest: stored.digest, evidence };
}
