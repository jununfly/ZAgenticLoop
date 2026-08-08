import type { OpnArtifactMetadata, OpnArtifactStore } from './opn-artifact-store.js';
import { createTransportEnvelope, type TransportAdapter } from './transport-contract.js';
import { validateOpnReadOnlyGraphVerificationResult, type OpnReadOnlyGraphVerificationResult } from './opn-readonly-graph-verification.js';
import { createRealAgentDogfoodGraphPhaseRecord, type RealAgentDogfoodGraphPhaseRecord } from './real-agent-dogfood-graph-state.js';
import type { RealAgentDogfoodGraphPlan } from './real-agent-dogfood-graph-orchestrator.js';
import type { ContentAddressedEvidenceStore } from './content-addressed-evidence-store.js';

const DIGEST = /^sha256:[0-9a-f]{64}$/;

export type RealAgentDogfoodGraphOpnIndependentVerificationAdapterResult = {
  status: 'passed' | 'blocked' | 'outcome-uncertain';
  reason?: string;
  evidence_digest?: string;
  record?: RealAgentDogfoodGraphPhaseRecord;
};

type OpnIndependentVerificationTransport = Pick<TransportAdapter, 'openSession' | 'send' | 'receive' | 'acknowledge' | 'closeSession'>;

function validDigest(value: unknown): value is string { return typeof value === 'string' && DIGEST.test(value); }

export function createRealAgentDogfoodGraphOpnIndependentVerificationAdapter(input: {
  plan: RealAgentDogfoodGraphPlan;
  network_id: string;
  coordinator_id: string;
  verifier_id: string;
  transport: OpnIndependentVerificationTransport;
  artifact_store: OpnArtifactStore;
  evidence_store: Pick<ContentAddressedEvidenceStore, 'put'>;
  source_phase: RealAgentDogfoodGraphPhaseRecord;
  scope_phase: RealAgentDogfoodGraphPhaseRecord;
  source_evidence: () => Promise<Buffer>;
  publish_artifact?: (input: { bytes: Buffer; metadata: OpnArtifactMetadata; transfer_id: string; target_node_id: string }) => Promise<void>;
  download_artifact?: (artifact_id: string) => Promise<Buffer>;
  poll_attempts?: number;
  poll_delay_ms?: number;
  now?: () => string;
}): () => Promise<RealAgentDogfoodGraphOpnIndependentVerificationAdapterResult> {
  return async () => {
    if (input.source_phase.phase !== 'source_execution' || input.source_phase.status !== 'passed' || input.scope_phase.phase !== 'scope_observation' || input.scope_phase.status !== 'passed') return { status: 'outcome-uncertain', reason: 'opn-independent-verification-prerequisite-not-passed' };
    if (input.source_phase.plan_digest !== input.plan.plan_digest || input.scope_phase.plan_digest !== input.plan.plan_digest || input.source_phase.execution_id !== input.plan.execution_id || input.scope_phase.execution_id !== input.plan.execution_id || input.source_phase.network_id !== input.network_id || input.scope_phase.network_id !== input.network_id) return { status: 'outcome-uncertain', reason: 'opn-independent-verification-prerequisite-binding-invalid' };
    if (input.scope_phase.actor_kind !== 'coordinator' || !input.scope_phase.actor_identity || !input.verifier_id.trim() || !input.coordinator_id.trim()) return { status: 'outcome-uncertain', reason: 'opn-independent-verification-identity-binding-invalid' };

    const messageId = `${input.plan.execution_id}:graph-verification-request`;
    let sourceArtifact;
    try {
      const bytes = await input.source_evidence();
      sourceArtifact = await input.artifact_store.put({ bytes, file_name: `${input.plan.execution_id}-source.json`, media_type: 'application/json' });
      if (!validDigest(sourceArtifact.metadata.artifact_id)) throw new Error('source-artifact-digest-invalid');
      if (input.publish_artifact) await input.publish_artifact({ bytes, metadata: sourceArtifact.metadata, transfer_id: `graph-verification-request:${messageId}`, target_node_id: input.verifier_id });
    } catch { return { status: 'outcome-uncertain', reason: 'opn-independent-verification-source-artifact-unavailable' }; }

    const now = input.now ?? (() => new Date().toISOString());
    const planId = input.plan.dogfood_id;
    const envelope = createTransportEnvelope({ message_id: messageId, network_id: input.network_id, event_id: `${input.plan.dogfood_id}:verification`, plan_id: planId, plan_revision: input.plan.attempt, task_id: input.plan.execution_id, from_node_id: input.coordinator_id, target_node_id: input.verifier_id, notification_kind: 'graph.verification.request', state: 'available', artifact_refs: [{ artifact_id: sourceArtifact.metadata.artifact_id, content_sha256: sourceArtifact.metadata.content_sha256, kind: 'artifact' }], created_at: now(), expires_at: new Date(Date.parse(now()) + 50 * 60 * 1000).toISOString() });

    let session: { session_id: string };
    try { session = await input.transport.openSession({ network_id: input.network_id, node_id: input.coordinator_id }); } catch { return { status: 'outcome-uncertain', reason: 'opn-independent-verification-session-unavailable' }; }
    try {
      const sent = await input.transport.send({ session_id: session.session_id, envelope });
      if (sent.status === 'blocked') return { status: 'blocked', reason: 'opn-independent-verification-request-blocked' };
      const attempts = input.poll_attempts ?? 30;
      const delay = input.poll_delay_ms ?? 250;
      let response = null;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        response = await input.transport.receive({ session_id: session.session_id });
        if (response) break;
        if (attempt + 1 < attempts && delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      }
      if (!response) return { status: 'outcome-uncertain', reason: 'opn-independent-verification-result-unavailable' };
      if (response.target_node_id !== input.coordinator_id || response.from_node_id !== input.verifier_id || response.notification_kind !== 'graph.verification.result' || response.network_id !== input.network_id || response.plan_id !== planId || response.plan_revision !== input.plan.attempt || response.task_id !== input.plan.execution_id || response.artifact_refs.length < 1) return { status: 'blocked', reason: 'opn-independent-verification-result-scope-mismatch' };

      let result: OpnReadOnlyGraphVerificationResult;
      let resultArtifact;
      try {
        const resultRef = response.artifact_refs[0].artifact_id;
        const bytes = input.download_artifact ? await input.download_artifact(resultRef) : (await input.artifact_store.read(resultRef)).bytes;
        const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
        const validation = validateOpnReadOnlyGraphVerificationResult(parsed);
        if (validation.status === 'blocked') return { status: 'blocked', reason: `opn-independent-verification-result-${validation.reason}` };
        result = parsed as OpnReadOnlyGraphVerificationResult;
        if (result.graph_id !== input.plan.dogfood_id || result.network_id !== input.network_id || result.plan_id !== planId || result.plan_revision !== input.plan.attempt || result.task_id !== input.plan.execution_id || result.plan_digest !== input.plan.plan_digest || result.source_evidence_ref !== sourceArtifact.metadata.artifact_id || result.verifier_node_id !== input.verifier_id) return { status: 'blocked', reason: 'opn-independent-verification-result-scope-mismatch' };
        resultArtifact = resultRef;
      } catch { return { status: 'outcome-uncertain', reason: 'opn-independent-verification-result-unavailable' }; }

      const evidencePayload = { schema: 'zj-loop.real-agent-dogfood_graph_opn_independent_verification_evidence.v1', network_id: input.network_id, dogfood_id: input.plan.dogfood_id, execution_id: input.plan.execution_id, verifier_id: input.verifier_id, request_message_id: messageId, request_envelope_digest: envelope.envelope_digest, result_artifact_id: resultArtifact, result, side_effects_executed: false };
      let evidence;
      try { evidence = await input.evidence_store.put({ content: JSON.stringify(evidencePayload), kind: 'real-agent-dogfood-graph-opn-independent-verification' }); } catch { return { status: 'outcome-uncertain', reason: 'opn-independent-verification-evidence-write-failed' }; }
      const status = result.status;
      const reason = status === 'passed' ? 'independent-verification-passed' : status === 'blocked' ? 'opn-independent-verification-blocked' : 'opn-independent-verification-outcome-uncertain';
      const record = createRealAgentDogfoodGraphPhaseRecord({ plan: input.plan, network_id: input.network_id, phase: 'independent_verification', status, completed_phases: status === 'passed' ? ['source_execution', 'scope_observation', 'independent_verification'] : ['source_execution', 'scope_observation'], reason, actor_kind: 'trusted-runner', actor_identity: input.verifier_id, evidence_digest: evidence.digest, evidence_refs: [evidence.digest, resultArtifact], execution_binding_digest: input.source_phase.execution_binding_digest, worker_lease_digest: input.source_phase.worker_lease_digest });
      await input.transport.acknowledge({ session_id: session.session_id, message_id: response.message_id, envelope_digest: response.envelope_digest });
      return { status, reason, evidence_digest: evidence.digest, record };
    } catch (error) { return { status: 'outcome-uncertain', reason: error instanceof Error ? `opn-independent-verification-${error.message}` : 'opn-independent-verification-outcome-uncertain' }; }
    finally { await input.transport.closeSession({ session_id: session.session_id }).catch(() => {}); }
  };
}
