# Readiness Rule Schema Draft

This draft defines a declarative rule format for the current
`zj-loop-audit` readiness policy. It is a design artifact, not a runtime
implementation. The next implementation slice can turn this into a typed
schema, evaluator, and generated docs/simulator data.

## Goals

- Preserve current audit behavior before changing implementation.
- Separate project evidence gathering from readiness policy.
- Make score weights, level gates, assessments, findings, and recommendations
  inspectable data.
- Give CLI, docs, MCP, and future UI a shared policy source.
- Keep the schema small enough to evaluate without arbitrary code execution.

## Non-goals

- Do not move filesystem probing into the rule engine.
- Do not add a general expression language or JavaScript callbacks.
- Do not replace `computeScore` in this design slice.
- Do not solve pattern-specific scoring yet.

## Placement

Recommended first real schema file:

```text
tools/zj-loop-audit/rules/readiness.v1.yaml
```

Recommended future package boundary:

```text
@jununfly/zj-loop-core
  project evidence primitives

@jununfly/zj-loop-audit
  readiness rule schema
  readiness evaluator
  CLI presentation
```

The rule engine consumes a `LoopSignals`-like evidence object. It should not
read project files directly.

## Top-level Shape

```yaml
schemaVersion: 1
id: loop-readiness
description: ZAgenticLoop readiness policy

score:
  base: 10
  clamp:
    min: 0
    max: 100
  contributions: []

derived: []
levels: []
assessments: []
findings: []
```

Top-level ordering is meaningful only for `assessments` and `findings`.
Everything else is keyed by explicit ids.

## Predicate Language

Predicates should be simple data structures over an evidence object plus derived
values. The evaluator should support only these operators in v1:

```yaml
{ path: stateFile.present }
{ not: { path: cost.budgetDoc } }
{ all: [{ path: cost.budgetDoc }, { path: cost.runLog }] }
{ any: [{ path: triage.present }, { path: verifier.present }] }
{ eq: [{ path: skills.count }, 1] }
{ gte: [{ path: score }, 78] }
{ includes: [{ path: skills.loopSkills }, loop-verifier] }
{ derived: costReady }
```

Rules:

- `path` reads from the evidence object.
- `derived` reads from named derived predicates.
- `score` is available only after score evaluation.
- Unknown paths fail closed in development and tests.
- Unknown paths in released CLI should produce an invalid-policy error, not a
  silent false.
- Predicate objects must contain exactly one operator.

## Derived Predicates

Derived predicates make L3 policy explicit instead of hiding it inside
`computeScore`.

```yaml
derived:
  - id: costReady
    when:
      all:
        - { path: cost.budgetDoc }
        - { path: cost.runLog }
        - { path: cost.loopMdBudget }

  - id: hasRealActivity
    when:
      path: loopActivity.present

  - id: l3Ready
    when:
      all:
        - { derived: costReady }
        - { derived: hasRealActivity }
```

Derived predicates are evaluated before score and level selection. They must be
acyclic.

## Score Contributions

Most score rules are additive booleans.

```yaml
score:
  base: 10
  clamp: { min: 0, max: 100 }
  contributions:
    - id: stateFile
      points: 18
      when: { path: stateFile.present }

    - id: triage
      points: 14
      when: { path: triage.present }
```

The current `skillsTwoPlus` versus `skillsOne` behavior needs an exclusive
group so both cannot fire:

```yaml
    - id: skillsTwoPlus
      group: skillsCount
      priority: 20
      points: 14
      when:
        gte: [{ path: skills.count }, 2]

    - id: skillsOne
      group: skillsCount
      priority: 10
      points: 7
      when:
        eq: [{ path: skills.count }, 1]
```

Within the same `group`, only the first matching rule after sorting by descending
`priority` contributes points. Rules without a group are independently additive.

## Level Gates

Levels should be evaluated from highest to lowest. The first matching level
wins.

```yaml
levels:
  - id: L3
    minScore: 78
    when:
      all:
        - { path: stateFile.present }
        - { path: verifier.present }
        - { derived: l3Ready }

  - id: L2
    minScore: 58
    when:
      path: triage.present

  - id: L1
    minScore: 38
    when:
      path: stateFile.present

  - id: L0
    minScore: 0
    when: { const: true }
```

The explicit `L0` fallback keeps the rule set total and easy to test.

## Assessment Bands

Assessment order must remain explicit because current behavior depends on
branch order. For example, missing cost readiness is reported before missing
activity when both are absent.

```yaml
assessments:
  - id: strong-l3
    when:
      all:
        - { gte: [{ path: score }, 82] }
        - { derived: l3Ready }
    message: Strong loop readiness - good candidate for L3 with explicit gates.

  - id: missing-cost-observability
    when:
      all:
        - { gte: [{ path: score }, 82] }
        - { not: { derived: costReady } }
    message: Strong signals but missing cost observability.

  - id: missing-real-activity
    when:
      all:
        - { gte: [{ path: score }, 82] }
        - { not: { derived: hasRealActivity } }
    message: Strong structure but no proven loop runs yet.
```

The evaluator chooses the first matching assessment.

## Findings And Recommendations

Findings are presentation rules over evidence. They can emit a finding and zero
or more recommendations.

```yaml
findings:
  - id: missing-state-file
    level: fail
    when:
      not: { path: stateFile.present }
    message: No state file (STATE.md or pattern-specific state).
    recommendations:
      - Copy starters/minimal-loop/STATE.md.example to STATE.md

  - id: state-file-present
    level: ok
    when:
      path: stateFile.present
    message:
      template: "State file(s): {stateFile.paths}"

  - id: missing-loop-constraints-skill
    level: warn
    when:
      all:
        - { path: constraints.present }
        - { not: { path: constraints.hasConstraintsSkill } }
    message: loop-constraints.md exists but no loop-constraints skill.
    recommendations:
      - Add loop-constraints skill via zj-loop-init or templates/SKILL.md.loop-constraints
```

Templating should be deliberately tiny:

- `{stateFile.paths}` joins arrays with `, `.
- `{loopActivity.evidence.length}` exposes array length.
- Missing template paths are invalid policy errors.

## Current Score Mapping

This table maps current `SCORE_WEIGHTS` into rule ids:

| Rule id | Points | Predicate |
| --- | ---: | --- |
| `stateFile` | 18 | `stateFile.present` |
| `triage` | 14 | `triage.present` |
| `loopConfig` | 9 | `loopConfig.present` |
| `agentsMd` | 9 | `agentsMd.present` |
| `skillsTwoPlus` | 14 | `skills.count >= 2` |
| `skillsOne` | 7 | `skills.count == 1` |
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

## Compatibility Tests For The Implementation Slice

The first runtime migration should include golden tests that compare the current
imperative implementation and the declarative evaluator for the existing
fixtures:

- Empty project stays `L0`, score below 40.
- State plus triage stays `L1`.
- Full L2 signals stay `L2`.
- L3 requires verifier, state, cost readiness, and activity.
- High score without cost observability stays capped at `L2`.
- High score without activity stays capped at `L2`.
- The before/after demo preserves the same three displayed stage scores and
  levels.

The implementation can initially run both engines in tests while keeping the
imperative engine in production.

## Docs And Simulator Strategy

`docs/index.html` currently contains a hand-maintained client-side scoring port.
The rule schema should become the source for one of these:

1. A generated static JSON manifest embedded in docs.
2. A small generated JavaScript data module used by the simulator.
3. A docs-only simplified manifest explicitly marked as non-canonical.

Recommended path: generate a static JSON manifest from the same rule file during
docs build. Until that exists, the simulator should continue to be treated as a
demo and not a policy source.

## Migration Plan

1. Add `tools/zj-loop-audit/rules/readiness.v1.yaml` from this draft.
2. Add a strict parser and validator for the rule schema.
3. Add a pure evaluator that accepts `LoopSignals` and returns score, level,
   assessment, findings, and recommendations.
4. Add parity tests against current `computeScore` and `auditProject` fixtures.
5. Switch `computeScore` internals to the evaluator while keeping the public API.
6. Switch findings/recommendations to the evaluator.
7. Generate docs simulator data from the rule file.

## Open Questions

- Should unused fields such as `patterns.documented` and `starters.used` be
  removed before schema migration, or represented as reserved evidence?
- Should `loopActivity` remain one composite signal, or should each evidence
  source become its own rule-visible field?
- Should recommendation text live in the policy file, or should the policy file
  emit stable recommendation ids that a renderer maps to copy?
- Should pattern-specific readiness rules be a later overlay file, such as
  `readiness.patterns.v1.yaml`?
