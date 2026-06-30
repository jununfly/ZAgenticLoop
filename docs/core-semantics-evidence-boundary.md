# Core Semantics And Evidence Boundary

This document defines the boundary between semantic loop queries, project
evidence collection, readiness policy, and transport adapters.

It is a design artifact for `1-6-2-3`. It does not migrate runtime code.

## Boundary Rule

Core semantic queries should be pure domain computations over explicit inputs.
Project evidence adapters may read local project state and normalize facts.
Transport adapters may resolve roots, validate protocol input, and format
responses.

In short:

- semantics answers "what does this mean for loop working?"
- evidence answers "what facts exist in this project?"
- transport answers "how does this client ask and receive the answer?"

## Ownership Matrix

| Layer | Owns | Must not own |
| --- | --- | --- |
| Core registry model | `PatternRegistry`, `RegistryPattern`, schema validation, registry parsing. | Filesystem root discovery, MCP/CLI formatting, user-facing process exits. |
| Core evidence primitives | `ProjectFileSystem`, safe project-relative existence/read/list helpers, skill-name discovery primitives. | Policy decisions such as score weights, L0-L3 thresholds, pattern recommendations. |
| Project evidence adapters | Normalized facts such as state files present, skill docs found, budget/run-log docs present, safety docs present, workflow hints. | Ranking, recommendation, cost policy, action permission. |
| Core semantic queries | Pattern summaries, pattern profile projection, recommendations, cost estimates, required skills, future readiness orchestration over supplied evidence. | Direct file reads, Git/GitHub execution, MCP resource registration, CLI argv parsing. |
| Readiness policy | Score weights, level thresholds, findings, recommendations, compatibility with existing audit output. | Low-level file scanning or protocol formatting. |
| MCP adapter | MCP resources/tools, `LOOP_PROJECT_ROOT`, stdio transport, tool input schemas, markdown/JSON response formatting. | Domain policy and duplicate cost/recommendation algorithms. |
| CLI adapters | argv parsing, help/errors, exit codes, human-readable formatting. | Domain policy and filesystem facts not exposed through evidence adapters. |

## Current Code Placement

| Concern | Current location | Boundary assessment |
| --- | --- | --- |
| Registry parsing and types | `tools/zj-loop-core/src/registry.ts` | Correct owner. |
| Project filesystem primitive | `tools/zj-loop-core/src/project.ts` | Correct low-level primitive, but not yet a full loop evidence model. |
| Skill-name discovery | `tools/zj-loop-core/src/project.ts` | Acceptable primitive; higher-level required/missing skill semantics should be query/policy. |
| Readiness signals and scoring | `tools/zj-loop-audit/src/auditor.ts` | Correct for now; migration should be separate because it affects user-visible scores. |
| Cost estimate policy | `tools/zj-loop-cost/src/estimator.ts`, duplicated partly in MCP | Should move into core semantic queries during `1-6-3`. |
| MCP project reads | `tools/zj-loop-mcp-server/src/resolver.ts` | Correct adapter owner for MCP-specific resource reads; semantic ranking/cost should leave this layer. |
| MCP recommendation heuristic | `tools/zj-loop-mcp-server/src/index.ts` | Should move into core semantic queries. |

## Evidence Model Boundary

Evidence should be normalized enough that semantic queries do not parse prose or
walk the filesystem themselves.

```ts
export interface LoopProjectEvidence {
  rootLabel?: string;
  stateFiles: EvidenceFile[];
  loopConfig?: EvidenceFile;
  budgetDoc?: EvidenceFile;
  runLog?: EvidenceFile;
  safetyDocs: EvidenceFile[];
  constraintsDoc?: EvidenceFile;
  skills: EvidenceSkill[];
  agentsDocs: EvidenceFile[];
  githubWorkflows: EvidenceFile[];
  mcpConfigFiles: EvidenceFile[];
  activityHints: EvidenceHint[];
}

export interface EvidenceFile {
  path: string;
  present: boolean;
  source: 'filesystem' | 'adapter';
}

export interface EvidenceSkill {
  name: string;
  path?: string;
  source: 'skills-dir' | 'agent-file' | 'adapter';
}

export interface EvidenceHint {
  kind: 'state' | 'run-log' | 'workflow' | 'git' | 'loop-config';
  message: string;
  sourcePath?: string;
}
```

This shape is intentionally about facts, not conclusions. For example,
`budgetDoc.present` is evidence; "L3 is blocked because cost observability is
incomplete" is readiness policy.

## Semantic Query Boundary

P0 semantic queries should remain registry-first and pure:

| Query | Allowed inputs | Forbidden behavior |
| --- | --- | --- |
| `listPatternSummaries()` | `PatternRegistry` | Read pattern docs or project files. |
| `getPatternProfile()` | `PatternRegistry`, optional doc input | Resolve paths or read docs itself. |
| `recommendPatterns()` | `PatternRegistry`, request object | Read project state or inspect MCP config. |
| `estimatePatternCost()` | `PatternRegistry`, request object | Read budget docs or mutate run logs. |
| `listRequiredSkills()` | `PatternRegistry`, pattern id | Check whether skills are installed. |

P1 queries may accept `LoopProjectEvidence`, but should still avoid direct file
I/O:

| Query | Allowed inputs | Boundary |
| --- | --- | --- |
| `assessLoopReadiness()` | registry, pattern id, level, evidence | Computes findings from supplied facts. |
| `listMissingReadinessEvidence()` | registry, pattern id, level, evidence | Computes missing facts; does not scan files. |
| `getLoopStateEvidence()` | registry, pattern id, evidence | Selects relevant state evidence; does not open state files. |
| `buildLoopContextPack()` | registry, pattern id, task, evidence | Plans what to read; does not read it. |

## Readiness Policy Boundary

Readiness policy is not the same as evidence collection.

The existing audit tool combines:

- evidence collection: files, skills, workflows, activity hints
- policy: score weights, L0-L3 thresholds, gates
- presentation: findings, recommendations, human text

Future migration should split these carefully:

1. keep current `zj-loop-audit` output stable
2. extract reusable evidence collection only when tests protect parity
3. move policy only after readiness rule schema is settled
4. keep report formatting in audit/CLI adapter code

This avoids accidentally changing audit scores while building MCP semantic
queries.

## MCP Adapter Boundary

The MCP server may continue to own:

- `LOOP_PROJECT_ROOT` resolution
- stdio transport setup
- MCP resource names and tool schemas
- path-segment safety for resource variables
- reading raw resources as escape hatches
- formatting semantic query results into text or JSON content blocks

The MCP server should stop owning:

- keyword recommendation policy
- cost estimation policy
- pattern summary projection details
- future readiness/gate interpretation

Raw MCP resources remain valuable. They should coexist with semantic tools so an
agent can inspect source documents when a structured answer is surprising.

## CLI Adapter Boundary

CLI packages may own:

- help text
- exit codes
- argv parsing
- terminal formatting
- conservative defaults for command UX

CLI packages should consume core semantic outputs for:

- cost estimates
- pattern summaries
- recommendations
- required skills
- future readiness findings

`zj-loop-cost` is the clearest first migration candidate because it already has
good domain logic and a formatter that can be separated.

## Migration Implications

For `1-6-3`, implement the first core semantic module as registry-only:

1. add query types and pure functions in `tools/zj-loop-core`
2. move or mirror cost estimation policy from `zj-loop-cost`
3. add contract tests around registry fixtures
4. do not move readiness scoring yet
5. do not make MCP the first owner of new semantics

For `1-6-4`, make MCP tools call those core functions and preserve current tool
names.

For later readiness work, introduce `LoopProjectEvidence` as the stable bridge
between scanners and policy.

## Anti-Boundaries

These are signs the architecture is drifting:

- a semantic query accepts `root: string`
- a core query calls `readFile`, `readdir`, `execSync`, `process.cwd`, or
  `process.env`
- MCP handlers compute recommendation scores directly
- CLI tools duplicate cost or recommendation formulas
- evidence adapters emit human recommendations instead of facts
- readiness policy changes without parity tests against current audit output

These anti-boundaries should fail review once `1-6-3` starts implementation.

MCP adapter follow-up: see `docs/mcp-core-semantic-adapter-map.md` for the
compatibility-preserving migration map for current MCP resources and tools.
