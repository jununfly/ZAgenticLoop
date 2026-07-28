import { createHash } from "node:crypto";
import type {
  AgentClaim,
  AgentExecution,
  AgentEvidence,
  AgentHandoff,
} from "./agent-local.js";

export const AGENT_CONTEXT_SNAPSHOT_SCHEMA = "zj-loop.agent_context_snapshot.v1";
export const ACTIVATION_SNAPSHOT_REF_SCHEMA = "zj-loop.activation_snapshot_ref.v1";

export type ContextValidationError = {
  code: string;
  path: string;
  message: string;
};

export type ActivationSnapshotRef = {
  schema: typeof ACTIVATION_SNAPSHOT_REF_SCHEMA;
  activation_id: string;
  project_path: string;
  commit: string;
  path: string;
  sha256: string;
};

export type ActivationSnapshotRefWriteResult = {
  schema: "zj-loop.agent_local_activation_ref.v1";
  status: "recorded" | "duplicate" | "blocked";
  activation: ActivationSnapshotRef | null;
  commit_id: string | null;
  side_effects_executed: boolean;
  reason?: string;
};

export type AgentContextSnapshot = {
  schema: typeof AGENT_CONTEXT_SNAPSHOT_SCHEMA;
  status: "completed" | "blocked";
  state: { branch: "zj-loop-state"; head_sha: string | null };
  handoff: Record<string, unknown> | null;
  claim: Record<string, unknown> | null;
  history: { executions: AgentExecution[]; evidence: AgentEvidence[] };
  current: {
    lifecycle_status: AgentExecution["status"] | "claimed" | "pending" | null;
    execution: AgentExecution | null;
    evidence: AgentEvidence[];
  };
  activation: { ref: ActivationSnapshotRef | null };
  validation: {
    state_head_stable: boolean;
    errors: ContextValidationError[];
  };
  side_effects_executed: false;
  reason?: string;
};

export type ContextRecords = {
  handoff: AgentHandoff | null;
  claim: AgentClaim | null;
  activation: ActivationSnapshotRef | null;
  executions: AgentExecution[];
  evidence: AgentEvidence[];
};

export type ProjectReadClient = {
  readText?(path: string, ref: string): Promise<string | null>;
  readJson(path: string, ref: string): Promise<unknown | null>;
};

export async function persistActivationSnapshotRef(input: {
  state: {
    getHead(): Promise<string>;
    readJson(path: string, ref?: string): Promise<unknown | null>;
    commit(input: {
      branch: "zj-loop-state";
      message: string;
      last_commit_id: string;
      actions: Array<{ action: "create"; file_path: string; content: string }>;
    }): Promise<{ id: string }>;
  };
  activationId: string;
  projectPath: string;
  commit: string;
  path: string;
  sha256: string;
}): Promise<ActivationSnapshotRefWriteResult> {
  const checked = validateActivationSnapshotRef({
    schema: ACTIVATION_SNAPSHOT_REF_SCHEMA,
    activation_id: input.activationId,
    project_path: input.projectPath,
    commit: input.commit,
    path: input.path,
    sha256: input.sha256,
  });
  if (checked.error || !checked.value) return blockedActivationRef(checked.error ?? "activation-ref-invalid");
  const activation = checked.value;
  const filePath = `activations/${activation.activation_id}.json`;
  try {
    const existing = await input.state.readJson(filePath);
    if (existing !== null) {
      if (!isActivationRef(existing)) return blockedActivationRef("activation-ref-invalid");
      if (sameActivationRef(existing, activation)) return { schema: "zj-loop.agent_local_activation_ref.v1", status: "duplicate", activation: existing, commit_id: null, side_effects_executed: false };
      return blockedActivationRef("activation-ref-conflict", existing);
    }
    const head = await input.state.getHead();
    const result = await input.state.commit({
      branch: "zj-loop-state",
      message: `Record activation snapshot ref ${activation.activation_id} [skip ci]`,
      last_commit_id: head,
      actions: [{ action: "create", file_path: filePath, content: `${JSON.stringify(activation, null, 2)}\n` }],
    });
    return { schema: "zj-loop.agent_local_activation_ref.v1", status: "recorded", activation, commit_id: result.id, side_effects_executed: true };
  } catch (error) {
    return blockedActivationRef(error instanceof Error && error.message === "gitlab-state-409" ? "state-head-conflict" : "state-write-failed");
  }
}

function validateActivationSnapshotRef(value: ActivationSnapshotRef): { value?: ActivationSnapshotRef; error?: string } {
  if (!/^[a-zA-Z0-9_-]+$/.test(value.activation_id)) return { error: "activation-id-invalid" };
  if (!/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+$/.test(value.project_path)) return { error: "project-path-invalid" };
  if (!/^[0-9a-f]{40}$/i.test(value.commit)) return { error: "activation-commit-invalid" };
  if (!/^[a-zA-Z0-9_./-]+$/.test(value.path) || value.path.startsWith("/") || value.path.includes("..")) return { error: "activation-path-invalid" };
  if (!/^[0-9a-f]{64}$/i.test(value.sha256)) return { error: "activation-sha256-invalid" };
  return { value };
}

function sameActivationRef(left: ActivationSnapshotRef, right: ActivationSnapshotRef): boolean {
  return left.schema === right.schema && left.activation_id === right.activation_id && left.project_path === right.project_path && left.commit === right.commit && left.path === right.path && left.sha256 === right.sha256;
}

function blockedActivationRef(reason: string, activation: ActivationSnapshotRef | null = null): ActivationSnapshotRefWriteResult {
  return { schema: "zj-loop.agent_local_activation_ref.v1", status: "blocked", activation, commit_id: null, side_effects_executed: false, reason };
}

export async function loadAgentContext(input: {
  state: {
    getHead(): Promise<string>;
    readJson(path: string, ref?: string): Promise<unknown | null>;
    list(path: string, ref?: string): Promise<string[]>;
  };
  project: ProjectReadClient;
  handoffId: string;
}): Promise<AgentContextSnapshot> {
  let stateHead = "";
  try {
    stateHead = await input.state.getHead();
    const handoffValue = await input.state.readJson(`handoffs/${safeId(input.handoffId)}.json`, stateHead);
    const handoff = isHandoff(handoffValue) ? handoffValue : null;
    const claimPaths = await input.state.list(`claims/${safeId(input.handoffId)}`, stateHead);
    const claims = await readRecords(input.state, claimPaths.filter((item) => item.endsWith(".json")), stateHead);
    const claim = claims.length === 1 && isClaim(claims[0]) ? claims[0] : null;
    const activationId = handoff?.request_id ?? "";
    const activationValue = activationId ? await input.state.readJson(`activations/${safeId(activationId)}.json`, stateHead) : null;
    const activation = isActivationRef(activationValue) ? activationValue : null;
    const executionPaths = handoff ? await input.state.list(`executions/${safeId(handoff.handoff_id)}`, stateHead) : [];
    const evidencePaths = handoff ? await input.state.list(`evidence/${safeId(handoff.handoff_id)}`, stateHead) : [];
    const executions = (await readRecords(input.state, executionPaths.filter((item) => item.endsWith(".json")), stateHead)).filter(isExecution);
    const evidence = (await readRecords(input.state, evidencePaths.filter((item) => item.endsWith(".json")), stateHead)).filter(isEvidence);
    const records: ContextRecords = { handoff, claim, activation, executions, evidence };
    const projectErrors = await validateImmutableProjectRefs(input.project, records);
    const finalStateHead = await input.state.getHead();
    const snapshot = reconstructAgentContext({ stateHead, finalStateHead, records });
    if (projectErrors.length === 0) return snapshot;
    return { ...snapshot, status: "blocked", reason: projectErrors[0].code, validation: { ...snapshot.validation, errors: [...projectErrors, ...snapshot.validation.errors] } };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "state-read-failed";
    const code = message === "state-record-limit-exceeded" ? message : "state-read-failed";
    return blockedSnapshot(stateHead, { handoff: null, claim: null, activation: null, executions: [], evidence: [] }, [error(code, "state", "context reconstruction could not read a stable state snapshot")]);
  }
}

async function readRecords(client: { readJson(path: string, ref?: string): Promise<unknown | null> }, paths: string[], ref: string): Promise<unknown[]> {
  if (paths.length > 1000) throw new Error("state-record-limit-exceeded");
  return Promise.all(paths.map((path) => client.readJson(path, ref))).then((values) => values.filter((value): value is unknown => value !== null));
}

async function validateImmutableProjectRefs(project: ProjectReadClient, records: ContextRecords): Promise<ContextValidationError[]> {
  const errors: ContextValidationError[] = [];
  if (records.handoff) {
    const registration = await readProjectText(project, records.handoff.registration.path, records.handoff.registration.commit);
    if (registration === null) errors.push(error("registration-missing", "handoff.registration", "registration file is missing at its pinned commit"));
    else if (digestText(registration) !== records.handoff.registration.sha256) errors.push(error("registration-sha256-mismatch", "handoff.registration.sha256", "registration digest does not match the handoff"));
  }
  if (records.activation) {
    const activation = await readProjectText(project, records.activation.path, records.activation.commit);
    if (activation === null) errors.push(error("activation-missing", "activation.ref", "activation contract is missing at its pinned commit"));
    else if (digestText(activation) !== records.activation.sha256) errors.push(error("activation-sha256-mismatch", "activation.ref.sha256", "activation contract digest does not match the activation ref"));
  }
  return errors;
}

async function readProjectText(project: ProjectReadClient, path: string, ref: string): Promise<string | null> {
  if (project.readText) return project.readText(path, ref);
  const value = await project.readJson(path, ref);
  return value === null ? null : `${JSON.stringify(value, null, 2)}\n`;
}

function digestText(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function projectExecution(value: AgentExecution): AgentExecution {
  return { ...value, branch: null, worktree_path: null };
}

function safeId(value: string): string { if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("agent-id-invalid"); return value; }
function isHandoff(value: unknown): value is AgentHandoff { return Boolean(value && typeof value === "object" && (value as AgentHandoff).schema === "zj-loop.agent_handoff.v1"); }
function isClaim(value: unknown): value is AgentClaim { return Boolean(value && typeof value === "object" && (value as AgentClaim).schema === "zj-loop.agent_claim.v1"); }
function isActivationRef(value: unknown): value is ActivationSnapshotRef { return Boolean(value && typeof value === "object" && (value as ActivationSnapshotRef).schema === ACTIVATION_SNAPSHOT_REF_SCHEMA); }
function isExecution(value: unknown): value is AgentExecution { return Boolean(value && typeof value === "object" && (value as AgentExecution).schema === "zj-loop.agent_execution.v1"); }
function isEvidence(value: unknown): value is AgentEvidence { return Boolean(value && typeof value === "object" && (value as AgentEvidence).schema === "zj-loop.agent_evidence.v1"); }

export function reconstructAgentContext(input: {
  stateHead: string;
  finalStateHead: string;
  records: ContextRecords;
}): AgentContextSnapshot {
  const errors = validateRecords(input.records);
  if (input.stateHead !== input.finalStateHead) {
    errors.unshift({
      code: "state-head-changed",
      path: "state.head_sha",
      message: "state branch changed during reconstruction",
    });
  }
  if (errors.length > 0) {
    return blockedSnapshot(input.stateHead, input.records, errors);
  }

  const executions = [...input.records.executions].sort(compareRecordedAt);
  const latest = executions.at(-1) ?? null;
  const currentEvidence = latest
    ? input.records.evidence.filter(
        (item) => item.execution_id === latest.execution_id,
      )
    : [];
  const currentStatus = latest?.status ?? (input.records.claim ? "claimed" : "pending");
  return {
    schema: AGENT_CONTEXT_SNAPSHOT_SCHEMA,
    status: "completed",
    state: { branch: "zj-loop-state", head_sha: input.stateHead },
    handoff: projectHandoff(input.records.handoff),
    claim: projectClaim(input.records.claim),
    history: { executions: executions.map(projectExecution), evidence: [...input.records.evidence].sort(compareRecordedAt) },
    current: { lifecycle_status: currentStatus, execution: latest ? projectExecution(latest) : null, evidence: currentEvidence },
    activation: { ref: input.records.activation },
    validation: { state_head_stable: true, errors: [] },
    side_effects_executed: false,
  };
}

function blockedSnapshot(
  stateHead: string,
  records: ContextRecords,
  errors: ContextValidationError[],
): AgentContextSnapshot {
  return {
    schema: AGENT_CONTEXT_SNAPSHOT_SCHEMA,
    status: "blocked",
    state: { branch: "zj-loop-state", head_sha: stateHead },
    handoff: projectHandoff(records.handoff),
    claim: projectClaim(records.claim),
    history: { executions: [], evidence: [] },
    current: { lifecycle_status: null, execution: null, evidence: [] },
    activation: { ref: records.activation },
    validation: { state_head_stable: !errors.some((item) => item.code === "state-head-changed"), errors },
    side_effects_executed: false,
    reason: errors[0]?.code ?? "context-invalid",
  };
}

function validateRecords(records: ContextRecords): ContextValidationError[] {
  const errors: ContextValidationError[] = [];
  if (!records.handoff) errors.push(error("handoff-missing", "handoff", "handoff record is missing"));
  if (!records.claim) errors.push(error("claim-missing", "claim", "claim record is missing"));
  if (!records.activation) errors.push(error("activation-ref-missing", "activation.ref", "activation snapshot ref is missing"));
  if (records.handoff && records.claim && records.claim.handoff_id !== records.handoff.handoff_id) {
    errors.push(error("claim-binding-mismatch", "claim.handoff_id", "claim is bound to another handoff"));
  }
  if (records.handoff && records.activation && records.activation.project_path !== records.handoff.source.project_path) {
    errors.push(error("activation-project-mismatch", "activation.ref.project_path", "activation belongs to another project"));
  }
  const executionIds = new Set<string>();
  for (const [index, execution] of records.executions.entries()) {
    if (execution.handoff_id !== records.handoff?.handoff_id) errors.push(error("execution-handoff-mismatch", `history.executions[${index}].handoff_id`, "execution is bound to another handoff"));
    if (execution.claim_id !== records.claim?.claim_id) errors.push(error("execution-claim-mismatch", `history.executions[${index}].claim_id`, "execution is bound to another claim"));
    if (executionIds.has(execution.execution_id)) errors.push(error("execution-duplicate", `history.executions[${index}].execution_id`, "execution id is duplicated"));
    executionIds.add(execution.execution_id);
  }
  for (const [index, evidence] of records.evidence.entries()) {
    if (!executionIds.has(evidence.execution_id)) errors.push(error("evidence-execution-mismatch", `history.evidence[${index}].execution_id`, "evidence references an unknown execution"));
    if (evidence.handoff_id !== records.handoff?.handoff_id || evidence.claim_id !== records.claim?.claim_id) errors.push(error("evidence-binding-mismatch", `history.evidence[${index}]`, "evidence is not claim-bound to this handoff"));
    if (evidence.sha256 !== null && !/^[0-9a-f]{64}$/i.test(evidence.sha256)) errors.push(error("evidence-sha256-invalid", `history.evidence[${index}].sha256`, "evidence sha256 must be 64 hexadecimal characters"));
  }
  if (records.executions.length > 0) {
    const latestTime = Math.max(...records.executions.map((item) => Date.parse(item.recorded_at)));
    if (records.executions.filter((item) => Date.parse(item.recorded_at) === latestTime).length > 1) errors.push(error("current-execution-ambiguous", "history.executions", "multiple executions share the latest recorded_at"));
  }
  return errors;
}

function compareRecordedAt(a: { recorded_at: string; execution_id?: string; evidence_id?: string }, b: { recorded_at: string; execution_id?: string; evidence_id?: string }): number {
  return Date.parse(a.recorded_at) - Date.parse(b.recorded_at);
}

function error(code: string, path: string, message: string): ContextValidationError { return { code, path, message }; }

function projectHandoff(value: AgentHandoff | null): Record<string, unknown> | null {
  if (!value) return null;
  return { schema: value.schema, handoff_id: value.handoff_id, request_id: value.request_id, status: value.status, created_at: value.created_at, source: { provider: value.source.provider, project_path: value.source.project_path, issue_iid: value.source.issue_iid, note_id: value.source.note_id, event_id: value.source.event_id, dedupe_key: value.source.dedupe_key }, route: value.route, executor: value.executor, registration: value.registration, workspace: { project_path: value.workspace.project_path, base_ref: value.workspace.base_ref, base_commit: value.workspace.base_commit } };
}

function projectClaim(value: AgentClaim | null): Record<string, unknown> | null {
  if (!value) return null;
  return { schema: value.schema, claim_id: value.claim_id, handoff_id: value.handoff_id, human_id: value.human_id, agent_session_id: value.agent_session_id, claimed_at: value.claimed_at, status: value.status };
}
