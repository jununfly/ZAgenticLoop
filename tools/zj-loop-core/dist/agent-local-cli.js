#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { runCli } from "./cli.js";
import { claimAgentLocalHandoff, createGitLabStateBranchClient, listAgentLocalHandoffs, } from "./agent-local.js";
import { prepareAgentLocalWorktree } from "./agent-local-worktree.js";
import { buildAgentExecutionContext } from "./execution-context.js";
const argv = process.argv.slice(2);
process.exitCode = await runCli({
    name: "zj-loop-agent-local",
    description: "List and claim durable agent-local handoffs.",
    usage: "zj-loop-agent-local <list|claim|worktree|preflight> [options]",
    options: [
        {
            name: "command",
            type: "positional",
            description: "list, claim, worktree, or preflight",
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
            ? 0
            : 2;
    },
}, argv);
