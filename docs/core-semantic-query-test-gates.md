# Core Semantic Query Test Gates

This document defines the contract tests and migration gates for the future
`@jununfly/zj-loop-core` semantic query API and MCP adapter migration.

It is a design artifact for `1-6-2-5`. It does not introduce runtime code.

## Gate Principle

The migration must be protected at four layers:

1. core semantic contract tests
2. canonical cost policy parity tests
3. MCP stdio compatibility tests
4. repo-level tool gates

No implementation slice should rely on broad snapshot diffs alone. Tests should
assert stable structured contracts, reason codes, warning codes, and current
adapter compatibility.

## Current Coverage Baseline

| Area | Current coverage | Gap |
| --- | --- | --- |
| Registry parsing | `tools/zj-loop-core/test/registry.test.mjs` validates schemaVersion, YAML/JSON parity, missing fields, unknown fields. | No semantic query contract tests yet. |
| Project primitives | `tools/zj-loop-core/test/project.test.mjs` covers project filesystem and skill names. | No normalized `LoopProjectEvidence` contract yet. |
| Cost estimator | `tools/zj-loop-cost/test/estimator.test.mjs` covers cadence, levels, warnings, realistic scenario. | Policy is not yet canonical in core; MCP has a different inline mix. |
| MCP server | `tools/zj-loop-mcp-server/test/server.test.mjs` covers tool list, `loop_list_patterns`, `loop_estimate_cost`, raw pattern resource. | No compatibility checks for recommendation ranking, unknown pattern errors, or profile formatting. |
| Repo gates | `build:tools`, `test:tools`, audit CLI, before-after demo. | Need explicit migration gate order for semantic query slices. |

## Core Semantic Contract Tests

Add a new test file in the core package:

```text
tools/zj-loop-core/test/semantic.test.mjs
```

Minimum contract tests:

| Query | Required assertions |
| --- | --- |
| `listPatternSummaries()` | Returns one summary per registry pattern; exposes `id`, `name`, `cadence`, `tokenCostTier`, `requiredSkills`, `humanGates`; does not leak full `cost` object or `init` object. |
| `getPatternProfile()` | Returns typed profile for known pattern; separates `pattern`, `summary`, and optional `documentation`; unknown id returns `pattern_not_found` with available ids. |
| `recommendPatterns()` | Returns deterministic top result and reason codes for `ci`, `dependencies`, `issue triage`, `changelog`, `review PR`; weak matches still return ranked candidates rather than empty output. |
| `estimatePatternCost()` | Returns structured estimate, warning codes, `meta.sources`, and typed errors for unknown pattern, invalid level, and invalid cadence. |
| `listRequiredSkills()` | Returns registry skills as required skills; unknown pattern returns typed error. |

Contract tests should use:

- one minimal inline registry fixture for narrow tests
- the real `patterns/registry.yaml` for one integration-style test
- exact reason/warning codes, not long prose snapshots

## Reason And Warning Codes

The first implementation should introduce stable codes so adapters can format
human text without becoming the test oracle.

Recommended initial reason codes:

| Code | Meaning |
| --- | --- |
| `match.id` | Use case matched pattern id. |
| `match.name` | Use case matched pattern name. |
| `match.goal` | Use case matched pattern goal. |
| `match.skill` | Use case matched required skill. |
| `match.phase` | Use case matched pattern phase. |
| `boost.ci` | CI-specific boost applied. |
| `boost.pr` | PR/review-specific boost applied. |
| `boost.dependency` | Dependency update boost applied. |
| `boost.issue` | Issue triage boost applied. |
| `boost.changelog` | Changelog/release-note boost applied. |

Recommended initial warning codes:

| Code | Meaning |
| --- | --- |
| `cost.early_exit_required` | Pattern requires early-exit behavior. |
| `cost.action_exceeds_daily_cap` | Action-every-run scenario exceeds cap. |
| `cost.realistic_exceeds_daily_cap` | Realistic blend exceeds cap. |
| `cost.high_cadence` | Runs/day is high enough to require monitoring. |
| `input.invalid_cadence` | Cadence string cannot be parsed. |
| `input.invalid_level` | Readiness level is not L1/L2/L3. |

Codes may expand later, but P0 tests should freeze the initial set used by MCP
formatters.

## Cost Policy Parity Gate

`zj-loop-cost` should become the canonical policy source for cost calculations.

Implementation gate:

1. Move or mirror cost estimator logic into `@jununfly/zj-loop-core`.
2. Add core tests proving the same numerical output as the existing
   `zj-loop-cost` tests.
3. Update `zj-loop-cost` to consume core cost queries or shared core estimator.
4. Keep `zj-loop-cost` human formatter tests separate from core semantic tests.
5. Update MCP cost expectations intentionally if the old MCP inline mix differs.

Required parity assertions:

- `5m-15m` defaults to fastest cadence unless conservative mode is set
- conservative mode chooses the slower cadence
- L1/L2/L3 realistic mixes match the canonical estimator
- early-exit warnings match canonical warning codes
- invalid cadence is a typed semantic error before formatting

## MCP Compatibility Tests

Extend `tools/zj-loop-mcp-server/test/server.test.mjs` as MCP migration proceeds.

Compatibility tests should assert:

| Tool | Required compatibility |
| --- | --- |
| `tools/list` | Tool names and count remain stable unless intentionally changed in a dedicated compatibility decision. |
| `loop_list_patterns` | Existing JSON parse succeeds; legacy fields remain present in snake_case during first migration. |
| `loop_get_pattern` | Known pattern response still includes `Registry Metadata` and `Pattern Documentation`; unknown id returns plain text with available ids. |
| `loop_recommend_pattern` | Top recommendation remains deterministic for common use cases; output includes old visible fields. |
| `loop_estimate_cost` | Markdown table remains recognizable; invalid cadence and unknown pattern return content responses, not thrown server errors. |
| Raw resources | `loop://registry`, `loop://patterns/{id}`, `loop://skills/{name}`, and `loop://state/{file}` keep working. |

MCP tests should not assert the entire markdown body. They should assert stable
anchors and parse structured JSON where the current surface already returns
JSON.

## Migration Gate Order

### Gate A: Before `1-6-3` Implementation

Required:

```bash
npm run validate:registry
python /Users/bilibili/.codex/skills/zj-roadmap-driven/roadmap_cli.py validate docs/plans/architecture-improvement-roadmap.json
git diff --check
```

Purpose: ensure design source and registry are stable before adding code.

### Gate B: During `1-6-3` Core Module

Required:

```bash
cd tools/zj-loop-core && npm run build && npm test
npm run test:zj-loop-cost
```

Purpose: prove core semantic contracts and cost parity before any MCP adapter
switch.

### Gate C: During `1-6-4` MCP Adapter Migration

Required:

```bash
npm run test:zj-loop-core
npm run test:zj-loop-cost
npm run test:zj-loop-mcp-server
```

Purpose: protect core query contracts, canonical cost behavior, and MCP stdio
compatibility together.

### Gate D: Before Committing Implementation Slices

Required:

```bash
npm run validate:registry
npm run build:tools
npm run test:tools
cd tools/zj-loop-audit && npm run build && node dist/cli.js ../../
bash scripts/before-after-demo.sh
git diff --check
python /Users/bilibili/.codex/skills/zj-roadmap-driven/roadmap_cli.py validate docs/plans/architecture-improvement-roadmap.json
```

Purpose: protect the whole tool family and user-visible readiness demo.

## Fixture Strategy

Use three fixture scopes:

| Scope | Use |
| --- | --- |
| Inline minimal registry | Fast contract tests for one or two patterns. |
| Full repo registry | Integration check against `patterns/registry.yaml`. |
| MCP temporary project | End-to-end stdio tests with registry, pattern docs, skills, state, LOOP, budget, run log, safety docs. |

Do not reuse large MCP fixtures for all core tests. Core semantic tests should
remain fast and deterministic.

## Failure Policy

If a migration intentionally changes behavior:

1. record the decision in roadmap before the code change
2. update the relevant design doc
3. add before/after fixture evidence
4. update tests in the same commit as the implementation

This especially applies to:

- recommendation ranking changes
- MCP cost estimate changing to canonical `zj-loop-cost` behavior
- MCP output field-name changes
- readiness score or level changes

## Done Criteria For `1-6-2-5`

This node is complete when:

- contract test categories are listed for every P0 semantic query
- cost policy parity requirements are explicit
- MCP compatibility tests are specified by current tool
- migration gates are ordered for `1-6-3`, `1-6-4`, and commit-time verification
- fixture strategy and intentional behavior-change policy are documented
