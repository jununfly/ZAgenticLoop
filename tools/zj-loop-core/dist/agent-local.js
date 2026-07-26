import { createHash, randomUUID } from "node:crypto";
export const AGENT_HANDOFF_SCHEMA = "zj-loop.agent_handoff.v1";
export const AGENT_CLAIM_SCHEMA = "zj-loop.agent_claim.v1";
export const AGENT_STATE_BRANCH = "zj-loop-state";
export const AGENT_EXECUTION_SCHEMA = "zj-loop.agent_execution.v1";
export const AGENT_EVIDENCE_SCHEMA = "zj-loop.agent_evidence.v1";
export async function recordAgentLocalExecution(input) {
    const record = {
        schema: AGENT_EXECUTION_SCHEMA,
        execution_id: safeId(input.executionId ?? `exe_${randomUUID().replaceAll("-", "")}`),
        handoff_id: safeId(input.handoffId),
        claim_id: safeId(input.claimId),
        status: input.status,
        recorded_at: input.now ?? new Date().toISOString(),
        branch: input.branch ?? null,
        worktree_path: input.worktreePath ?? null,
        reason: input.reason ?? null,
        side_effects_executed: false,
    };
    return appendClaimBoundRecord({
        client: input.client,
        handoffId: input.handoffId,
        claimId: input.claimId,
        path: `executions/${record.handoff_id}/${record.execution_id}/${record.recorded_at.replace(/[^0-9A-Za-z]/g, "")}-${record.status}.json`,
        record,
        schema: "zj-loop.agent_local_execution.v1",
    });
}
export async function recordAgentLocalEvidence(input) {
    const record = {
        schema: AGENT_EVIDENCE_SCHEMA,
        evidence_id: safeId(`evd_${randomUUID().replaceAll("-", "")}`),
        handoff_id: safeId(input.handoffId),
        execution_id: safeId(input.executionId),
        claim_id: safeId(input.claimId),
        kind: input.kind,
        status: input.status,
        path: input.path ?? null,
        sha256: input.sha256 ?? null,
        recorded_at: input.now ?? new Date().toISOString(),
        side_effects_executed: false,
    };
    return appendClaimBoundRecord({
        client: input.client,
        handoffId: input.handoffId,
        claimId: input.claimId,
        path: `evidence/${record.handoff_id}/${record.execution_id}/${record.evidence_id}.json`,
        record,
        schema: "zj-loop.agent_local_evidence.v1",
    });
}
async function appendClaimBoundRecord(input) {
    try {
        const handoff = await input.client.readJson(`handoffs/${safeId(input.handoffId)}.json`);
        if (!isAgentHandoff(handoff))
            return { schema: input.schema, status: "blocked", record: null, commit_id: null, side_effects_executed: false, reason: "handoff-not-found" };
        const claims = await input.client.list(`claims/${safeId(input.handoffId)}`);
        const claimPath = claims.find((item) => item.endsWith(".json"));
        const claim = claimPath ? await input.client.readJson(claimPath) : null;
        if (!isAgentClaim(claim) || claim.claim_id !== input.claimId || claim.handoff_id !== input.handoffId)
            return { schema: input.schema, status: "blocked", record: null, commit_id: null, side_effects_executed: false, reason: "claim-binding-mismatch" };
        const head = await input.client.getHead();
        const commit = await input.client.commit({ branch: AGENT_STATE_BRANCH, message: `Record agent ${input.schema === "zj-loop.agent_local_execution.v1" ? "execution" : "evidence"} ${input.handoffId} [skip ci]`, last_commit_id: head, actions: [{ action: "create", file_path: input.path, content: `${JSON.stringify(input.record, null, 2)}\n` }] });
        return { schema: input.schema, status: "recorded", record: input.record, commit_id: commit.id, side_effects_executed: true };
    }
    catch (error) {
        return { schema: input.schema, status: "blocked", record: null, commit_id: null, side_effects_executed: false, reason: error instanceof Error ? error.message : "state-write-failed" };
    }
}
export async function listAgentLocalHandoffs(input) {
    try {
        const paths = await input.client.list("handoffs");
        const handoffs = [];
        for (const file of paths.filter((item) => item.endsWith(".json"))) {
            const value = await input.client.readJson(file);
            if (!isAgentHandoff(value))
                continue;
            const claimPaths = await input.client.list(`claims/${safeId(value.handoff_id)}`);
            const claimPath = claimPaths.find((item) => item.endsWith(".json"));
            const claim = claimPath ? await input.client.readJson(claimPath) : null;
            const current = isAgentClaim(claim)
                ? { ...value, status: "claimed", claim }
                : value;
            if (current.status !== "completed")
                handoffs.push(current);
        }
        handoffs.sort((a, b) => a.created_at.localeCompare(b.created_at));
        return {
            schema: "zj-loop.agent_local_list.v1",
            status: "completed",
            handoffs,
            side_effects_executed: false,
        };
    }
    catch (error) {
        return {
            schema: "zj-loop.agent_local_list.v1",
            status: "blocked",
            handoffs: [],
            side_effects_executed: false,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
}
export async function claimAgentLocalHandoff(input) {
    const handoffPath = `handoffs/${safeId(input.handoffId)}.json`;
    const handoff = await input.client.readJson(handoffPath);
    if (!isAgentHandoff(handoff))
        return {
            schema: "zj-loop.agent_local_claim.v1",
            status: "blocked",
            handoff_id: input.handoffId,
            claim: null,
            commit_id: null,
            side_effects_executed: false,
            reason: "handoff-not-found",
        };
    if (!["pending", "blocked", "released"].includes(handoff.status))
        return {
            schema: "zj-loop.agent_local_claim.v1",
            status: "already-claimed",
            handoff_id: input.handoffId,
            claim: handoff.claim,
            commit_id: null,
            side_effects_executed: false,
            reason: "handoff-not-claimable",
        };
    const existingClaimPath = (await input.client.list(`claims/${safeId(handoff.handoff_id)}`)).find((item) => item.endsWith(".json"));
    if (existingClaimPath) {
        const existingClaim = await input.client.readJson(existingClaimPath);
        return {
            schema: "zj-loop.agent_local_claim.v1",
            status: "already-claimed",
            handoff_id: handoff.handoff_id,
            claim: isAgentClaim(existingClaim) ? existingClaim : null,
            commit_id: null,
            side_effects_executed: false,
            reason: "handoff-already-claimed",
        };
    }
    const claim = {
        schema: AGENT_CLAIM_SCHEMA,
        claim_id: `clm_${randomUUID().replaceAll("-", "")}`,
        handoff_id: handoff.handoff_id,
        human_id: input.humanId,
        agent_session_id: input.agentSessionId,
        claimed_at: input.now ?? new Date().toISOString(),
        status: "claimed",
    };
    const head = await input.client.getHead();
    try {
        const commit = await input.client.commit({
            branch: AGENT_STATE_BRANCH,
            message: `Claim agent handoff ${handoff.handoff_id} [skip ci]`,
            last_commit_id: head,
            actions: [
                {
                    action: "create",
                    file_path: `claims/${safeId(handoff.handoff_id)}/${safeId(claim.claim_id)}.json`,
                    content: `${JSON.stringify(claim, null, 2)}\n`,
                },
            ],
        });
        return {
            schema: "zj-loop.agent_local_claim.v1",
            status: "claimed",
            handoff_id: handoff.handoff_id,
            claim,
            commit_id: commit.id,
            side_effects_executed: true,
        };
    }
    catch (error) {
        return {
            schema: "zj-loop.agent_local_claim.v1",
            status: "already-claimed",
            handoff_id: handoff.handoff_id,
            claim: null,
            commit_id: null,
            side_effects_executed: false,
            reason: error instanceof Error ? error.message : "state-conflict",
        };
    }
}
export function buildHandoffId(input) {
    return `glh_${createHash("sha256").update(`${input.projectPath}\0${input.eventId}\0${input.dedupeKey}`).digest("hex").slice(0, 16)}`;
}
export function isAgentHandoff(value) {
    const item = value;
    return Boolean(item &&
        item.schema === AGENT_HANDOFF_SCHEMA &&
        typeof item.handoff_id === "string" &&
        typeof item.request_id === "string" &&
        typeof item.created_at === "string" &&
        item.source?.provider === "gitlab" &&
        typeof item.route?.route_id === "string" &&
        typeof item.executor?.kind === "string" &&
        typeof item.executor?.profile === "string" &&
        typeof item.registration?.commit === "string" &&
        typeof item.registration?.path === "string" &&
        typeof item.registration?.sha256 === "string" &&
        typeof item.workspace?.base_commit === "string");
}
function isAgentClaim(value) {
    const item = value;
    return Boolean(item &&
        item.schema === AGENT_CLAIM_SCHEMA &&
        typeof item.claim_id === "string" &&
        typeof item.handoff_id === "string" &&
        typeof item.human_id === "number" &&
        typeof item.agent_session_id === "string" &&
        item.status === "claimed");
}
function safeId(value) {
    if (!/^[a-zA-Z0-9_-]+$/.test(value))
        throw new Error("agent-id-invalid");
    return value;
}
export function createGitLabStateBranchClient(input) {
    const fetchImpl = input.fetchImpl ?? fetch;
    const project = encodeURIComponent(input.projectPath);
    const headers = { "PRIVATE-TOKEN": input.token };
    const request = async (url, init = {}) => {
        const response = await fetchImpl(url, {
            ...init,
            headers: {
                ...headers,
                ...init.headers,
            },
        });
        if (!response.ok)
            throw new Error(`gitlab-state-${response.status}`);
        return response;
    };
    return {
        async getHead() {
            const response = await request(`${input.apiBaseUrl.replace(/\/+$/, "")}/projects/${project}/repository/branches/${encodeURIComponent(AGENT_STATE_BRANCH)}`);
            const body = (await response.json());
            if (typeof body.commit?.id !== "string")
                throw new Error("gitlab-state-head-invalid");
            return body.commit.id;
        },
        async readJson(filePath) {
            const response = await fetchImpl(`${input.apiBaseUrl.replace(/\/+$/, "")}/projects/${project}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(AGENT_STATE_BRANCH)}`, { headers });
            if (response.status === 404)
                return null;
            if (!response.ok)
                throw new Error(`gitlab-state-${response.status}`);
            return JSON.parse(await response.text());
        },
        async list(directory) {
            const response = await request(`${input.apiBaseUrl.replace(/\/+$/, "")}/projects/${project}/repository/tree?ref=${encodeURIComponent(AGENT_STATE_BRANCH)}&path=${encodeURIComponent(directory)}&recursive=true&per_page=100`);
            const body = (await response.json());
            return body
                .filter((item) => item.type === "blob" && typeof item.path === "string")
                .map((item) => item.path);
        },
        async commit(commitInput) {
            const { message, ...commitPayload } = commitInput;
            const response = await request(`${input.apiBaseUrl.replace(/\/+$/, "")}/projects/${project}/repository/commits`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...commitPayload, commit_message: message }),
            });
            const body = (await response.json());
            if (typeof body.id !== "string")
                throw new Error("gitlab-state-commit-invalid");
            return { id: body.id };
        },
    };
}
