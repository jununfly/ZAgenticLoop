# Readiness Signal Inventory

This inventory captures the current `zj-loop-audit` readiness model before a
declarative rules engine is introduced. It is intentionally descriptive: it
documents the existing behavior and the places where policy is embedded today.

## Runtime Sources

| Source | Role | Current status |
| --- | --- | --- |
| `tools/zj-loop-audit/src/auditor.ts` | Canonical audit behavior: evidence gathering, scoring, level gates, findings, recommendations | Primary source |
| `tools/zj-loop-core/src/project.ts` | Shared project filesystem and evidence primitives | Fact gathering only |
| `tools/zj-loop-audit/test/auditor.test.mjs` | Regression coverage for score and level gates | Partial policy coverage |
| `docs/index.html` readiness simulator | Client-side demo of readiness scoring | Simplified port; can drift |
| `docs/loop-design-checklist.md` | Human checklist and level narrative | Conceptual source |
| `docs/zj-adr/ZJ-0001-l3-requires-operational-proof.md` | L3 operational-proof decision | Policy rationale |

## Signal Model

`LoopSignals` is the audit boundary between project evidence and readiness
policy. Most fields are booleans, but a few carry names or paths for display.

| Signal | Evidence source today | Used for score | Used for level gate | Used for findings/recommendations |
| --- | --- | ---: | ---: | ---: |
| `stateFile.present` / `paths` | Known state filenames such as `STATE.md`, `*-state.md` | Yes | L1, L3 | Yes |
| `loopConfig.present` / `path` | `LOOP.md` | Yes | No | Yes |
| `skills.count` / `loopSkills` | Skill dirs under `.grok`, `.claude`, `.codex`, `skills`; verifier agents | Yes | Indirect | Yes |
| `verifier.present` | `loop-verifier` skill or verifier agent | Yes | L3 | Yes |
| `triage.present` | Any known triage skill | Yes | L2 | Yes |
| `agentsMd.present` | `AGENTS.md` or `CLAUDE.md` | Yes | No | Yes |
| `patterns.documented` | Currently mirrors `LOOP.md` presence | No | No | No |
| `safety.loopMdMentionsSafety` | Keyword match in `LOOP.md` | Yes | No | Yes |
| `safety.safetyDocPresent` | `safety.md`, `docs/safety.md`, or `SECURITY.md` | Yes | No | Yes |
| `starters.used` | `loop-triage` skill present | No | No | No |
| `github.present` | `.github` directory | Yes | No | Yes |
| `github.workflows` | `.github/workflows` directory | Yes | No | Yes |
| `mcp.present` | MCP config files or `LOOP.md` mentions | Yes | No | Yes |
| `worktreeEvidence.present` | Worktree keywords in selected docs | Yes | No | Yes |
| `registry.present` | `patterns/registry.yaml` | Yes | No | Yes |
| `cost.budgetDoc` | `loop-budget.md` | Yes | L3 cost-ready gate | Yes |
| `cost.runLog` | `loop-run-log.md` | Yes | L3 cost-ready gate | Yes |
| `cost.loopMdBudget` | Budget/cap/kill-switch keywords in `LOOP.md` | Yes | L3 cost-ready gate | Yes |
| `cost.budgetSkill` | `loop-budget/SKILL.md` in supported skill roots | Yes | No | Yes |
| `constraints.present` | `loop-constraints.md` | Yes | No | Yes |
| `constraints.hasConstraintsSkill` | `loop-constraints/SKILL.md` in supported skill roots | Yes | No | Yes |
| `loopActivity.present` / `evidence` | State file content, run log, loop workflows, recent git log, `LOOP.md` activity hints | Yes | L3 | Yes |

## Score Weights

The score starts at `10`, then adds the following weights. The final value is
clamped to `0..100`.

| Weight key | Points | Signal |
| --- | ---: | --- |
| `base` | 10 | Always applied |
| `stateFile` | 18 | `stateFile.present` |
| `triage` | 14 | `triage.present` |
| `loopConfig` | 9 | `loopConfig.present` |
| `agentsMd` | 9 | `agentsMd.present` |
| `skillsTwoPlus` | 14 | `skills.count >= 2` |
| `skillsOne` | 7 | `skills.count === 1` |
| `verifier` | 14 | `verifier.present` |
| `safetyLoopMd` | 4 | `safety.loopMdMentionsSafety` |
| `safetyDoc` | 4 | `safety.safetyDocPresent` |
| `github` | 6 | `github.present` |
| `githubWorkflows` | 4 | `github.workflows` |
| `mcp` | 3 | `mcp.present` |
| `worktree` | 3 | `worktreeEvidence.present` |
| `registry` | 2 | `registry.present` |
| `budgetDoc` | 3 | `cost.budgetDoc` |
| `runLog` | 3 | `cost.runLog` |
| `loopMdBudget` | 2 | `cost.loopMdBudget` |
| `budgetSkill` | 2 | `cost.budgetSkill` |
| `constraintsFile` | 4 | `constraints.present` |
| `constraintsSkill` | 2 | `constraints.hasConstraintsSkill` |
| `loopActivity` | 6 | `loopActivity.present` |

## Level Gates

The numeric thresholds are necessary but not sufficient. Each level has
additional gate conditions:

| Level | Numeric threshold | Required gates |
| --- | ---: | --- |
| `L1` | `score >= 38` | `stateFile.present` |
| `L2` | `score >= 58` | `triage.present` |
| `L3` | `score >= 78` | `stateFile.present`, `verifier.present`, cost readiness, real loop activity |

Cost readiness is:

```text
cost.budgetDoc && cost.runLog && cost.loopMdBudget
```

Real activity is:

```text
loopActivity.present
```

This reflects `ZJ-0001`: L3 requires operational proof, not just static project
structure.

## Assessment Bands

The assessment string is derived from the score plus L3 readiness exceptions:

| Condition | Assessment |
| --- | --- |
| `score >= 82 && l3Ready` | Strong loop readiness; candidate for L3 |
| `score >= 82 && !costReady` | Strong signals but missing cost observability |
| `score >= 82 && !hasRealActivity` | Strong structure but no proven loop runs |
| `score >= 62` | Good foundation; add verifier and safety docs |
| `score >= 42` | Early loop setup |
| otherwise | Not loop-ready |

There is a subtle ordering constraint here: `!costReady` is checked before
`!hasRealActivity`, so a project missing both reports the cost-observability
assessment first.

## Findings And Recommendations

Findings are currently imperative branches in `auditProject`. They are not a
pure projection of score weights:

| Area | Missing finding | Positive finding | Recommendation |
| --- | --- | --- | --- |
| State | No state file | State file paths | Copy starter state file |
| Triage | No triage skill | Triage skill present | Install loop-triage |
| Verifier | No loop-verifier | Verifier skill present | Add verifier agent/skill |
| Loop config | No `LOOP.md` | None | Copy starter `LOOP.md` |
| Agent conventions | No `AGENTS.md` / `CLAUDE.md` | None | Add agent conventions |
| Safety in LOOP | `LOOP.md` lacks safety language | None | Document human gates |
| Safety doc | No safety doc | Safety documentation present | Copy/create safety doc |
| Constraints file | No `loop-constraints.md` | Constraints file present | Create constraints file |
| Constraints skill | Constraints file but no skill | None | Add loop-constraints skill |
| GitHub | No `.github`; or no workflows | Workflows present | Add templates/workflows |
| MCP | No connector config or mention | None | Document MCP usage |
| Worktree | Little worktree evidence | None | Add isolation notes |
| Registry | No pattern registry | None | Add `patterns/registry.yaml` |
| Budget doc | No `loop-budget.md` | Budget doc present | Scaffold/copy budget doc |
| Run log | No `loop-run-log.md` | Run log present | Copy run log template |
| LOOP budget | No budget mention in `LOOP.md` | None | Add budget section |
| Budget skill | No loop-budget skill | Budget skill present | Add loop-budget skill |
| Activity | No real run evidence | Activity evidence count | Run one report-only cycle |
| L3 cap | High score but missing cost/activity | None | Explain cap reason |

## Known Drift And Design Pressure

1. `docs/index.html` contains a simplified readiness simulator. It has fewer
   signals than `LoopSignals`, combines safety into one checkbox, omits
   constraints, approximates skill weight, and carries separate recommendation
   text. A future rule schema should make the simulator consume shared data or a
   generated manifest.
2. Some `LoopSignals` fields are unused or aliases today:
   `patterns.documented` and `starters.used` do not affect score or findings.
   They should either become rule inputs or be removed.
3. Evidence detection, score weights, level gates, findings, recommendations,
   and assessment copy all live in one file. This makes behavior easy to read,
   but hard to reuse across CLI, docs, MCP, or future UI.
4. `loopActivity` is a composite signal with several heuristic sources. A rule
   engine should keep the evidence list visible rather than collapsing it too
   early into a boolean.
5. L3 has two policy gates that are more important than points:
   cost observability and operational proof. These should be first-class rule
   concepts, not just score exceptions.

## Schema Design Inputs For 1-4-2

A minimal declarative rule schema should represent:

- Evidence selectors: `stateFile.present`, `cost.budgetDoc`,
  `loopActivity.present`, and similar dotted paths.
- Score contributions: additive weights with optional mutually exclusive
  branches, such as `skillsTwoPlus` vs `skillsOne`.
- Level gates: threshold plus required predicates.
- Findings: missing/positive messages and recommendation text tied to
  predicates.
- Assessment bands: ordered predicates, because current behavior depends on
  branch order.
- Composite evidence: named derived predicates such as `costReady` and
  `l3Ready`.

The rule engine should not own project filesystem probing. That boundary now
belongs in `zj-loop-core` evidence primitives; the rule layer should consume
`LoopSignals` or a successor evidence object.
