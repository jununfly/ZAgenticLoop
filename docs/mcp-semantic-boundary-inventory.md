# MCP Semantic Boundary Inventory

This inventory audits the current `@jununfly/zj-loop-mcp-server` surface before
turning it into an Agentic Loop Working semantic API.

## Scope

This is an exploration slice. It does not change MCP behavior. The goal is to
make the current resource/tool boundary explicit so the next slice can design a
core-backed semantic query layer without guessing from handler code.

## Current Shape

The MCP server is read-only. It resolves a project root from `LOOP_PROJECT_ROOT`
or `cwd`, reads files under that root, and exposes them through stdio MCP
resources and tools.

The server has three layers today:

| Layer | Current owner | Responsibility |
| --- | --- | --- |
| MCP protocol handlers | `tools/zj-loop-mcp-server/src/index.ts` | Register resources/tools, format MCP responses, implement recommendation and cost logic inline. |
| Project resolver | `tools/zj-loop-mcp-server/src/resolver.ts` | Resolve safe project files, list skills/state files, load loop docs, load registry through core. |
| Shared domain kernel | `tools/zj-loop-core` | Parse and validate `patterns/registry.yaml`. |

## Resources

| MCP resource | Current semantic level | Backing source | Boundary assessment |
| --- | --- | --- | --- |
| `loop://registry` | Registry-backed fact dump | `patterns/registry.yaml` via `@jununfly/zj-loop-core` | Good raw fact endpoint, but it exposes the whole registry rather than task-shaped views. |
| `loop://config` | Raw project document | `LOOP.md` | Useful context, but the server does not extract cadence, gates, or budget semantics. |
| `loop://budget` | Raw project document | `loop-budget.md` | Useful context, but cost policy remains prose unless a client parses it. |
| `loop://run-log` | Raw project document | `loop-run-log.md` | Useful history, but no structured run outcome or trend query exists. |
| `loop://safety` | Raw project document | `docs/safety.md`, `safety.md`, or `SECURITY.md` | Useful safety context, but no normalized gate/scope model is exposed. |
| `loop://patterns/{patternId}` | Registry-gated raw document | `patterns/{id}.md`, allowed by registry or doc list fallback | Safety boundary is good; semantic extraction still lives with the client. |
| `loop://skills/{skillName}` | Raw skill document | `skills/`, `.grok/skills/`, `.claude/skills/`, `.codex/skills/` | Location aggregation is useful; skills are returned as complete markdown. |
| `loop://state/{stateFile}` | Allowlisted raw state document | Fixed state filename candidates | Good path boundary; no structured state status or next-action query exists. |

The resources are primarily document and fact retrieval surfaces. They reduce
prompt stuffing, but they do not yet answer Agentic Loop Working questions such
as "which loop is ready to run?", "what human gate blocks this action?", or
"which pattern fits this task under an L1 risk budget?"

## Tools

| MCP tool | Current semantic level | Logic source | Boundary assessment |
| --- | --- | --- | --- |
| `loop_list_patterns` | Registry fact projection | Registry fields selected in handler | Should move to a shared query such as `listPatternSummaries()`. |
| `loop_list_skills` | Filesystem inventory | Resolver scans known skill dirs | Mostly project evidence, not loop semantics. |
| `loop_list_state_files` | Filesystem inventory | Resolver allowlist | Mostly project evidence, not loop semantics. |
| `loop_get_pattern` | Registry plus raw doc join | Handler joins registry metadata and markdown | Useful composition, but output format is MCP-specific markdown. |
| `loop_get_skill` | Raw document lookup | Resolver | Thin wrapper around project evidence. |
| `loop_get_state` | Raw document lookup | Resolver | Thin wrapper around project evidence. |
| `loop_recommend_pattern` | Heuristic semantic tool | Inline keyword scoring in handler | This is domain semantics and should not live in MCP protocol code. |
| `loop_estimate_cost` | Heuristic semantic tool | Inline cadence parsing and L1/L2/L3 cost mix | This is domain semantics and should move behind core-owned cost/readiness queries. |

The sharpest boundary issue is that the most semantic tools
(`loop_recommend_pattern`, `loop_estimate_cost`) are implemented inline in
`index.ts`, while the core package currently owns only registry parsing. That
couples MCP behavior to one transport and makes it harder for CLI, docs, and
future agents to ask the same questions consistently.

## Resolver Boundaries

The resolver already contains useful project-evidence primitives:

- `resolveProjectRoot()`
- `readFileIfExists()`
- `loadRegistry()`
- `loadPatternDoc()`
- `listSkills()` / `loadSkill()`
- `listStateFiles()` / `loadState()`
- `loadLoopConfig()`, `loadBudget()`, `loadRunLog()`, `loadSafetyDoc()`

These are still housed in the MCP server. The split is currently acceptable for
MCP-specific file exposure, but it should not become the home of Agentic Loop
Working semantics. The next design should distinguish:

- project evidence collection: files and allowlists
- domain facts: parsed registry, readiness rules, cost model
- semantic queries: recommendations, readiness status, gate explanations
- transport formatting: MCP text/resource responses

## Missing Semantic Queries

The next API should be designed around questions an agent or human actually asks
while working a loop:

| Question | Current path | Desired semantic query |
| --- | --- | --- |
| Which patterns exist and what are they for? | `loop_list_patterns` | `listPatternSummaries()` |
| Which pattern fits this use case and risk budget? | `loop_recommend_pattern` keyword score | `recommendPatterns({ useCase, level, risk, cadence })` |
| What would this loop cost at L1/L2/L3? | `loop_estimate_cost` | `estimatePatternCost({ patternId, level, cadence })` |
| Is this project ready to run a selected loop? | Client reads several docs | `assessLoopReadiness({ patternId, level })` |
| Which human gates apply before action? | Client reads registry and safety docs | `explainHumanGates({ patternId, level, action })` |
| What state evidence exists for the loop? | `loop_list_state_files` + `loop_get_state` | `getLoopStateEvidence({ patternId })` |
| What should an agent read before acting? | Client chooses resources manually | `buildLoopContextPack({ patternId, task, level })` |

## Design Inputs For 1-6-2

1. Keep MCP read-only; semantic APIs can compute, rank, and explain, but should
   not mutate project state.
2. Move transport-neutral domain logic into `@jununfly/zj-loop-core` first.
   MCP should call core and format results.
3. Keep raw resources available. They remain valuable escape hatches and support
   auditability.
4. Treat heuristic scoring and cost estimation as explicit domain policies with
   tests, not incidental handler code.
5. Design result shapes as structured data first. MCP can render markdown, but
   CLIs and future docs should share the same underlying query output.
6. Preserve current path safety: pattern IDs and state files must remain
   registry-gated or allowlisted before any file read.

## Recommended Next Slice

For `1-6-2`, design a small core semantic query module before changing MCP:

- `listPatternSummaries(registry)`
- `recommendPatterns(registry, request)`
- `estimatePatternCost(pattern, request)`
- `describePatternContext(projectEvidence, patternId)`

Then update MCP tools to become protocol adapters over those queries in a later
implementation slice.
