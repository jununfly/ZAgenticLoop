# Core Semantic Query Universe

This document defines the Agentic Loop Working questions that should shape the
future `@jununfly/zj-loop-core` semantic query API.

The query universe is intentionally not derived from MCP tool names. MCP is a
transport adapter. The core API should model what humans and agents need to know
while selecting, running, auditing, and explaining loops.

## Design Rule

Semantic queries should answer loop-working questions over structured data.
Protocol-specific formatting belongs in MCP or CLI adapters.

| Layer | Owns | Does not own |
| --- | --- | --- |
| `zj-loop-core` semantic queries | Pattern summaries, recommendation policy, cost estimates, readiness query orchestration, gate explanations, context-pack planning. | MCP protocol, CLI argv parsing, markdown-only output, filesystem root discovery. |
| Project evidence adapters | File existence, skill discovery, state docs, safety docs, run logs, GitHub workflow evidence. | Pattern selection policy or readiness scoring policy. |
| MCP/CLI adapters | Input validation, project root resolution, response formatting, backward-compatible tool names. | Domain policy decisions. |

## Priority Levels

| Priority | Meaning |
| --- | --- |
| P0 | Needed to remove current duplication and make MCP semantic tools consume core. |
| P1 | Needed for higher-value loop working decisions, but can follow the first core module. |
| P2 | Useful once readiness rules and run-history semantics are more mature. |

## Query Families

### 1. Pattern Discovery

These queries answer: "What loops exist, and what are they for?"

| Query | Priority | Inputs | Output intent | Primary data |
| --- | --- | --- | --- | --- |
| `listPatternSummaries()` | P0 | registry | Compact pattern cards: id, name, goal, cadence, risk, week-one mode, cost tier, state file. | `patterns/registry.yaml` |
| `getPatternProfile(patternId)` | P0 | registry, pattern docs optional | Full structured profile for one pattern, with registry facts separated from documentation text. | Registry, `patterns/{id}.md` |
| `groupPatternsByUseCase()` | P2 | registry | Buckets such as triage, CI, dependency, release, post-merge. | Registry id/name/goal/phases |

The first implementation should keep pattern docs optional. A missing markdown
file should not prevent registry-backed summary queries from working.

### 2. Pattern Selection

These queries answer: "Which loop should I run for this task and risk budget?"

| Query | Priority | Inputs | Output intent | Primary data |
| --- | --- | --- | --- | --- |
| `recommendPatterns(request)` | P0 | use case text, optional level, risk, cadence, tool target | Ranked recommendations with score reasons and disqualifiers. | Registry fields |
| `explainPatternFit(patternId, request)` | P1 | pattern id, same request shape | Single-pattern fit explanation with matching facts and risk notes. | Registry fields |
| `comparePatterns(patternIds, request)` | P2 | two or more pattern ids | Side-by-side tradeoff matrix. | Registry fields |

Recommendation should expose reasons rather than only a score. The current MCP
keyword scorer can be preserved as a first policy, but the policy should become
testable and transport-neutral.

### 3. Cost And Cadence

These queries answer: "What will this loop cost at L1/L2/L3, and is the cadence
reasonable?"

| Query | Priority | Inputs | Output intent | Primary data |
| --- | --- | --- | --- | --- |
| `estimatePatternCost(request)` | P0 | pattern id or pattern, level, optional cadence, conservative flag | Structured per-run and per-day cost estimate with warnings. | Registry `cost`, cadence |
| `parsePatternCadence(cadence)` | P0 | cadence string | Normalized runs/day model for a single interval or range. | Registry cadence |
| `explainCostWarnings(estimate)` | P1 | estimate result | Human-readable warning reasons. | Estimate result |

The cost policy already exists in `tools/zj-loop-cost/src/estimator.ts`. The
semantic API should move or mirror that logic into core so MCP and CLI stop
owning separate estimates.

### 4. Readiness Assessment

These queries answer: "Is this project ready to run a selected loop at a given
autonomy level?"

| Query | Priority | Inputs | Output intent | Primary data |
| --- | --- | --- | --- | --- |
| `assessProjectReadiness(evidence)` | P1 | project evidence | Current L0-L3 score, level, findings, recommendations. | Evidence adapter, readiness policy |
| `assessLoopReadiness(request)` | P1 | pattern id, level, project evidence | Pattern-specific readiness: required skills, state, safety, budget, gates. | Registry + evidence |
| `listMissingReadinessEvidence(request)` | P1 | pattern id, level, project evidence | Missing files/skills/docs as structured gaps. | Registry + evidence |

Readiness is sensitive because it affects user-visible levels. The first core
semantic module can define shapes and orchestration boundaries, but moving the
existing audit scoring policy should remain a separate migration slice.

### 5. Human Gates And Safety

These queries answer: "What must a human approve before this loop acts?"

| Query | Priority | Inputs | Output intent | Primary data |
| --- | --- | --- | --- | --- |
| `explainHumanGates(request)` | P1 | pattern id, level, optional action | Gate list with reason, source, and suggested escalation wording. | Registry `human_gates`, safety docs |
| `listPatternSafetyScopes(patternId)` | P2 | pattern id | Denylists, allowed actions, MCP scopes when available. | Registry + safety/constraints docs |
| `classifyActionAgainstGates(request)` | P2 | pattern id, action description | Allow/report/escalate classification. | Gates + safety docs |

Core should not execute or approve actions. It should explain constraints and
produce auditable gate decisions for adapters or agents to apply.

### 6. State And Run Evidence

These queries answer: "What evidence exists for the loop's current state and
recent behavior?"

| Query | Priority | Inputs | Output intent | Primary data |
| --- | --- | --- | --- | --- |
| `getLoopStateEvidence(request)` | P1 | pattern id, project evidence | State file paths, presence, freshness hints when available. | Registry `state`, evidence adapter |
| `summarizeRunLogEvidence(evidence)` | P2 | run log evidence | Recent run count/outcome hints without requiring prompt-side parsing. | `loop-run-log.md` |
| `detectLoopActivityEvidence(evidence)` | P2 | project evidence | Structured activity proof currently embedded in audit. | State files, workflows, git hints |

The evidence adapter can read files, but semantic queries should receive
evidence as input or call a narrow evidence provider interface. This keeps core
testable without hardwiring process-level filesystem behavior.

### 7. Context Pack Planning

These queries answer: "What should an agent read before acting?"

| Query | Priority | Inputs | Output intent | Primary data |
| --- | --- | --- | --- | --- |
| `buildLoopContextPack(request)` | P1 | pattern id, task, level, optional tool target | Ordered list of resources/docs/skills/state to read, with why each is included. | Registry + evidence |
| `listRequiredSkills(patternId)` | P0 | pattern id | Required or recommended skills for a pattern. | Registry `skills` |
| `listRequiredProjectDocs(patternId)` | P1 | pattern id | State, LOOP, budget, safety, constraints docs that matter for the loop. | Registry + evidence |

This family is where MCP can become much more useful: instead of returning every
raw resource, it can ask core what context is relevant for the loop at hand.

## P0 First Cut

The first implementation slice should be small enough to migrate MCP without
pulling in readiness scoring:

| API | Why first |
| --- | --- |
| `listPatternSummaries()` | Replaces `loop_list_patterns` projection logic. |
| `getPatternProfile(patternId)` | Clarifies registry facts versus raw docs for `loop_get_pattern`. |
| `recommendPatterns(request)` | Moves the current MCP recommendation heuristic out of protocol code. |
| `estimatePatternCost(request)` | Consolidates duplicate MCP and `zj-loop-cost` estimation policy. |
| `listRequiredSkills(patternId)` | Low-risk registry query that helps context-pack planning. |

Everything above can run from registry data alone, except optional pattern docs.
That keeps the first core module deterministic and easy to test.

## Out Of Scope For Core Queries

The semantic API should not own:

- creating, editing, or deleting project files
- invoking Git, GitHub, package managers, or MCP clients
- parsing CLI argv
- deciding whether to auto-merge, push, or approve work
- rendering the only source of truth as markdown
- storing run history

Those responsibilities belong to adapters, workflows, or future stateful loop
runtime components. Core should answer questions, not perform operations.

## Input To The Next Node

`1-6-2-2` should now design result contracts for the P0 APIs:

- stable TypeScript request/result interfaces
- machine-readable reasons, warnings, and sources
- optional human-facing formatter boundaries
- compatibility with current MCP text responses
- fixture strategy for registry-only tests

Follow-up: see `docs/core-semantic-query-contracts.md` for the P0 contract
design.
