#!/usr/bin/env node
import { runCli } from "./cli.js";
import {
  claimAgentLocalHandoff,
  createGitLabStateBranchClient,
  listAgentLocalHandoffs,
} from "./agent-local.js";

const argv = process.argv.slice(2);
process.exitCode = await runCli(
  {
    name: "zj-loop-agent-local",
    description: "List and claim durable agent-local handoffs.",
    usage: "zj-loop-agent-local <list|claim> [options]",
    options: [
      {
        name: "command",
        type: "positional",
        description: "list or claim",
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
        default:
          process.env.ZJ_LOOP_GITLAB_API_URL ??
          "https://git.bilibili.co/api/v4",
      },
      { name: "json", type: "boolean", description: "Print JSON output" },
    ],
    async handler({ io, options }) {
      const token = process.env.GITLAB_TOKEN;
      const project =
        typeof options.project === "string" ? options.project : undefined;
      if (!token || !project)
        throw new Error("GITLAB_TOKEN-and-project-required");
      const client = createGitLabStateBranchClient({
        apiBaseUrl: String(options["api-url"]),
        projectPath: project,
        token,
      });
      const command = String(options.command);
      const result =
        command === "list"
          ? await listAgentLocalHandoffs({ client })
          : await claimAgentLocalHandoff({
              client,
              handoffId: String(options["handoff-id"] ?? ""),
              humanId: Number(options["human-id"]),
              agentSessionId: String(options["agent-session-id"] ?? ""),
            });
      io.stdout(JSON.stringify(result, null, 2));
      return result.status === "completed" ||
        result.status === "claimed" ||
        result.status === "already-claimed"
        ? 0
        : 2;
    },
  },
  argv,
);
