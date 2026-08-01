import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { verifyHumanSignature, type HumanSigner, type HumanSignerIdentity, type HumanSignature } from './human-signer.js';
import { validateLocalExecutionPreflight, type LocalExecutionPreflight } from './local-execution-preflight.js';

export const LOCAL_EXECUTION_APPROVAL_SCHEMA = 'zj-loop.local_execution_approval.v1' as const;
export const LOCAL_EXECUTION_APPROVAL_PROFILE = 'local-execution-approval-v1-2026-08' as const;
const DOMAIN = 'ZJ-LOOP/LOCAL-EXECUTION-APPROVAL/V1\0';
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export type LocalExecutionApproval = {
  schema: typeof LOCAL_EXECUTION_APPROVAL_SCHEMA;
  action: 'local.execution.approve';
  canonicalization_profile: typeof LOCAL_EXECUTION_APPROVAL_PROFILE;
  profile_sha256: string;
  network_id: string;
  plan_id: string;
  plan_revision: number;
  task_id: string;
  execution_id: string;
  attempt: number;
  provider_id: string;
  adapter_version: string;
  orchestration_preflight_digest: string;
  preflight_digest: string;
  request_id: string;
  issued_at: string;
  expires_at: string;
  human_id: string;
  public_key_fingerprint: string;
  signature: HumanSignature;
};

type ApprovalInput = { signer: HumanSigner; preflight: LocalExecutionPreflight; request_id: string; issued_at: string; expires_at: string };

function canonical(value: unknown): string { const json = canonicalize(value); if (typeof json !== 'string') throw new Error('local-execution-approval-canonicalization-invalid'); return json; }
function profileDigest(): string { return `sha256:${createHash('sha256').update(canonical({ schema: 'zj-loop.canonicalization_profile.v1', profile_id: LOCAL_EXECUTION_APPROVAL_PROFILE, schema_version: LOCAL_EXECUTION_APPROVAL_SCHEMA }), 'utf8').digest('hex')}`; }
function payload(value: Omit<LocalExecutionApproval, 'signature'>): Uint8Array { const json = canonical({ ...value, action: 'local.execution.approve' }); const domain = new TextEncoder().encode(DOMAIN); const body = new TextEncoder().encode(json); const result = new Uint8Array(domain.byteLength + body.byteLength); result.set(domain); result.set(body, domain.byteLength); return result; }
function requireRequest(input: ApprovalInput): void { if (validateLocalExecutionPreflight(input.preflight).status !== 'valid') throw new Error('local-execution-approval-preflight-invalid'); if (!input.request_id.trim()) throw new Error('local-execution-approval-request-id-required'); if (!Number.isFinite(Date.parse(input.issued_at)) || !Number.isFinite(Date.parse(input.expires_at)) || Date.parse(input.issued_at) >= Date.parse(input.expires_at)) throw new Error('local-execution-approval-time-invalid'); }

export async function createLocalExecutionApproval(input: ApprovalInput): Promise<LocalExecutionApproval> {
  requireRequest(input);
  const identity = await input.signer.getPublicIdentity();
  const unsigned = { schema: LOCAL_EXECUTION_APPROVAL_SCHEMA, action: 'local.execution.approve' as const, canonicalization_profile: LOCAL_EXECUTION_APPROVAL_PROFILE, profile_sha256: profileDigest(), network_id: input.preflight.network_id, plan_id: input.preflight.plan_id, plan_revision: input.preflight.plan_revision, task_id: input.preflight.task_id, execution_id: input.preflight.execution_id, attempt: input.preflight.attempt, provider_id: input.preflight.provider_id, adapter_version: input.preflight.adapter_version, orchestration_preflight_digest: input.preflight.orchestration_preflight_digest, preflight_digest: input.preflight.preflight_digest, request_id: input.request_id, issued_at: input.issued_at, expires_at: input.expires_at, human_id: identity.human_id, public_key_fingerprint: identity.public_key_fingerprint };
  return { ...unsigned, signature: await input.signer.sign({ payload: payload(unsigned) }) };
}

export function verifyLocalExecutionApproval(input: { approval: LocalExecutionApproval; identity: HumanSignerIdentity; now: string; expected: { preflight: LocalExecutionPreflight; request_id: string } }): { status: 'accepted' } | { status: 'blocked'; reason: string } {
  const approval = input.approval;
  if (validateLocalExecutionPreflight(input.expected.preflight).status !== 'valid') return { status: 'blocked', reason: 'preflight-invalid' };
  if (approval.schema !== LOCAL_EXECUTION_APPROVAL_SCHEMA || approval.action !== 'local.execution.approve' || approval.canonicalization_profile !== LOCAL_EXECUTION_APPROVAL_PROFILE || approval.profile_sha256 !== profileDigest()) return { status: 'blocked', reason: 'approval-profile-invalid' };
  if (approval.preflight_digest !== input.expected.preflight.preflight_digest) return { status: 'blocked', reason: 'preflight-digest-mismatch' };
  if (approval.request_id !== input.expected.request_id) return { status: 'blocked', reason: 'request-id-mismatch' };
  for (const key of ['network_id', 'plan_id', 'task_id', 'execution_id', 'provider_id', 'adapter_version', 'orchestration_preflight_digest'] as const) if (approval[key] !== input.expected.preflight[key]) return { status: 'blocked', reason: `${key}-mismatch` };
  if (approval.plan_revision !== input.expected.preflight.plan_revision || approval.attempt !== input.expected.preflight.attempt) return { status: 'blocked', reason: 'execution-revision-mismatch' };
  if (approval.human_id !== input.identity.human_id || approval.public_key_fingerprint !== input.identity.public_key_fingerprint || approval.signature.public_key_fingerprint !== input.identity.public_key_fingerprint) return { status: 'blocked', reason: 'human-identity-mismatch' };
  if (!DIGEST.test(approval.preflight_digest) || !Number.isFinite(Date.parse(approval.expires_at)) || Date.parse(input.now) >= Date.parse(approval.expires_at)) return { status: 'blocked', reason: 'approval-expired' };
  if (!verifyHumanSignature({ identity: input.identity, payload: payload({ ...approval, signature: undefined } as Omit<LocalExecutionApproval, 'signature'>), signature: approval.signature })) return { status: 'blocked', reason: 'approval-signature-invalid' };
  return { status: 'accepted' };
}
