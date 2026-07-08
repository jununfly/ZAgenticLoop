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
| `@jununfly/zj-loop-core` | Registry loading, schema validation, shared domain types, project evidence primitives, pure semantic queries, and the narrow shared single-command CLI harness. | MCP protocol behavior, direct project-root reads inside semantic queries, product-specific output, scaffold side effects, readiness score presentation. |
| Product tools | CLI or MCP-specific option metadata, IO wiring, response formatting, root resolution, side effects, and compatibility surfaces. | Duplicated pattern facts, duplicated cost formulas, duplicated recommendation policy, duplicated CLI lifecycle plumbing. |
| Docs and starters | Human-facing explanation, copyable project scaffolds, and operating guidance. | The canonical machine contract for pattern metadata or readiness policy. |

The main boundary rule is simple: core semantic functions answer what a loop
fact means; adapters decide how a particular surface reads inputs and formats
outputs.

`tools/zj-goal-audit` is a sibling goal readiness package, not part of the
`@jununfly/zj-loop-*` tool family. It uses the `@jununfly/zj-goal-audit`
package identity and `zj-goal-audit` CLI name while the root repository quality
gates still build and test it with the loop tools to avoid release drift.

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
- the canonical pattern recommendation policy consumed by MCP and future
  selection surfaces
- the canonical cost estimate policy consumed by cost and MCP surfaces

Core does not own:

- product-specific CLI output, side effects, root resolution, or business
  validation
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
| `recommendPatterns()` | Pattern recommendation with scores, confidence, and machine-readable reason codes from a core-owned typed policy. |
| `estimatePatternCost()` | Structured token estimates, warning codes, and typed input errors. |
| `listRequiredSkills()` | Required skills projected from registry facts. |

Semantic query results should be structured first. MCP, CLI, docs, and future
agents can format those results differently without changing domain policy.

`recommendPatterns()` keeps its policy internal to core for now. The first
structured policy is a typed table of field matches, boost rules, and
confidence bands. It is not an external YAML file and does not extend
`patterns/registry.yaml`; the registry remains pattern facts, while the core
semantic layer interprets those facts for a use case.

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
- `loop_summarize_operational_context`
- `loop_get_state`
- `loop://registry`
- `loop://config`
- `loop://budget`
- `loop://run-log`
- `loop://safety`
- `loop://patterns/{patternId}`
- `loop://skills/{skillName}`
- `loop://state/{stateFile}`

Resolver-backed evidence surfaces keep MCP compatibility while consuming core
`ProjectFileSystem` primitives for project-relative reads and directory lists.
The resolver owns path safety checks, URI/tool compatibility, and text response
shaping; it does not own a separate project filesystem abstraction.

Raw resources are intentional. They answer "show me the source" and provide an
audit trail when a structured answer needs inspection. Semantic tools answer
"what does this mean for agentic loop working?"

`loop_summarize_operational_context` is the first structured evidence route for
raw operational docs. It summarizes the presence, source path, and key lines for
config, budget, run-log, and safety documents, and returns the corresponding
`loop://` raw resource URIs for inspection. It does not replace raw resources
or move readiness policy into MCP.

Compatibility rules:

- Preserve existing MCP tool names.
- Keep `loop_list_patterns` legacy JSON field names such as `week_one_mode`,
  `token_cost`, and `state` for existing clients.
- Format expected semantic errors as text content responses.
- Do not add new structured MCP tools until the compatibility surface is proven.

## Readiness Policy

`zj-loop-audit` owns the Loop Readiness Score, readiness level presentation,
findings, and recommendations. The policy is based on project evidence signals
such as state files, triage skills, verifier skills, loop safety policy, workflow
evidence, MCP mentions, worktree evidence, registry presence, budget docs, run
logs, budget skills, constraints, and loop activity.

Important policy decisions:

- L1 requires state.
- L2 requires triage.
- L3 requires state, verifier separation, cost observability, and real loop
  activity.
- L3 is capped when cost observability or operational proof is missing, even if
  the numeric score is high.
- Display severity (`ok`, `warn`, `fail`) is not the product contract for a
  finding. Each finding also carries a category: `pass`, `blocker`,
  `readiness-gap`, `hardening`, or `future-tooling`.
- Non-pass findings expose whether they affect score/level and carry structured
  `nextSteps` so human output and machine consumers do not have to infer action
  semantics from prose.

The declarative policy lives in
`tools/zj-loop-audit/rules/readiness.v1.yaml`. It expresses:

- evidence selectors over a `LoopSignals`-like object
- derived predicates such as `costReady`, `hasRealActivity`, and `l3Ready`
- additive score contributions with exclusive groups where needed
- level gates evaluated from highest to lowest
- ordered assessment bands
- findings, categories, score impact, structured next steps, and
  recommendations tied to predicates

`tools/zj-loop-audit/src/readiness-rules.ts` evaluates that policy. It consumes
the evidence object produced by `auditProject()` and does not read project files
directly. `auditProject()` still owns project inspection and dynamic evidence
collection, including git/workflow/activity checks. Guidance text may use simple
signal-path placeholders such as `{stateFile.paths}`; the rule file should not
grow a general template or expression language.

`zj-loop-audit --suggest` renders the structured next steps grouped by finding
category. This keeps a `100/100 L3` result with remaining hardening or
future-tooling suggestions from looking contradictory: the score/level contract
and the follow-up action category are shown separately.

## CLI Product Surface

The `zj-loop-*` CLIs have overlapping product concerns:

- `zj-loop-audit`: readiness scoring and suggestions
- `zj-loop-init`: starter and template scaffolding
- `zj-loop-cost`: token cost estimation
- `zj-loop-sync`: configuration drift detection

They now consume a shared single-command CLI harness from
`@jununfly/zj-loop-core`. The harness standardizes the lifecycle mechanics that
had been duplicated across tools:

- option metadata and aliases
- positional parsing
- unknown-option and missing-value behavior
- help text rendering
- error presentation
- exit semantics

The harness intentionally stays small:

- single-command CLIs only; no subcommands, command registry, nested option
  groups, or shell completion
- injectable `io` for tests, with a default implementation backed by
  `console` and process stdio behavior
- optional async help text so commands such as `zj-loop-init` can render
  registry-backed pattern lists
- handler execution and thrown-error formatting

Product tools still own the product contract:

- `zj-loop-cost` owns human and JSON cost output, and preserves `--list` as
  tab-separated output.
- `zj-loop-sync` owns drift report formatting and level-to-exit-code mapping;
  `--json` emits the already-declared JSON report. It consumes core
  `ProjectFileSystem` primitives for project-relative evidence access instead
  of owning raw filesystem helpers.
- `zj-loop-audit` owns readiness scoring, suggestions, badge/markdown/json
  output, and the low-score exit code `2`.
- `zj-loop-init` owns scaffold file writes, dry-run progress output, dynamic
  registry-backed help, and next-step guidance.

`zj-loop-init` has two scaffold modes:

- pattern initialization via `--pattern <id> --tool <tool>`, which copies a full
  starter and associated runtime templates.
- incremental artifact addition via `--add safety`, `--add pattern-registry`,
  `--add route-table`, or a comma-separated combination, which adds only
  explicitly requested optional artifacts.

Incremental artifact addition intentionally rejects aggregate aliases such as
`all` or `recommended`. Existing files are skipped by default with a next step
that tells the user how to review or rerun. `--force` means real overwrite, not
sidecar creation; the CLI must make that overwrite auditable in its output.

Unknown options and missing option values fail fast only for commands that have
been migrated to the harness. As of this design snapshot, `zj-loop-cost`,
`zj-loop-sync`, `zj-loop-audit`, and `zj-loop-init` are migrated.

`zj-loop-mcp-server` is intentionally excluded from the first human-facing CLI
harness. It is a long-running stdio server, not a normal user command workflow.

## User Project Artifacts

User-project loop artifacts are namespaced under `zj-loop/` by default. This
keeps ZAgenticLoop state, configuration, budget, run history, and constraints
from spreading across a user's repository root while still keeping the files
plain, reviewable, and tool-agnostic.

Canonical files:

- `zj-loop/STATE.md` or `zj-loop/<pattern>-state.md`
- `zj-loop/ZJ-LOOP.md`
- `zj-loop/zj-loop-route-table.yaml`
- `zj-loop/zj-loop-budget.md`
- `zj-loop/zj-loop-run-log.md`
- `zj-loop/zj-loop-constraints.md`
- `zj-loop/zj-loop-safety.md`

`zj-loop/zj-loop-safety.md` is the canonical loop safety policy. Legacy paths
such as `docs/safety.md`, root `safety.md`, and `SECURITY.md` do not count as
loop safety evidence. `SECURITY.md` is reserved for vulnerability disclosure and
security reporting; it must not substitute for runtime loop safety policy.

`patterns/registry.yaml` intentionally remains outside `zj-loop/`. It is a
repository pattern catalog, not project-local loop runtime state or policy.

Tool-host directories such as `.codex/`, `.grok/`, `.claude/`, and tool-specific
skill or agent folders stay where those host tools require them. The `zj-loop/`
namespace is for project-local loop memory and operating artifacts, not a forced
relocation of every tool integration.

For this repository, committed artifacts are the alignment surface:
`skills/`, `starters/`, `templates/`, `patterns/registry.yaml`, `zj-loop/`,
`tools/`, workflows, and durable docs. A root `.codex/` directory is a
tool-host local install surface for the current workstation or agent runtime. It
may be visible during development, but it is not a durable repository artifact
and must not be used as a completeness check for packaged skills or registry
entries. Starter-owned tool-host directories are different: they are committed
examples or scaffold outputs and may be validated as part of starter behavior.

The public roadmap-sliced development pattern id is
`roadmap-sliced-development`, with starter files under
`starters/roadmap-sliced-development/`. The older
`roadmap-sliced-development-pattern` spelling is not a public entry point in the
current mainline; tests keep it only as a negative case so the tools reject old
ids clearly.

`zj-loop-init` and `zj-loop-audit` share a small internal artifact contract for
these canonical paths. It is deliberately an implementation contract between
tools, not a new user-facing concept that pattern docs must teach first.

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

`npm run build:tools` and `npm run test:tools` cover both the `zj-loop-*` tool
family and the `tools/zj-goal-audit` goal readiness package. That coverage is a
quality gate only; it does not imply that goal readiness belongs inside the loop
core package.

The root build/test aggregation is owned by
`scripts/run-tool-package-scripts.mjs`. It keeps the ordered tool package list
and package roles in one repo-local place, then runs `npm --prefix <dir> run
build|test` for each package. This runner is quality-gate orchestration, not
domain semantics, so it does not live in `@jununfly/zj-loop-core` and does not
replace package-local build, test, or release scripts.

The release lifecycle is guarded by `scripts/validate-release-workflows.mjs`
and documented in `docs/RELEASE.md`. Release-managed packages are
`@jununfly/zj-loop-core`, `@jununfly/zj-loop-audit`,
`@jununfly/zj-loop-init`, `@jununfly/zj-loop-cost`,
`@jununfly/zj-loop-sync`, `@jununfly/zj-loop-mcp-server`, and
`@jununfly/zj-goal-audit`.

The release universe is defined by package publish surface, not by memory of
which workflows already exist. A package under `tools/` with
`publishConfig.access: public` or an npm `bin` entry must either be covered by
the release manifest or explicitly marked `private: true`.

Release artifacts are split into two classes:

- Committed package artifacts such as `dist/`, package READMEs, package-local
  registries, and small runtime data that npm entrypoints need.
- Release-time generated package artifacts such as
  `tools/zj-loop-init/starters/` and `tools/zj-loop-init/templates/`, which are
  copied into the package working tree by package tests/builds and ignored by
  git inside the package.

Known `file:../zj-loop-core` dependencies in publishable packages are explicit
release blockers, not hidden assumptions. The validator rejects untracked new
local `file:` dependencies. The explicit release-ready gate,
`npm run test:release-ready`, rejects every local `file:` dependency so public
npm consumers never receive packages with monorepo-only links.

The selected core dependency strategy is core-first publishing. The first
release published `@jununfly/zj-loop-core@0.1.0`, waited until npm could resolve
it, then migrated dependent `@jununfly/zj-loop-*` packages to
`@jununfly/zj-loop-core: ^0.1.0` and regenerated package-local lockfiles against
the registry tarball before tagging dependent packages.

The release dependency roadmap is closed at the architecture level: release
validation now treats registry-resolvable package dependencies as the publish
boundary, with Trusted Publisher setup remaining as post-first-release
hardening rather than architecture exploration.

Test strategy:

- Core semantic tests assert structured contracts, reason codes, warning codes,
  and typed errors.
- Audit readiness tests include a default-policy fixture matrix for L3 happy
  path, cost cap, activity cap, and L1/L2 guidance anchors.
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
- product tools reimplement CLI help/parse/error lifecycle instead of using the
  shared single-command harness
- readiness policy changes without parity tests against current audit output
- raw MCP resources are removed before structured replacements are proven

## Roadmap Outcome

The architecture-improvement roadmap produced these durable outcomes:

- `@jununfly/zj-loop-core` became the shared package for registry parsing,
  project evidence primitives, semantic queries, canonical recommendation
  policy, and canonical cost policy.
- `patterns/registry.yaml` became the single machine-readable source for
  pattern metadata consumed by cost, init, audit, sync, and MCP surfaces.
- `zj-loop-init` moved pattern scaffolding facts behind registry metadata while
  keeping file copying and user interaction in the init package.
- `zj-loop-audit` consumes shared evidence primitives but still owns readiness
  policy and presentation.
- MCP semantic tools now consume core semantic queries while preserving existing
  tool names and raw resource access.
- MCP resolver evidence surfaces now consume core project filesystem primitives
  for project-relative registry, pattern, skill, state, config, budget, run-log,
  and safety reads while preserving raw resource compatibility.
- `recommendPatterns()` recommendation weights, boost rules, reason codes, and
  confidence bands are now represented as a core-owned typed policy interpreted
  by the semantic query.
- `zj-loop-cost`, `zj-loop-sync`, `zj-loop-audit`, and `zj-loop-init` now share
  the core single-command CLI harness while preserving their product-specific
  output and side effects.
- User-project loop artifacts now converge under the `zj-loop/` namespace, with
  init, audit, sync, MCP, starters, templates, examples, and docs aligned to
  `zj-loop/STATE.md`, `zj-loop/ZJ-LOOP.md`,
  `zj-loop/zj-loop-route-table.yaml`, `zj-loop/zj-loop-budget.md`,
  `zj-loop/zj-loop-run-log.md`, and `zj-loop/zj-loop-constraints.md`.
- `roadmap-sliced-development` is the canonical public pattern id and starter
  directory; the older `roadmap-sliced-development-pattern` spelling is retained
  only as a rejected-id test case.
- `zj-loop-sync` now uses the core project filesystem primitives for
  project-relative existence, read, and directory evidence while keeping drift
  policy and reporting package-local.
- `zj-loop-audit` readiness score, level gates, assessment bands, findings, and
  recommendations now live in the package-owned `readiness.v1.yaml` policy and
  are evaluated by a local rule engine over collected evidence.
- `zj-loop-audit` findings now distinguish display severity from product
  category, expose score impact, and carry structured next steps rendered by
  `--suggest` by category.
- `zj-loop-init` supports explicit incremental artifact scaffolding for
  `safety` and `pattern-registry`, including multi-select, default skip on
  existing files, and auditable `--force` overwrite behavior.
- Loop safety policy moved to `zj-loop/zj-loop-safety.md`; init, audit, MCP,
  goal-audit, starters, templates, examples, and docs now treat that as the
  canonical loop safety evidence path.
- Root `build:tools` and `test:tools` now run through a repo-local tool gate
  runner that centralizes `zj-loop-*` and `zj-goal-audit` coverage without
  moving goal readiness into the loop core.
- Release workflow validation now protects workflow files, package manifests,
  docs, artifact tracking/generation policy, and known local dependency
  blockers for all release-managed packages.
- `@jununfly/zj-loop-core`, `@jununfly/zj-loop-sync`, and
  `@jununfly/zj-loop-mcp-server` are now part of the documented
  release-managed package lifecycle.
- Release-ready validation now exists as an explicit pre-tag gate that rejects
  local `file:` dependencies, while the normal development gate continues to
  allow documented monorepo blockers.
- The release dependency roadmap closed with the core dependency migration left
  as an explicit release blocker, not an unfinished architecture question.
