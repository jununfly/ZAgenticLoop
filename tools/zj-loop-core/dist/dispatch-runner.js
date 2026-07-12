import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildConsumerRunPlan } from './consumer-runner.js';
export async function readSignalEnvelope(input) {
    return validateSignalEnvelope(JSON.parse(await readFile(input.path, 'utf8')));
}
export function validateSignalEnvelope(value) {
    if (!isRecord(value))
        throw new Error('Signal envelope must be an object');
    if (value.schema !== 'zj-loop.signal.v1')
        throw new Error('Signal envelope schema must be zj-loop.signal.v1');
    const signalId = requireString(value.signal_id, 'signal_id');
    const source = requireEnum(value.source, 'source', ['github_issue', 'gitlab_issue', 'workflow_dispatch', 'codex', 'local']);
    const provider = requireEnum(value.provider, 'provider', ['github', 'gitlab', 'none']);
    const subject = requireSubject(value.subject);
    const intent = requireEnum(value.intent, 'intent', ['triage', 'fix', 'activate_roadmap', 'review_pr', 'draft_changelog', 'closeout']);
    const payload = value.payload === undefined ? {} : value.payload;
    if (!isRecord(payload))
        throw new Error('payload must be an object');
    return {
        schema: 'zj-loop.signal.v1',
        signal_id: signalId,
        source,
        provider,
        subject,
        intent,
        payload,
    };
}
export async function dispatchSignal(input) {
    const root = input.root ?? '.';
    const mode = input.mode ?? 'auto';
    const now = input.now ?? new Date().toISOString();
    const routeId = resolveRouteForSignal(input.signal);
    const duplicateKey = buildDuplicateKey({ signal: input.signal, routeId });
    const orchestrationId = `orch_${stableHash(duplicateKey)}`;
    const storagePath = getOrchestrationPath(orchestrationId);
    const existing = await readExistingOrchestration({ root, storagePath });
    if (existing && mode === 'resume') {
        return {
            ...existing,
            status: 'resume',
            resumes: existing.orchestration_id,
            updated_at: now,
        };
    }
    if (existing && mode !== 'resume') {
        return {
            ...existing,
            status: 'duplicate',
            duplicate_of: existing.orchestration_id,
            updated_at: now,
        };
    }
    const consumerRunPlan = await buildConsumerRunPlan({
        root,
        selector: routeId,
        source: input.signal.source,
        signalId: input.signal.signal_id,
    });
    const status = statusForPlan({ mode, consumerRunPlan });
    const envelope = {
        schema: 'zj-loop.orchestration.v1',
        orchestration_id: orchestrationId,
        duplicate_key: duplicateKey,
        status,
        mode,
        created_at: now,
        updated_at: now,
        signal: input.signal,
        route_decision: consumerRunPlan.route_decision,
        carrier_plan: buildCarrierPlan(input.signal),
        consumer_run_plan: consumerRunPlan,
        review_artifact: buildReviewArtifact(consumerRunPlan),
        closeout_hint: {
            required: status === 'executed_to_review_artifact',
            reason: status === 'executed_to_review_artifact'
                ? 'review artifact should be closed out after merge or explicit completion'
                : 'no closeout required before a review artifact exists',
        },
        stop_signal: status === 'hard_stopped'
            ? {
                reason: consumerRunPlan.reason,
                next_steps: consumerRunPlan.next_steps,
            }
            : null,
        storage: {
            path: storagePath,
        },
    };
    await writeOrchestrationEnvelope({ root, envelope });
    return envelope;
}
async function readExistingOrchestration(input) {
    try {
        return JSON.parse(await readFile(path.resolve(input.root, input.storagePath), 'utf8'));
    }
    catch (err) {
        if (isNodeError(err) && err.code === 'ENOENT')
            return null;
        throw err;
    }
}
export function getOrchestrationPath(orchestrationId) {
    return `zj-loop/orchestrations/${sanitizeId(orchestrationId)}.json`;
}
export async function writeOrchestrationEnvelope(input) {
    const absolutePath = path.resolve(input.root ?? '.', input.envelope.storage.path);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${JSON.stringify(input.envelope, null, 2)}\n`);
}
function resolveRouteForSignal(signal) {
    const explicitRoute = signal.payload.route_id;
    if (typeof explicitRoute === 'string' && explicitRoute.trim())
        return explicitRoute.trim();
    if (signal.intent === 'triage')
        return 'issue-backlog-triage';
    if (signal.intent === 'activate_roadmap')
        return 'roadmap-sliced-development';
    if (signal.intent === 'review_pr')
        return 'pr-steward-fix-request';
    if (signal.intent === 'draft_changelog')
        return 'changelog-drafter-draft-request';
    if (signal.intent === 'closeout')
        return 'post-merge-roadmap-closeout';
    if (signal.intent === 'fix')
        return 'ci-sweeper';
    throw new Error(`No route mapping for intent: ${signal.intent}`);
}
function buildDuplicateKey(input) {
    return [
        input.signal.provider,
        input.signal.subject.kind,
        input.signal.subject.id,
        input.signal.intent,
        input.routeId,
    ].join(':');
}
function buildCarrierPlan(signal) {
    if (signal.subject.kind === 'issue' || signal.subject.kind === 'pr' || signal.subject.kind === 'mr') {
        return {
            action: 'reuse-source-carrier',
            carrier_kind: signal.subject.kind,
            source_subject: signal.subject,
            comment_required: true,
            reason: 'source subject is a reusable tracker carrier',
        };
    }
    return {
        action: 'create-carrier',
        carrier_kind: signal.provider === 'none' ? 'local-file' : 'new-issue',
        source_subject: signal.subject,
        comment_required: true,
        reason: 'source subject is not a reusable tracker carrier',
    };
}
function statusForPlan(input) {
    if (input.mode === 'plan-only')
        return 'planned';
    if (input.consumerRunPlan.status === 'blocked')
        return 'hard_stopped';
    if (input.consumerRunPlan.execution_allowed && (input.mode === 'auto' || input.mode === 'execute')) {
        return 'executed_to_review_artifact';
    }
    return 'planned';
}
function buildReviewArtifact(plan) {
    const primaryArtifact = plan.route_specific_artifacts.find((artifact) => artifact.role === 'primary-result');
    if (primaryArtifact) {
        return {
            kind: primaryArtifact.path.endsWith('.json') ? 'structured-evidence' : 'review-artifact',
            path: primaryArtifact.path,
            description: primaryArtifact.description,
        };
    }
    if (plan.status === 'report-only') {
        return {
            kind: 'report-evidence',
            description: 'Report-only route writes evidence to the configured evidence store or workflow summary.',
        };
    }
    return {
        kind: 'hard-stop',
        description: plan.reason,
    };
}
function requireSubject(value) {
    if (!isRecord(value))
        throw new Error('subject must be an object');
    const kind = requireEnum(value.kind, 'subject.kind', ['issue', 'pr', 'mr', 'ci_run', 'dependency_alert', 'plan', 'local_goal']);
    const id = requireString(value.id, 'subject.id');
    const url = value.url === undefined ? undefined : requireString(value.url, 'subject.url');
    return { kind, id, ...(url === undefined ? {} : { url }) };
}
function requireString(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new Error(`Missing ${field}`);
    return value.trim();
}
function requireEnum(value, field, values) {
    if (typeof value !== 'string' || !values.includes(value)) {
        throw new Error(`Invalid ${field}: expected one of ${values.join(', ')}`);
    }
    return value;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNodeError(value) {
    return value instanceof Error && 'code' in value;
}
function stableHash(value) {
    return createHash('sha256').update(value).digest('hex').slice(0, 12);
}
function sanitizeId(value) {
    return value.replace(/[^A-Za-z0-9._-]/g, '-');
}
