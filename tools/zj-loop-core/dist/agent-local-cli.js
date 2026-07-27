#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { runCli } from "./cli.js";
import { claimAgentLocalHandoff, createGitLabStateBranchClient, listAgentLocalHandoffs, recordAgentLocalEvidence, recordAgentLocalExecution, } from "./agent-local.js";
import { loadAgentContext, persistActivationSnapshotRef } from "./agent-context.js";
import { prepareAgentLocalWorktree } from "./agent-local-worktree.js";
import { buildAgentExecutionContext } from "./execution-context.js";
const argv = process.argv.slice(2);
process.exitCode = await runCli({
    name: "zj-loop-agent-local",
    description: "List and claim durable agent-local handoffs.",
    usage: "zj-loop-agent-local <list|claim|worktree|context|activation-ref|preflight> [options]",
    options: [
        {
            name: "command",
            type: "positional",
            description: "list, claim, worktree, context, activation-ref, or preflight",
            default: "list",
        },
        {
            name: "handoff-id",
            type: "string",
            description: "Handoff id for claim",
        },
        {
            name: "human-id",
            type: "string",
            description: "GitLab Human user id",
            default: process.env.ZJ_LOOP_AGENT_HUMAN_ID ?? "81",
        },
        {
            name: "agent-session-id",
            type: "string",
            description: "Local Codex session id",
            default: process.env.ZJ_LOOP_AGENT_SESSION_ID,
        },
        { name: "repo-root", type: "string", description: "Local Git repository root", default: process.cwd() },
        { name: "worktree-root", type: "string", description: "Directory for agent worktrees", default: path.resolve(process.cwd(), "../zj-loop-worktrees") },
        { name: "activation", type: "string", description: "Roadmap activation id for preflight" },
        { name: "roadmap-path", flag: "roadmap-path", type: "string", description: "Repository-relative roadmap path" },
        { name: "out", type: "string", description: "Write the execution-context snapshot to this path" },
        { name: "commit", type: "string", description: "Immutable activation contract commit" },
        { name: "path", type: "string", description: "Repository-relative activation contract path" },
        { name: "sha256", type: "string", description: "Activation contract SHA-256" },
        { name: "execution-id", flag: "execution-id", type: "string", description: "Execution id" },
        { name: "execution-status", flag: "execution-status", type: "enum", values: ["running", "completed", "blocked", "released"], description: "Execution lifecycle status" },
        { name: "branch", type: "string", description: "Agent branch for execution evidence" },
        { name: "worktree-path", flag: "worktree-path", type: "string", description: "Agent worktree path for execution evidence" },
        { name: "reason", type: "string", description: "Structured execution block/release reason" },
        { name: "evidence-kind", flag: "evidence-kind", type: "string", description: "Evidence kind" },
        { name: "evidence-status", flag: "evidence-status", type: "enum", values: ["passed", "failed", "informational"], description: "Evidence status" },
        { name: "evidence-path", flag: "evidence-path", type: "string", description: "Repository-relative evidence path" },
        { name: "evidence-sha256", flag: "evidence-sha256", type: "string", description: "Evidence SHA-256" },
        {
            name: "project",
            type: "string",
            description: "GitLab project path",
            default: process.env.ZJ_LOOP_AGENT_PROJECT_PATH,
        },
        {
            name: "api-url",
            type: "string",
            description: "GitLab API URL",
            default: process.env.ZJ_LOOP_GITLAB_API_URL ??
                "https://git.bilibili.co/api/v4",
        },
        { name: "json", type: "boolean", description: "Print JSON output" },
    ],
    async handler({ io, options }) {
        const token = process.env.GITLAB_TOKEN;
        const project = typeof options.project === "string" ? options.project : undefined;
        if (!token || !project)
            throw new Error("GITLAB_TOKEN-and-project-required");
        const client = createGitLabStateBranchClient({
            apiBaseUrl: String(options["api-url"]),
            projectPath: project,
            token,
        });
        const command = String(options.command);
        let result;
        if (command === "list") {
            result = await listAgentLocalHandoffs({ client });
        }
        else if (command === "claim") {
            result = await claimAgentLocalHandoff({
                client,
                handoffId: String(options["handoff-id"] ?? ""),
                humanId: Number(options["human-id"]),
                agentSessionId: String(options["agent-session-id"] ?? ""),
            });
        }
        else if (command === "worktree") {
            const handoffId = String(options["handoff-id"] ?? "");
            const value = await client.readJson(`handoffs/${handoffId}.json`);
            if (!value || typeof value !== "object")
                throw new Error("handoff-not-found");
            const claims = await client.list(`claims/${handoffId}`);
            const claimPath = claims.find((item) => item.endsWith(".json"));
            const claim = claimPath ? await client.readJson(claimPath) : null;
            const handoff = (claim && typeof claim === "object" ? { ...value, status: "claimed", claim } : value);
            result = await prepareAgentLocalWorktree({
                handoff,
                repoRoot: path.resolve(String(options["repo-root"])),
                worktreeRoot: path.resolve(String(options["worktree-root"])),
            });
        }
        else if (command === "context") {
            result = await loadAgentContext({ state: client, project: client, handoffId: String(options["handoff-id"] ?? "") });
        }
        else if (command === "activation-ref") {
            const activationId = String(options.activation ?? "");
            const commit = String(options.commit ?? "");
            const contractPath = String(options.path ?? "");
            const sha256 = String(options.sha256 ?? "");
            if (!activationId || !commit || !contractPath || !sha256)
                throw new Error("activation-ref-fields-required");
            result = await persistActivationSnapshotRef({ state: client, activationId, projectPath: project, commit, path: contractPath, sha256 });
        }
        else if (command === "preflight") {
            const handoffId = String(options["handoff-id"] ?? "");
            const value = await client.readJson(`handoffs/${handoffId}.json`);
            const claims = await client.list(`claims/${handoffId}`);
            const claimPath = claims.find((item) => item.endsWith(".json"));
            const claim = claimPath ? await client.readJson(claimPath) : null;
            const handoff = (value && typeof value === "object" ? { ...value, ...(claim && typeof claim === "object" ? { status: "claimed", claim } : {}) } : null);
            const stateHead = await client.getHead();
            result = await buildAgentExecutionContext({ handoff, repoRoot: path.resolve(String(options["repo-root"])), activationId: String(options.activation ?? ""), roadmapPath: typeof options["roadmap-path"] === "string" ? options["roadmap-path"] : undefined, stateHead });
            if (typeof options.out === "string")
                await writeFile(String(options.out), `${JSON.stringify(result, null, 2)}\n`);
        }
        else if (command === "execution" || command === "evidence") {
            const handoffId = String(options["handoff-id"] ?? "");
            const value = await client.readJson(`handoffs/${handoffId}.json`);
            const claims = await client.list(`claims/${handoffId}`);
            const claimPath = claims.find((item) => item.endsWith(".json"));
            const claim = claimPath ? await client.readJson(claimPath) : null;
            const claimValue = claim;
            if (!claimValue || typeof claimValue.claim_id !== "string")
                throw new Error("handoff-claim-required");
            if (command === "execution") {
                const status = String(options["execution-status"] ?? "");
                if (!["running", "completed", "blocked", "released"].includes(status))
                    throw new Error("execution-status-required");
                result = await recordAgentLocalExecution({ client, handoffId, claimId: claimValue.claim_id, executionId: typeof options["execution-id"] === "string" ? options["execution-id"] : undefined, status: status, branch: typeof options.branch === "string" ? options.branch : undefined, worktreePath: typeof options["worktree-path"] === "string" ? options["worktree-path"] : undefined, reason: typeof options.reason === "string" ? options.reason : undefined });
            }
            else {
                const executionId = String(options["execution-id"] ?? "");
                const kind = String(options["evidence-kind"] ?? "");
                const status = String(options["evidence-status"] ?? "");
                if (!executionId || !kind || !["passed", "failed", "informational"].includes(status))
                    throw new Error("evidence-fields-required");
                result = await recordAgentLocalEvidence({ client, handoffId, claimId: claimValue.claim_id, executionId, kind, status: status, path: typeof options["evidence-path"] === "string" ? options["evidence-path"] : undefined, sha256: typeof options["evidence-sha256"] === "string" ? options["evidence-sha256"] : undefined });
            }
        }
        else {
            throw new Error("unsupported-agent-local-command");
        }
        io.stdout(JSON.stringify(result, null, 2));
        return result.status === "completed" ||
            result.status === "claimed" ||
            result.status === "already-claimed" ||
            result.status === "prepared" ||
            result.status === "reused" ||
            result.status === "execution-ready"
            || result.status === "recorded"
            || result.status === "duplicate"
            ? 0
            : 2;
    },
}, argv);
