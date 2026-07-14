import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
export const WORKSPACE_ACTIVATION_REQUEST_SCHEMA = 'zj-loop.workspace_activation_request.v1';
export const WORKSPACE_ROUTE_DECISION_EVIDENCE_SCHEMA = 'zj-loop.workspace_route_decision_evidence.v1';
export const WORKSPACE_ROUTE_DECISION_SCHEMA = 'zj-loop.workspace_route_decision.v1';
export async function writeWorkspaceRouteDecision(input) {
    if (input.signal.provider !== 'none') {
        throw new Error('Workspace Route Decision requires signal.provider to be none');
    }
    const id = sanitizeId(input.orchestrationId);
    const carrierPath = `zj-loop/requests/${id}.json`;
    const evidencePath = `zj-loop/evidence/route-decisions/${id}.json`;
    const record = {
        schema: WORKSPACE_ROUTE_DECISION_SCHEMA,
        adapter_id: 'workspace',
        carrier: {
            kind: 'local-activation-request',
            path: carrierPath,
        },
        evidence: {
            kind: 'route-decision-evidence',
            path: evidencePath,
        },
    };
    const activationRequest = {
        schema: WORKSPACE_ACTIVATION_REQUEST_SCHEMA,
        schema_version: 1,
        created_at: input.now,
        provider: 'none',
        orchestration_id: input.orchestrationId,
        route_id: input.consumerRunPlan.route_id,
        consumer: input.consumerRunPlan.consumer,
        source: {
            signal_id: input.signal.signal_id,
            kind: input.signal.source,
            subject: input.signal.subject,
            intent: input.signal.intent,
        },
        status: 'requested',
        resume_anchor: {
            kind: 'local-file',
            path: carrierPath,
        },
    };
    const evidence = {
        schema: WORKSPACE_ROUTE_DECISION_EVIDENCE_SCHEMA,
        schema_version: 1,
        created_at: input.now,
        adapter_id: 'workspace',
        orchestration_id: input.orchestrationId,
        carrier: record.carrier,
        route_decision: {
            route: input.consumerRunPlan.route_decision.route,
            status: input.consumerRunPlan.status,
            consumer: input.consumerRunPlan.consumer,
            reason: input.consumerRunPlan.reason,
        },
    };
    await writeJson(input.root, carrierPath, activationRequest);
    await writeJson(input.root, evidencePath, evidence);
    return record;
}
async function writeJson(root, relativePath, value) {
    const target = path.resolve(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}
function sanitizeId(value) {
    return value.replace(/[^A-Za-z0-9._-]/g, '-');
}
