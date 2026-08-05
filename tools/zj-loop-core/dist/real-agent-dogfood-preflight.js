import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { access, constants } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import { promisify } from 'node:util';
import { createRealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import { REAL_AGENT_DOGFOOD_CONFORMANCE_COMMAND, REAL_AGENT_DOGFOOD_CONFORMANCE_DIGEST_PROFILE, REAL_AGENT_DOGFOOD_CONFORMANCE_SCHEMA, REAL_AGENT_DOGFOOD_FAILURE_MATRIX_DIGEST } from './real-agent-dogfood-conformance.js';
const execFile = promisify(execFileCallback);
const DIGEST = /^sha256:[0-9a-f]{64}$/;
function canonical(value) {
    const json = canonicalize(value);
    if (typeof json !== 'string')
        throw new Error('real-agent-dogfood-preflight-canonicalization-invalid');
    return json;
}
function digest(value) { return `sha256:${createHash('sha256').update(canonical(value), 'utf8').digest('hex')}`; }
function check(id, status, reason) { return { id, status, ...(reason ? { reason } : {}) }; }
async function gitHead(repoRoot) {
    const result = await execFile('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
    return result.stdout.trim();
}
async function readableFile(filePath, executable = false) {
    try {
        await access(filePath, executable ? constants.X_OK : constants.R_OK);
        return true;
    }
    catch {
        return false;
    }
}
async function socketReady(socketPath) {
    return await new Promise((resolve) => {
        const socket = net.createConnection(socketPath);
        let settled = false;
        const finish = (ready) => { if (settled)
            return; settled = true; socket.destroy(); resolve(ready); };
        socket.setTimeout(500, () => finish(false));
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
    });
}
export async function preflightRealAgentDogfood(input) {
    const checks = [];
    const platform = input.platform ?? process.platform;
    const plan = createRealAgentDogfoodGraphPlan(input.plan);
    let head;
    try {
        head = await gitHead(input.repo_root);
        checks.push(check('baseline-commit', head === plan.baseline_commit ? 'passed' : 'blocked', head === plan.baseline_commit ? undefined : 'baseline-commit-drift'));
    }
    catch {
        checks.push(check('baseline-commit', 'blocked', 'git-repository-unavailable'));
    }
    const allowed = path.resolve(input.repo_root, plan.allowed_files[0]);
    checks.push(check('allowed-file', await readableFile(allowed) ? 'passed' : 'blocked', await readableFile(allowed) ? undefined : 'allowed-file-missing'));
    const evidenceRoot = path.resolve(plan.evidence_store);
    const repoRoot = path.resolve(input.repo_root);
    const relative = path.relative(repoRoot, evidenceRoot);
    checks.push(check('evidence-store-isolation', relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) ? 'blocked' : 'passed', relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) ? 'evidence-store-inside-repo' : undefined));
    checks.push(check('provider-identity', input.provider_id === 'codex' ? 'passed' : 'blocked', input.provider_id === 'codex' ? undefined : 'provider-not-registered'));
    checks.push(check('provider-executable', await readableFile(input.provider_executable, true) ? 'passed' : 'blocked', await readableFile(input.provider_executable, true) ? undefined : 'provider-executable-unavailable'));
    const keychainReady = platform === 'darwin' && Boolean(input.human.human_id.trim()) && Boolean(input.human.key_tag.trim()) && await readableFile(input.human.helper_path, true);
    checks.push(check('keychain-config', keychainReady ? 'passed' : 'blocked', keychainReady ? undefined : platform !== 'darwin' ? 'macos-keychain-required' : 'keychain-helper-unavailable'));
    const providerRuntimeReady = DIGEST.test(input.provider_runtime_ipc.contract_digest) && await socketReady(input.provider_runtime_ipc.socket_path);
    checks.push(check('provider-runtime-ipc', providerRuntimeReady ? 'passed' : 'blocked', providerRuntimeReady ? undefined : 'provider-runtime-ipc-unavailable'));
    let conformancePassed = false;
    if (DIGEST.test(input.conformance_evidence_digest)) {
        try {
            const value = JSON.parse((await input.evidence_store.readOnly({ digest: input.conformance_evidence_digest })).toString('utf8'));
            conformancePassed = value.schema === REAL_AGENT_DOGFOOD_CONFORMANCE_SCHEMA && value.status === 'passed' && value.plan_digest === plan.plan_digest && typeof value.core_commit === 'string' && /^[0-9a-f]{40}$/i.test(value.core_commit) && JSON.stringify(value.test_command) === JSON.stringify(REAL_AGENT_DOGFOOD_CONFORMANCE_COMMAND) && value.failure_matrix_digest === REAL_AGENT_DOGFOOD_FAILURE_MATRIX_DIGEST && value.digest_profile === REAL_AGENT_DOGFOOD_CONFORMANCE_DIGEST_PROFILE && value.exit_code === 0;
        }
        catch {
            conformancePassed = false;
        }
    }
    checks.push(check('deterministic-conformance-evidence', conformancePassed ? 'passed' : 'blocked', conformancePassed ? undefined : 'conformance-evidence-missing-or-unbound'));
    const unsigned = { schema: 'zj-loop.real_agent_dogfood_preflight.v1', status: checks.every((item) => item.status === 'passed') ? 'execution-ready' : 'blocked', side_effects_executed: false, plan_digest: plan.plan_digest, plan_definition_digest: plan.plan_definition_digest, checks };
    return Object.freeze({ ...unsigned, preflight_digest: digest(unsigned) });
}
