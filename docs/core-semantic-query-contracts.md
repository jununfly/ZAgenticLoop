# Core Semantic Query Contracts

This document designs transport-neutral contracts for the P0
`@jununfly/zj-loop-core` semantic query APIs.

It is a design artifact only. It does not introduce runtime code.

## Contract Principles

1. Return structured data first. MCP, CLI, docs, and future agents can format it
   differently.
2. Preserve explainability. Rankings and warnings must include machine-readable
   reasons and sources, not only scores or prose.
3. Keep P0 registry-first. The first implementation should work from
   `PatternRegistry` and optional pattern markdown text, without project
   evidence or readiness scoring.
4. Keep missing data explicit. Optional docs, unknown patterns, and empty matches
   should be represented consistently.
5. Keep formatters outside query functions. Human-facing markdown/text helpers
   can live near adapters or in a separate formatter module.

## Shared Types

```ts
export type ReadinessLevel = 'L1' | 'L2' | 'L3';

export type SemanticSeverity = 'info' | 'warn' | 'error';

export interface SemanticSourceRef {
  kind:
    | 'registry'
    | 'pattern-doc'
    | 'cost-policy'
    | 'recommendation-policy'
    | 'derived';
  path?: string;
  field?: string;
  patternId?: string;
}

export interface SemanticReason {
  code: string;
  message: string;
  scoreImpact?: number;
  source?: SemanticSourceRef;
}

export interface SemanticWarning {
  code: string;
  severity: SemanticSeverity;
  message: string;
  source?: SemanticSourceRef;
}

export interface SemanticQueryMeta {
  query: string;
  policyVersion: 1;
  sources: SemanticSourceRef[];
  warnings: SemanticWarning[];
}
```

`SemanticQueryMeta` gives adapters a stable place to surface warnings, cited
facts, and policy versions. It also gives tests a narrow contract to assert
without snapshotting entire markdown responses.

## Pattern Summaries

```ts
export interface PatternSummary {
  id: string;
  name: string;
  goal?: string;
  cadence: string;
  risk?: string;
  weekOneMode?: string;
  tokenCostTier: string;
  stateFile?: string;
  requiredSkills: string[];
  humanGates: string[];
  starter?: string;
}

export interface ListPatternSummariesResult {
  meta: SemanticQueryMeta;
  patterns: PatternSummary[];
}

export function listPatternSummaries(
  registry: PatternRegistry,
): ListPatternSummariesResult;
```

The result is intentionally smaller than `RegistryPattern`. It is the stable
card shape for selection UIs, MCP summaries, and docs indexes.

## Pattern Profile

```ts
export interface PatternDocInput {
  path: string;
  text: string;
}

export interface PatternProfileRequest {
  patternId: string;
  patternDoc?: PatternDocInput;
}

export interface PatternProfileResult {
  meta: SemanticQueryMeta;
  pattern: RegistryPattern;
  summary: PatternSummary;
  documentation?: {
    path: string;
    text: string;
    present: true;
  };
}

export type PatternProfileError =
  | { code: 'pattern_not_found'; patternId: string; availablePatternIds: string[] };

export function getPatternProfile(
  registry: PatternRegistry,
  request: PatternProfileRequest,
): PatternProfileResult | PatternProfileError;
```

The profile keeps registry facts and markdown documentation separate. MCP can
still render the old "metadata plus docs" response, but the core query should
not concatenate markdown.

## Pattern Recommendation

```ts
export interface RecommendPatternsRequest {
  useCase: string;
  level?: ReadinessLevel;
  risk?: 'low' | 'medium' | 'high' | string;
  cadence?: string;
  toolTarget?: 'grok' | 'claude' | 'codex' | string;
  limit?: number;
}

export interface PatternRecommendation {
  pattern: PatternSummary;
  score: number;
  confidence: 'low' | 'medium' | 'high';
  reasons: SemanticReason[];
  warnings: SemanticWarning[];
  disqualified: boolean;
}

export interface RecommendPatternsResult {
  meta: SemanticQueryMeta;
  request: RecommendPatternsRequest;
  recommendations: PatternRecommendation[];
}

export function recommendPatterns(
  registry: PatternRegistry,
  request: RecommendPatternsRequest,
): RecommendPatternsResult;
```

Recommendations should remain useful even when every score is low. Empty
recommendation lists should be reserved for empty registries or explicit
disqualification rules, not weak text matches.

## Cost Estimate

The current `zj-loop-cost` estimator already has a good numerical structure.
The core contract should preserve that shape while making warnings and policy
sources structured.

```ts
export interface EstimatePatternCostRequest {
  patternId: string;
  level: ReadinessLevel;
  cadence?: string;
  conservative?: boolean;
}

export interface TokenScenario {
  tokensPerRun: number;
  tokensPerDay: number;
}

export interface RealisticTokenScenario extends TokenScenario {
  assumptions: string;
  mix: {
    noop: number;
    report: number;
    action: number;
  };
}

export interface PatternCostEstimate {
  patternId: string;
  patternName: string;
  cadence: string;
  level: ReadinessLevel;
  runsPerDay: number;
  tokenCostTier: string;
  suggestedDailyCap: number;
  earlyExitRequired: boolean;
  scenarios: {
    noop: TokenScenario;
    report: TokenScenario;
    action: TokenScenario;
    realistic: RealisticTokenScenario;
  };
}

export interface EstimatePatternCostResult {
  meta: SemanticQueryMeta;
  estimate: PatternCostEstimate;
}

export type EstimatePatternCostError =
  | { code: 'pattern_not_found'; patternId: string; availablePatternIds: string[] }
  | { code: 'invalid_level'; level: string; validLevels: ReadinessLevel[] }
  | { code: 'invalid_cadence'; cadence: string; message: string };

export function estimatePatternCost(
  registry: PatternRegistry,
  request: EstimatePatternCostRequest,
): EstimatePatternCostResult | EstimatePatternCostError;
```

The formatter can still render the existing CLI table. The core result should
make warnings such as high cadence, cap exceedance, and early-exit requirements
available in `meta.warnings`.

## Required Skills

```ts
export interface RequiredSkill {
  name: string;
  source: SemanticSourceRef;
  required: true;
}

export interface ListRequiredSkillsResult {
  meta: SemanticQueryMeta;
  patternId: string;
  skills: RequiredSkill[];
}

export type ListRequiredSkillsError =
  | { code: 'pattern_not_found'; patternId: string; availablePatternIds: string[] };

export function listRequiredSkills(
  registry: PatternRegistry,
  patternId: string,
): ListRequiredSkillsResult | ListRequiredSkillsError;
```

P0 treats registry `skills` as required because the registry has no optional
skill tier yet. If optional/recommended skills become necessary later, the
registry schema should change first.

## Error Strategy

P0 query functions should return typed domain errors for expected user/data
problems:

- unknown pattern id
- invalid readiness level
- invalid cadence string
- empty registry

Unexpected programmer errors, invalid registry schema, or malformed loaded YAML
should still throw at registry loading time. The semantic query layer should not
re-validate every registry field already guaranteed by `loadPatternRegistry()`.

## Formatter Boundary

Adapters can provide helpers like:

```ts
export function formatPatternSummariesMarkdown(result: ListPatternSummariesResult): string;
export function formatRecommendationsMarkdown(result: RecommendPatternsResult): string;
export function formatCostEstimateMarkdown(result: EstimatePatternCostResult): string;
```

These helpers are not semantic queries. They can live in adapter packages or a
transport-neutral formatting module, but the core contracts above must remain
usable without markdown.

## Compatibility Notes

| Current surface | New core query | Adapter behavior |
| --- | --- | --- |
| `loop_list_patterns` | `listPatternSummaries()` | Render `patterns` as JSON or markdown summary. |
| `loop_get_pattern` | `getPatternProfile()` | Preserve metadata-plus-docs text by formatting separate fields. |
| `loop_recommend_pattern` | `recommendPatterns()` | Preserve top-3 recommendations while exposing reasons. |
| `loop_estimate_cost` | `estimatePatternCost()` | Preserve existing cost table shape through formatter. |
| `zj-loop-cost` estimator | `estimatePatternCost()` | CLI can move to core result plus existing human formatter. |

## Contract Test Shape

P0 contract tests should assert:

- summary projection does not leak all registry fields
- unknown pattern ids return typed errors with available ids
- recommendation includes stable reason codes for common inputs like `ci`,
  `dependencies`, `issue triage`, and `changelog`
- cost estimate matches current `zj-loop-cost` numerical outputs
- invalid cadence returns a typed error
- formatter tests are separate from semantic query tests

These tests should use a minimal inline registry fixture plus one full
`patterns/registry.yaml` integration test.

Boundary follow-up: see `docs/core-semantics-evidence-boundary.md` for the
ownership split between pure semantic queries, project evidence adapters,
readiness policy, and MCP/CLI formatting.

MCP adapter follow-up: see `docs/mcp-core-semantic-adapter-map.md` for the
compatibility-preserving mapping from current MCP tools to core semantic
queries.
