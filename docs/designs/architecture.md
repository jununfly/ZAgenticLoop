# ZAgenticLoop Architecture

This document captures the stable architecture decisions that came out of the
architecture-improvement roadmap. It replaces the temporary inventories, drafts,
adapter maps, and roadmap files that were useful while the design was being
worked through.

## Direction

ZAgenticLoop is a tool-agnostic reference for Agentic Loop Working. The repo
contains human docs, patterns, starters, and a small `zj-loop-*` tool family.
The tool family should share domain facts and policy instead of duplicating
loop knowledge in every CLI or MCP handler.

The architecture has four layers:

| Layer | Owns | Does not own |
| --- | --- | --- |
| `patterns/registry.yaml` | Machine-readable pattern facts: ids, names, cadences, risk, skills, human gates, starters, state files, and cost metadata. | Long-form pattern guidance or tool-specific runtime behavior. |
| `@jununfly/zj-loop-core` | Registry loading, schema validation, shared domain types, project evidence primitives, and pure semantic queries. | CLI parsing, process exits, MCP protocol behavior, direct project-root reads inside semantic queries, readiness score presentation. |
| Product tools | CLI or MCP-specific IO, argument parsing, response formatting, root resolution, and compatibility surfaces. | Duplicated pattern facts, duplicated cost formulas, duplicated recommendation policy. |
| Docs and starters | Human-facing explanation, copyable project scaffolds, and operating guidance. | The canonical machine contract for pattern metadata or readiness policy. |

The main boundary rule is simple: core semantic functions answer what a loop
fact means; adapters decide how a particular surface reads inputs and formats
outputs.

## Registry

`patterns/registry.yaml` is the shared pattern index. It carries stable metadata
needed by tools:

- pattern id, name, goal, cadence, risk, phases, skills, and human gates
- starter path and state file
- initial tool-specific scaffold metadata for `zj-loop-init`
- cost metadata for `zj-loop-cost` and semantic cost estimates

The registry uses `schemaVersion: 1` and is loaded through
`@jununfly/zj-loop-core`. Unsupported versions, missing required fields, and
unknown fields fail fast in tests and build gates.

Human-facing pattern docs remain separate. The registry is the machine-readable
index, not a replacement for the pattern markdown files.

## Core Package Boundary

`@jununfly/zj-loop-core` is the shared domain kernel. It owns:

- `PatternRegistry` and `RegistryPattern` types
- registry parsing and validation
- project filesystem primitives and evidence helpers
- registry-only semantic queries
- the canonical cost estimate policy consumed by cost and MCP surfaces

Core does not own:

- CLI argv parsing, help text, exit codes, or process termination
- MCP resource registration, stdio transport, or MCP response formatting
- direct reads from project roots inside semantic query functions
- readiness scoring presentation or findings text

A semantic query should not accept a filesystem root. Adapters may read files,
normalize evidence, then pass explicit data to core.

## Semantic Queries

The first stable semantic query set is registry-first:

| Query | Purpose |
| --- | --- |
| `listPatternSummaries()` | Stable pattern cards for selection UIs, MCP summaries, and docs indexes. |
| `getPatternProfile()` | Registry facts plus optional raw pattern documentation supplied by an adapter. |
| `recommendPatterns()` | Pattern recommendation with scores, confidence, and machine-readable reason codes. |
| `estimatePatternCost()` | Structured token estimates, warning codes, and typed input errors. |
| `listRequiredSkills()` | Required skills projected from registry facts. |

Semantic query results should be structured first. MCP, CLI, docs, and future
agents can format those results differently without changing domain policy.

Expected typed errors include unknown pattern ids, invalid readiness levels, and
invalid cadence strings. Adapters convert those expected errors into their
surface-specific response format rather than leaking stack traces.

## MCP Server Boundary

`@jununfly/zj-loop-mcp-server` is a read-only protocol adapter over local loop
knowledge. It keeps existing MCP tool names stable while moving semantic logic
behind `@jununfly/zj-loop-core`.

Semantic tools backed by core:

- `loop_list_patterns`
- `loop_get_pattern`
- `loop_recommend_pattern`
- `loop_estimate_cost`

Evidence tools and raw resources remain resolver-backed:

- `loop_list_skills`
- `loop_get_skill`
- `loop_list_state_files`
- `loop_get_state`
- `loop://registry`
- `loop://config`
- `loop://budget`
- `loop://run-log`
- `loop://safety`
- `loop://patterns/{patternId}`
- `loop://skills/{skillName}`
- `loop://state/{stateFile}`

Raw resources are intentional. They answer "show me the source" and provide an
audit trail when a structured answer needs inspection. Semantic tools answer
"what does this mean for agentic loop working?"

Compatibility rules:

- Preserve existing MCP tool names.
- Keep `loop_list_patterns` legacy JSON field names such as `week_one_mode`,
  `token_cost`, and `state` for existing clients.
- Format expected semantic errors as text content responses.
- Do not add new structured MCP tools until the compatibility surface is proven.

## Readiness Policy

`zj-loop-audit` currently owns the Loop Readiness Score and readiness level
presentation. The policy is based on project evidence signals such as state
files, triage skills, verifier skills, safety docs, workflow evidence, MCP
mentions, worktree evidence, registry presence, budget docs, run logs, budget
skills, constraints, and loop activity.

Important policy decisions:

- L1 requires state.
- L2 requires triage.
- L3 requires state, verifier separation, cost observability, and real loop
  activity.
- L3 is capped when cost observability or operational proof is missing, even if
  the numeric score is high.

The future direction is a declarative readiness rule file in
`tools/zj-loop-audit/rules/readiness.v1.yaml`. That rule file should express:

- evidence selectors over a `LoopSignals`-like object
- derived predicates such as `costReady`, `hasRealActivity`, and `l3Ready`
- additive score contributions with exclusive groups where needed
- level gates evaluated from highest to lowest
- ordered assessment bands
- findings and recommendations tied to predicates

The rule engine should consume evidence. It should not read project files
directly.

## CLI Product Surface

The `zj-loop-*` CLIs have overlapping product concerns:

- `zj-loop-audit`: readiness scoring and suggestions
- `zj-loop-init`: starter and template scaffolding
- `zj-loop-cost`: token cost estimation
- `zj-loop-sync`: configuration drift detection

They currently parse argv and render help independently. A future shared CLI
harness should standardize:

- option metadata and aliases
- positional parsing
- unknown-option and missing-value behavior
- help text rendering
- structured output conventions
- error presentation
- exit semantics

The first harness can live in `@jununfly/zj-loop-core` and move out later if it
starts to feel unrelated to domain utilities. The first migration candidate is
`zj-loop-cost`, because it has a small command surface and already consumes core
cost semantics.

`zj-loop-mcp-server` is intentionally excluded from the first human-facing CLI
harness. It is a long-running stdio server, not a normal user command workflow.

## Verification Gates

Architecture slices should protect behavior at four levels:

1. core semantic contract tests
2. cost policy parity tests
3. MCP stdio compatibility tests
4. repo-level gates

Standard repo-level gates:

```bash
npm run validate:registry
npm run build:tools
npm run test:tools
cd tools/zj-loop-audit && npm run build && node dist/cli.js ../../
bash scripts/before-after-demo.sh
git diff --check
```

Test strategy:

- Core semantic tests assert structured contracts, reason codes, warning codes,
  and typed errors.
- Cost tests own exact numerical policy.
- MCP tests assert compatibility anchors and parse structured JSON only where
  the current surface already returns JSON.
- Broad markdown snapshots should not become the oracle for behavior.

## Review Anti-Boundaries

Treat these as architecture drift:

- a semantic query accepts `root: string`
- core semantic code calls `readFile`, `readdir`, `execSync`, `process.cwd`, or
  `process.env`
- MCP handlers compute recommendation scores directly
- CLI tools duplicate cost or recommendation formulas
- evidence adapters emit human recommendations instead of facts
- readiness policy changes without parity tests against current audit output
- raw MCP resources are removed before structured replacements are proven

## Roadmap Outcome

The architecture-improvement roadmap produced these durable outcomes:

- `@jununfly/zj-loop-core` became the shared package for registry parsing,
  project evidence primitives, semantic queries, and canonical cost policy.
- `patterns/registry.yaml` became the single machine-readable source for
  pattern metadata consumed by cost, init, audit, sync, and MCP surfaces.
- `zj-loop-init` moved pattern scaffolding facts behind registry metadata while
  keeping file copying and user interaction in the init package.
- `zj-loop-audit` consumes shared evidence primitives but still owns readiness
  policy and presentation.
- MCP semantic tools now consume core semantic queries while preserving existing
  tool names and raw resource access.
- Readiness rule schema and CLI harness work remain future implementation
  slices, with boundaries recorded here.
