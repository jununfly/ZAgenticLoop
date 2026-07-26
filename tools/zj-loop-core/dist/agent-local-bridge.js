import { createHash } from "node:crypto";
import yaml from "yaml";
import { AGENT_HANDOFF_SCHEMA, buildHandoffId, } from "./agent-local.js";
export const AGENT_EXECUTION_REQUEST_SCHEMA = "zj-loop.agent_execution_request.v1";
export function parseAgentExecutionRequest(note, marker) {
    if (!note.includes(marker))
        return null;
    const match = note.match(/<!--\s*zj-loop\.agent_execution_request\.v1\s*([\s\S]*?)-->/);
    if (!match)
        return null;
    let value;
    try {
        value = JSON.parse(match[1].trim());
    }
    catch {
        throw new Error("agent-execution-request-json-invalid");
    }
    const item = value;
    const registration = item?.registration;
    if (item?.schema !== AGENT_EXECUTION_REQUEST_SCHEMA || !registration ||
        !/^[0-9a-f]{40}$/i.test(registration.ref) ||
        !/^[a-zA-Z0-9_./-]+$/.test(registration.path) || registration.path.includes("..") ||
        !/^[0-9a-f]{64}$/i.test(registration.sha256)) {
        throw new Error("agent-execution-request-invalid");
    }
    if (item.request_id !== undefined && (typeof item.request_id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(item.request_id))) {
        throw new Error("agent-execution-request-id-invalid");
    }
    return { schema: AGENT_EXECUTION_REQUEST_SCHEMA, request_id: item.request_id, registration: { ref: registration.ref, path: registration.path, sha256: registration.sha256 } };
}
export function buildAgentLocalHandoff(input) {
    if (input.request.registration.ref !== input.registrationCommit)
        throw new Error("registration-commit-mismatch");
    const digest = createHash("sha256").update(input.registrationText).digest("hex");
    if (digest !== input.request.registration.sha256)
        throw new Error("registration-sha256-mismatch");
    const registration = yaml.parse(input.registrationText);
    const route = registration?.routes?.find((candidate) => candidate.route_id === input.envelope.target_route);
    if (registration?.schema !== "zj-loop.project-registration.v1" || registration.project_path !== input.envelope.project_path || registration.default_branch !== "master" || !route || typeof route.marker !== "string" || route.marker !== `/zj-loop start ${input.envelope.target_route}`)
        throw new Error("registration-invalid");
    const executor = route.allowed_executors?.find((candidate) => candidate.kind === "agent-local" && candidate.profile === "human-codex-mac");
    if (!executor || !Array.isArray(executor.capabilities) || executor.capabilities.length === 0)
        throw new Error("agent-local-executor-not-allowlisted");
    const handoffId = buildHandoffId({ projectPath: input.envelope.project_path, eventId: input.envelope.event_id, dedupeKey: input.envelope.dedupe_key });
    return {
        schema: AGENT_HANDOFF_SCHEMA,
        handoff_id: handoffId,
        request_id: input.request.request_id ?? handoffId,
        status: "pending",
        created_at: input.now,
        source: { provider: "gitlab", project_path: input.envelope.project_path, issue_iid: input.envelope.issue_iid, note_id: input.envelope.note_id, event_id: input.envelope.event_id, dedupe_key: input.envelope.dedupe_key, source_url: input.envelope.source_url },
        route: { route_id: input.envelope.target_route },
        executor: { kind: "agent-local", profile: "human-codex-mac", capabilities: executor.capabilities.map(String) },
        registration: { commit: input.registrationCommit, path: input.request.registration.path, sha256: digest },
        workspace: { project_path: input.envelope.project_path, base_ref: "master", base_commit: input.workspaceBaseCommit },
        claim: null,
        side_effects_executed: false,
    };
}
export async function persistAgentLocalHandoff(input) {
    const path = `handoffs/${input.handoff.handoff_id}.json`;
    const existing = await input.client.readJson(path);
    if (existing)
        return { status: "duplicate", handoff: existing, state_commit_id: null, side_effects_executed: false };
    try {
        const head = await input.client.getHead();
        const commit = await input.client.commit({ branch: "zj-loop-state", message: `Create agent handoff ${input.handoff.handoff_id} [skip ci]`, last_commit_id: head, actions: [{ action: "create", file_path: path, content: `${JSON.stringify(input.handoff, null, 2)}\n` }] });
        return { status: "created", handoff: input.handoff, state_commit_id: commit.id, side_effects_executed: true };
    }
    catch (error) {
        return { status: "blocked", handoff: null, state_commit_id: null, side_effects_executed: false, reason: error instanceof Error ? error.message : "state-write-failed" };
    }
}
