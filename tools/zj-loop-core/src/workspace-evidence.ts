import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const WORKSPACE_REPORT_EVIDENCE_SCHEMA = 'zj-loop.workspace_report_evidence.v1';
export const WORKSPACE_DRAFT_EVIDENCE_SCHEMA = 'zj-loop.workspace_draft_evidence.v1';

export async function writeWorkspaceReportEvidence(input: {
  root: string;
  orchestrationId: string;
  routeId: string;
  consumer: string;
  carrierPath: string;
  now: string;
}): Promise<string> {
  const path = `zj-loop/evidence/workspace-reports/${sanitizeId(input.orchestrationId)}.json`;
  await writeJson(input.root, path, {
    schema: WORKSPACE_REPORT_EVIDENCE_SCHEMA,
    schema_version: 1,
    created_at: input.now,
    adapter_id: 'workspace',
    orchestration_id: input.orchestrationId,
    route_id: input.routeId,
    consumer: input.consumer,
    carrier: { kind: 'local-activation-request', path: input.carrierPath },
    outcome: 'report-evidence-recorded',
  });
  return path;
}

export async function writeWorkspaceDraftEvidence(input: {
  root: string;
  orchestrationId: string;
  routeId: string;
  consumer: string;
  carrierPath: string;
  now: string;
}): Promise<string> {
  const path = `zj-loop/evidence/workspace-drafts/${sanitizeId(input.orchestrationId)}.json`;
  await writeJson(input.root, path, {
    schema: WORKSPACE_DRAFT_EVIDENCE_SCHEMA,
    schema_version: 1,
    created_at: input.now,
    adapter_id: 'workspace',
    orchestration_id: input.orchestrationId,
    route_id: input.routeId,
    consumer: input.consumer,
    draft_mode: 'evidence',
    carrier: { kind: 'local-activation-request', path: input.carrierPath },
    outcome: 'draft-evidence-recorded',
  });
  return path;
}

async function writeJson(root: string, relativePath: string, value: unknown): Promise<void> {
  const target = path.resolve(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-');
}
