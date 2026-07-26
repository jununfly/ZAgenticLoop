import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentHandoff } from "./agent-local.js";

export const AGENT_EXECUTION_CONTEXT_SCHEMA = "zj-loop.agent_execution_context.v1";
export type AgentExecutionContextStatus = "execution-ready" | "blocked-missing-roadmap" | "blocked-incomplete-contract" | "request-human-claim";

export type AgentExecutionContext = {
  schema: typeof AGENT_EXECUTION_CONTEXT_SCHEMA;
  status: AgentExecutionContextStatus;
  side_effects_executed: false;
  handoff: { id: string; status: AgentHandoff["status"]; claim_id: string | null; human_id: number | null; agent_session_id: string | null };
  activation: { id: string; contract_path: string; contract_sha256: string | null };
  state: { branch: "zj-loop-state"; head_sha: string | null };
  executor: { kind: string | null; profile: string | null; allowed_side_effects: string[] };
  workspace: { repo_root: string; base_ref: string | null; base_commit: string | null; branch: string | null; roadmap_path: string; roadmap_exists: boolean };
  merge_request: { target_branch: string | null; draft_required: boolean; create_allowed: boolean };
  required_gates: string[];
  next_steps: string[];
  reason?: string;
};

export async function buildAgentExecutionContext(input: { handoff: AgentHandoff | null; repoRoot: string; activationId: string; activationContractPath?: string; roadmapPath?: string; stateHead?: string | null }): Promise<AgentExecutionContext> {
  const contractPath = input.activationContractPath ?? `zj-loop/orchestrations/${safeActivationId(input.activationId)}/roadmap-activation.json`;
  const roadmapPath = input.roadmapPath ?? "docs/plans/roadmap.json";
  const repoRoot = path.resolve(input.repoRoot);
  const handoff = input.handoff;
  const base = (status: AgentExecutionContextStatus, extra: Partial<AgentExecutionContext> = {}): AgentExecutionContext => ({
    schema: AGENT_EXECUTION_CONTEXT_SCHEMA, status, side_effects_executed: false,
    handoff: { id: handoff?.handoff_id ?? "", status: handoff?.status ?? "pending", claim_id: handoff?.claim?.claim_id ?? null, human_id: handoff?.claim?.human_id ?? null, agent_session_id: handoff?.claim?.agent_session_id ?? null },
    activation: { id: input.activationId, contract_path: contractPath, contract_sha256: null },
    state: { branch: "zj-loop-state", head_sha: input.stateHead ?? null },
    executor: { kind: handoff?.executor?.kind ?? null, profile: handoff?.executor?.profile ?? null, allowed_side_effects: handoff?.executor?.capabilities ?? [] },
    workspace: { repo_root: repoRoot, base_ref: handoff?.workspace?.base_ref ?? null, base_commit: handoff?.workspace?.base_commit ?? null, branch: null, roadmap_path: roadmapPath, roadmap_exists: false },
    merge_request: { target_branch: null, draft_required: true, create_allowed: false },
    required_gates: ["git diff --check", "project verification commands", "human review before merge"], next_steps: [], ...extra,
  });
  if (!handoff || !handoff.claim || handoff.status !== "claimed") return base("request-human-claim", { reason: "handoff-claim-required", next_steps: ["Claim the handoff before preparing or modifying a worktree."] });
  let contract: any;
  let contractText = "";
  const contractAbsolute = path.resolve(repoRoot, contractPath);
  if (!isWithin(repoRoot, contractAbsolute)) return base("blocked-incomplete-contract", { reason: "activation-contract-path-escapes-repo", next_steps: ["Use a repository-relative activation contract path."] });
  try { contractText = await readFile(contractAbsolute, "utf8"); contract = JSON.parse(contractText); } catch { return base("blocked-incomplete-contract", { reason: "activation-contract-required", next_steps: [`Create or restore ${contractPath} before execution.`] }); }
  const selectedRoadmapPath = input.roadmapPath ?? stringValue(contract.roadmap_file ?? contract.roadmapFile) ?? roadmapPath;
  const roadmapAbsolute = path.resolve(repoRoot, selectedRoadmapPath);
  if (!isWithin(repoRoot, roadmapAbsolute)) return base("blocked-incomplete-contract", { reason: "roadmap-path-escapes-repo", next_steps: ["Use a repository-relative roadmap path."] });
  let roadmapExists = false;
  try { await readFile(roadmapAbsolute, "utf8"); roadmapExists = true; } catch { /* reported below */ }
  const branch = stringValue(contract.branch_name ?? contract.branchName);
  const targetBranch = stringValue(contract.target_branch ?? contract.targetBranch);
  const context = base("blocked-incomplete-contract", {
    activation: { id: input.activationId, contract_path: contractPath, contract_sha256: createHash("sha256").update(contractText).digest("hex") },
    workspace: { repo_root: repoRoot, base_ref: handoff.workspace.base_ref, base_commit: handoff.workspace.base_commit, branch, roadmap_path: selectedRoadmapPath, roadmap_exists: roadmapExists },
    merge_request: { target_branch: targetBranch, draft_required: contract.draft !== false, create_allowed: false },
  });
  if (!roadmapExists) return { ...context, status: "blocked-missing-roadmap", reason: "roadmap-file-required", next_steps: [`Create or restore the roadmap at ${selectedRoadmapPath}.`, "Do not infer roadmap intent from chat history."] };
  const missing = [handoff.executor.kind === "agent-local" ? null : "agent-local executor", handoff.executor.profile ? null : "executor profile", handoff.executor.capabilities.length > 0 ? null : "allowed executor capabilities", handoff.workspace.base_commit ? null : "workspace base commit", branch ? null : "activation branch", targetBranch ? null : "merge-request target branch"].filter(Boolean) as string[];
  if (missing.length > 0) return { ...context, reason: `missing-context-fields:${missing.join(",")}`, next_steps: ["Complete the activation execution contract before editing."] };
  return { ...context, status: "execution-ready", executor: { ...context.executor, allowed_side_effects: [...handoff.executor.capabilities] }, merge_request: { ...context.merge_request, create_allowed: handoff.executor.capabilities.includes("create-draft-mr") }, next_steps: ["Work only inside the prepared worktree.", "Tell the human before pushing a branch or creating a Draft MR."] };
}

function safeActivationId(value: string): string { if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("activation-id-invalid"); return value; }
function stringValue(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function isWithin(root: string, candidate: string): boolean { return candidate === root || candidate.startsWith(`${root}${path.sep}`); }
