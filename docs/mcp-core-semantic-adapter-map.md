# MCP To Core Semantic Adapter Map

This document maps the current `@jununfly/zj-loop-mcp-server` resources and
tools to the future `@jununfly/zj-loop-core` semantic query API.

It is a design artifact for `1-6-2-4`. It does not change MCP runtime behavior.

## Migration Rule

Preserve existing MCP tool names first. Change the implementation behind the
tools to call core semantic queries, then consider additive semantic tools only
after compatibility is proven.

Raw resources should stay available. They are the audit trail and escape hatch
when a structured semantic answer needs inspection.

## Current MCP Surface

| Surface | Current role | Future owner |
| --- | --- | --- |
| `loop://registry` | Raw registry resource | MCP resource adapter over registry loader. |
| `loop://config` | Raw `LOOP.md` resource | MCP resource adapter. |
| `loop://budget` | Raw `loop-budget.md` resource | MCP resource adapter. |
| `loop://run-log` | Raw `loop-run-log.md` resource | MCP resource adapter. |
| `loop://safety` | Raw safety docs resource | MCP resource adapter. |
| `loop://patterns/{patternId}` | Raw pattern markdown resource | MCP resource adapter; semantic equivalent is `loop_get_pattern`. |
| `loop://skills/{skillName}` | Raw skill markdown resource | MCP resource adapter. |
| `loop://state/{stateFile}` | Raw state markdown resource | MCP resource adapter. |
| `loop_list_patterns` | Registry projection | Core `listPatternSummaries()`, formatted by MCP. |
| `loop_list_skills` | Filesystem evidence list | MCP resolver for now; future evidence adapter. |
| `loop_list_state_files` | Filesystem evidence list | MCP resolver for now; future evidence adapter. |
| `loop_get_pattern` | Registry metadata plus pattern docs | Core `getPatternProfile()`, with MCP loading optional doc input. |
| `loop_get_skill` | Raw skill markdown lookup | MCP resolver for now. |
| `loop_get_state` | Raw state markdown lookup | MCP resolver for now. |
| `loop_recommend_pattern` | Inline keyword recommendation | Core `recommendPatterns()`, formatted by MCP. |
| `loop_estimate_cost` | Inline cost estimate | Core `estimatePatternCost()`, formatted by MCP. |

## Tool Mapping

### `loop_list_patterns`

| Aspect | Plan |
| --- | --- |
| Core query | `listPatternSummaries(registry)` |
| MCP responsibilities | Resolve root, load registry, call query, format `patterns` as JSON compatible with current response. |
| Compatibility target | Preserve existing fields where possible: `id`, `name`, `goal`, `cadence`, `risk`, `week_one_mode`, `token_cost`, `state`. |
| New semantic value | Can include stable summary contract internally: `requiredSkills`, `humanGates`, `starter`. |
| Tests | Existing `loop_list_patterns tool returns registry patterns`; add assertion that output comes from summary shape without full registry leakage. |

The adapter can translate camelCase core fields back to current snake_case names
if preserving exact JSON shape matters for clients.

### `loop_get_pattern`

| Aspect | Plan |
| --- | --- |
| Core query | `getPatternProfile(registry, { patternId, patternDoc })` |
| MCP responsibilities | Resolve root, load registry, load optional pattern markdown through safe resolver, pass doc text to core, format metadata plus docs. |
| Compatibility target | Preserve current "Registry Metadata" and "Pattern Documentation" markdown sections. |
| New semantic value | Typed unknown-pattern errors and explicit separation of registry facts from documentation. |
| Tests | Existing pattern resource test remains raw; add tool test for unknown pattern error and metadata/docs formatting. |

Core must not read `patterns/{id}.md`; MCP loads the optional doc because path
safety and project root resolution belong to the adapter.

### `loop_recommend_pattern`

| Aspect | Plan |
| --- | --- |
| Core query | `recommendPatterns(registry, { useCase, limit: 3 })` |
| MCP responsibilities | Validate `useCase`, call core, format top recommendations in current markdown style. |
| Compatibility target | Preserve top-3 recommendation behavior and visible fields: goal, cadence, risk, start mode, skills, starter. |
| New semantic value | Expose reasons internally and eventually include them in markdown output without breaking clients. |
| Tests | Add deterministic cases for `ci`, `dependencies`, `issue triage`, `changelog`; assert stable top result and reason codes. |

The current inline scorer can seed the first core policy, but score reasons
should become machine-readable before MCP formats them.

### `loop_estimate_cost`

| Aspect | Plan |
| --- | --- |
| Core query | `estimatePatternCost(registry, { patternId, level, cadence })` |
| MCP responsibilities | Validate tool args, call core, format existing cost markdown table. |
| Compatibility target | Preserve `patternId`, `level`, optional `cadence`, invalid cadence text, unknown pattern text, and table-style output. |
| New semantic value | Share the same estimate policy as `zj-loop-cost`; warnings become structured in `meta.warnings`. |
| Tests | Existing `loop_estimate_cost tool computes a cost table`; add parity test with core estimate fixture once implemented. |

Important: the current MCP estimate mix differs from `zj-loop-cost`. During
implementation, choose the `zj-loop-cost` estimator as the canonical policy and
update MCP tests intentionally.

## Evidence-Only Tools

These tools should not be forced through P0 semantic queries:

| Tool | Keep as | Later path |
| --- | --- | --- |
| `loop_list_skills` | Resolver/evidence adapter output. | Move to `LoopProjectEvidence.skills` when evidence model is implemented. |
| `loop_get_skill` | Raw markdown lookup. | Keep as raw resource-style tool unless a future context-pack query selects relevant skills. |
| `loop_list_state_files` | Resolver/evidence adapter output. | Move to `LoopProjectEvidence.stateFiles`. |
| `loop_get_state` | Raw state markdown lookup. | Keep raw; future `getLoopStateEvidence()` can select relevant paths but should not read content. |

This separation avoids pretending that every file read is a semantic query.

## Resource Compatibility

No resource URI should be removed during the first semantic migration.

| Resource | Compatibility requirement |
| --- | --- |
| `loop://registry` | Continue returning full registry JSON for auditability. |
| `loop://config` | Continue returning raw `LOOP.md`. |
| `loop://budget` | Continue returning raw `loop-budget.md`. |
| `loop://run-log` | Continue returning raw `loop-run-log.md`. |
| `loop://safety` | Continue returning raw safety docs. |
| `loop://patterns/{patternId}` | Continue returning raw pattern docs, even after `loop_get_pattern` becomes semantic. |
| `loop://skills/{skillName}` | Continue returning raw skill docs. |
| `loop://state/{stateFile}` | Continue returning raw state docs. |

Semantic tools answer "what does this mean?" Resources answer "show me the
source."

## Implementation Sequence For `1-6-4`

1. Add core semantic query module in `1-6-3`.
2. Add MCP formatting helpers for summary, profile, recommendation, and cost
   results.
3. Replace `loop_list_patterns` projection with `listPatternSummaries()`.
4. Replace `loop_get_pattern` metadata/doc assembly with `getPatternProfile()`
   plus formatter.
5. Replace `loop_recommend_pattern` inline scoring with `recommendPatterns()`.
6. Replace `loop_estimate_cost` inline estimate with `estimatePatternCost()`.
7. Leave skill/state/raw resources on resolver paths.
8. Run MCP stdio tests and full tool gates.

This order starts with the least behaviorally risky query and leaves the cost
policy migration until after the canonical estimator is in core.

## Compatibility Risks

| Risk | Mitigation |
| --- | --- |
| Existing clients parse exact JSON field names from `loop_list_patterns`. | Keep adapter output snake_case during first migration. |
| MCP cost output changes because core adopts `zj-loop-cost` policy. | Record intentional parity decision and update tests with before/after fixture. |
| Recommendation ranking changes. | Add deterministic recommendation contract tests before swapping MCP implementation. |
| Unknown pattern errors change shape. | MCP formatter should preserve current plain-text error while core returns typed errors. |
| Core query errors leak as stack traces. | MCP adapter must convert typed errors to text content responses. |

## Proposed Future Additive Tools

Do not add these in the compatibility migration. They become useful after P0
mapping is stable:

| Tool | Core query |
| --- | --- |
| `loop_get_pattern_profile` | `getPatternProfile()` returning structured JSON. |
| `loop_list_required_skills` | `listRequiredSkills()` |
| `loop_build_context_pack` | `buildLoopContextPack()` |
| `loop_assess_readiness` | `assessLoopReadiness()` |
| `loop_explain_human_gates` | `explainHumanGates()` |

The existing tools stay as the broad, backwards-compatible surface. New tools
can expose more structured semantics without surprising old clients.

## Done Criteria For Mapping

`1-6-2-4` is complete when:

- every current MCP resource/tool is categorized as raw resource, evidence tool,
  or semantic adapter
- every P0 semantic query has a target MCP tool or explicit non-MCP consumer
- compatibility risks are documented
- `1-6-4` has an implementation order that preserves current tool names

Test gate follow-up: see `docs/core-semantic-query-test-gates.md` for the
contract, parity, and MCP compatibility gates that should protect this
migration.
