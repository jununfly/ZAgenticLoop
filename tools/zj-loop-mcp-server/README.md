# @jununfly/zj-loop-mcp-server

MCP (Model Context Protocol) server for **ZAgenticLoop** — exposes patterns, skills, state, budget, and audit tools as runtime-queryable resources for AI agents.

Instead of stuffing all loop documentation into the prompt, agents can query only what they need on-demand via MCP.

## Quick Start

**v1 ships from this repo** (npm publish pending). From a cloned `ZAgenticLoop` repo:

```bash
cd tools/zj-loop-mcp-server && npm ci && npm test
node dist/index.js
```

Set `LOOP_PROJECT_ROOT` to your target project (defaults to `cwd`).

### Configure in Claude Code / Grok / any MCP client

Add to your MCP config (`.mcp.json` or equivalent):

```json
{
  "mcpServers": {
    "zj-loop": {
      "command": "npx",
      "args": ["-y", "@jununfly/zj-loop-mcp-server"],
      "env": {
        "LOOP_PROJECT_ROOT": "."
      }
    }
  }
}
```

## Resources

| URI | Description |
|-----|-------------|
| `loop://registry` | Pattern registry (all 7 patterns with metadata, costs, phases) |
| `loop://config` | LOOP.md — cadence, budget, gates, scheduling |
| `loop://budget` | loop-budget.md — token caps, kill switch |
| `loop://run-log` | loop-run-log.md — append-only run history |
| `loop://safety` | Safety docs — denylists, auto-merge policy, MCP scopes |
| `loop://patterns/{id}` | Full pattern documentation by ID |
| `loop://skills/{name}` | Skill definition (SKILL.md) by name |
| `loop://state/{file}` | State file content |

## Tools

| Tool | Backing | Description |
|------|---------|-------------|
| `loop_list_patterns` | `@jununfly/zj-loop-core` semantic query | List all patterns with legacy snake_case fields for existing clients |
| `loop_list_skills` | MCP resolver evidence | List available skills with locations |
| `loop_list_state_files` | MCP resolver evidence | List state files in the project |
| `loop_summarize_operational_context` | MCP resolver evidence | Structured summary of config, budget, run-log, and safety docs with raw resource links |
| `loop_get_pattern` | `@jununfly/zj-loop-core` semantic query + raw doc evidence | Get full pattern docs + registry metadata |
| `loop_get_skill` | MCP resolver evidence | Get SKILL.md content for a named skill |
| `loop_get_state` | MCP resolver evidence | Read a state file for current loop status |
| `loop_recommend_pattern` | `@jununfly/zj-loop-core` semantic query | Recommend patterns for a use case description |
| `loop_estimate_cost` | `@jununfly/zj-loop-core` semantic query | Estimate daily token cost for a pattern at L1/L2/L3 |

## Semantic API Compatibility

The MCP server keeps the original tool names stable while moving domain logic
behind `@jununfly/zj-loop-core` semantic queries.

- Semantic tools answer "what does this mean for agentic loop working?"
  (`loop_list_patterns`, `loop_get_pattern`, `loop_recommend_pattern`,
  `loop_estimate_cost`).
- Evidence tools and raw resources answer "show me the source" and continue to
  read from `LOOP_PROJECT_ROOT` (`loop://patterns/{id}`,
  `loop://skills/{name}`, `loop://state/{file}`, `loop_get_skill`,
  `loop_get_state`). `loop_summarize_operational_context` is the structured
  evidence route for config, budget, run-log, and safety discovery; it links
  back to the raw resources instead of replacing them.
- `loop_list_patterns` intentionally returns the legacy JSON field names
  (`week_one_mode`, `token_cost`, `state`) so existing clients can keep parsing
  the response while the implementation consumes core summaries internally.
- Typed core errors are formatted as text content responses in MCP. Expected
  user/data problems such as unknown patterns or invalid cadences should not
  crash the server.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `LOOP_PROJECT_ROOT` | `cwd()` | Root directory of the project to serve |

## Development

```bash
cd tools/zj-loop-mcp-server
npm install
npm run build
npm test
```

## Architecture

```
Agent (Claude Code / Grok / Codex)
  │
  ├─ MCP Resource Read ──→ loop://patterns/daily-triage
  ├─ MCP Tool Call ──→ loop_recommend_pattern("watch CI failures")
  └─ MCP Tool Call ──→ loop_estimate_cost("ci-sweeper", "L2")
  │
  ▼
zj-loop-mcp-server (stdio transport)
  │
  ├─ @jununfly/zj-loop-core ──→ semantic pattern, recommendation, and cost queries
  ├─ resolver.ts ─────────────→ reads patterns/, skills/, STATE.md, LOOP.md, etc.
  └─ index.ts ────────────────→ MCP protocol handlers and compatibility formatters
```

The server reads from the local filesystem at `LOOP_PROJECT_ROOT`. It is read-only — it never writes to the project.

## See Also

- [ZAgenticLoop Patterns](../../patterns/)
- [MCP Examples](../../examples/mcp/)
- [Primitives: Plugins & Connectors](../../docs/primitives.md)
- [Architecture: MCP Server Boundary](../../docs/designs/architecture.md#mcp-server-boundary)
- [Safety: MCP Least Privilege](../../docs/safety.md)
