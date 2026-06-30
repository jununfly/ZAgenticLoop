# CLI Harness API Draft

This draft defines the smallest shared CLI harness worth building for the
`zj-loop-*` product family. It is a design artifact only; the current CLI
runtime remains unchanged.

## Goals

- Normalize the outer CLI shell: argv parsing, help rendering, error
  presentation, and exit semantics.
- Preserve command-specific business logic and output formatting.
- Make CLI behavior testable without invoking `process.exit`.
- Give every `zj-loop-*` command a consistent product surface.
- Keep the first API small enough to migrate one CLI at a time.

## Non-goals

- Do not introduce a large command framework.
- Do not own registry loading, audit scoring, scaffold copying, or drift
  detection.
- Do not force every command to have the same output modes.
- Do not include `zj-loop-mcp-server` in the first human-facing harness.
- Do not migrate existing CLIs in this design slice.

## Package Boundary

Recommended first implementation:

```text
tools/zj-loop-core/src/cli.ts
```

Why this is acceptable for v1:

- The harness has no third-party dependencies.
- Existing CLI packages already depend on `@jununfly/zj-loop-core` or are
  expected to share core primitives.
- The API is product-family infrastructure, not app-specific behavior.

Future extraction trigger:

```text
@jununfly/zj-loop-cli
```

Extract only if the harness grows beyond parse/help/error/exit, or if it starts
to serve CLIs outside Agentic Loop Working.

## Core Concept

The harness owns the command boundary; the command owns work.

```ts
export function defineCli<TOptions, TPositionals>(
  spec: CliSpec<TOptions, TPositionals>,
): CliProgram<TOptions, TPositionals>;
```

The program can be tested as pure functions:

```ts
const cli = defineCli(spec);
const parsed = cli.parse(['--json', '.']);
const help = cli.renderHelp();
```

The executable wrapper calls:

```ts
await cli.run(process.argv.slice(2), {
  stdout: console.log,
  stderr: console.error,
  exit: (code) => { process.exitCode = code; },
});
```

## Minimal Types

```ts
export type CliExitStatus = 'ok' | 'needsAttention' | 'error';

export interface CliExit {
  status: CliExitStatus;
  code?: number;
}

export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
  exit(code: number): void;
}

export interface CliOptionBase {
  name: string;
  alias?: string;
  description: string;
}

export type CliOption =
  | (CliOptionBase & { type: 'boolean'; defaultValue?: boolean })
  | (CliOptionBase & { type: 'string'; required?: boolean; defaultValue?: string })
  | (CliOptionBase & { type: 'enum'; values: readonly string[]; defaultValue?: string });

export interface CliPositional {
  name: string;
  description?: string;
  required?: boolean;
  defaultValue?: string;
}

export interface CliSpec<TOptions, TPositionals> {
  name: string;
  summary: string;
  usage: string;
  description?: string;
  options: readonly CliOption[];
  positionals?: readonly CliPositional[];
  examples?: readonly string[];
  sections?: readonly CliHelpSection[];
  exitCodes?: readonly CliExitCodeHelp[];
  run(ctx: CliRunContext<TOptions, TPositionals>): Promise<CliRunResult> | CliRunResult;
}

export interface CliRunContext<TOptions, TPositionals> {
  options: TOptions;
  positionals: TPositionals;
  argv: readonly string[];
}

export interface CliRunResult {
  exit?: CliExit;
}
```

The first implementation can use type assertions at the call sites. Strong
generic inference is useful, but not required for the first slice.

## Option Parsing Rules

Supported forms:

```text
--json
-h
--pattern daily-triage
-p daily-triage
--level=L2
```

Rules:

- Unknown options are errors.
- Missing string/enum values are errors.
- A value-taking option cannot consume another flag-like token as its value.
- Duplicate scalar options use the last value.
- Boolean options default to `false` unless `defaultValue` is provided.
- Enum options must match one of `values`.
- `--help` and `-h` should be ordinary metadata-driven options, but the harness
  may short-circuit them before `run`.

Out of scope for v1:

- Variadic positionals.
- Repeated array options.
- Subcommands.
- Environment-variable defaults.
- Shell completion.

## Parse Result

```ts
export type CliParseResult<TOptions, TPositionals> =
  | {
      ok: true;
      options: TOptions;
      positionals: TPositionals;
      rest: readonly string[];
    }
  | {
      ok: false;
      error: CliUsageError;
    };

export interface CliUsageError {
  kind:
    | 'unknown-option'
    | 'missing-option-value'
    | 'invalid-option-value'
    | 'missing-positional'
    | 'too-many-positionals';
  message: string;
}
```

Usage errors should print a concise message plus `Try '<command> --help'.`

## Help Renderer

`renderHelp()` should be deterministic and metadata-driven:

```text
zj-loop-cost - estimate daily token spend for loop patterns

Usage:
  zj-loop-cost --pattern <id> [options]

Options:
  -p, --pattern <id>     Pattern id (default: daily-triage)
  -c, --cadence <spec>   Override cadence
  -h, --help             This help

Examples:
  zj-loop-cost --pattern ci-sweeper --cadence 15m --level L2
```

The harness should support optional sections for command-specific content:

- pattern list (`zj-loop-init`)
- exit codes (`zj-loop-audit`)
- score interpretation (`zj-loop-sync`)
- docs link

It should not require commands to hand-format the full help body.

## Exit Semantics

The harness should map high-level status to numeric code:

| Status | Default code | Meaning |
| --- | ---: | --- |
| `ok` | 0 | Command completed successfully |
| `needsAttention` | 2 | Command succeeded but found a problem, warning, or below-threshold result |
| `error` | 1 | Usage error or thrown runtime failure |

Commands may override the numeric code in `CliRunResult.exit.code`, but the
shared names should become the product language.

Current mappings:

- `zj-loop-audit`: score below 40 -> `needsAttention`
- `zj-loop-sync`: warning drift -> `needsAttention`; critical drift -> `error`
- `zj-loop-init`: validation/scaffold errors -> `error`
- `zj-loop-cost`: unknown pattern/level -> `error`

## Error Presentation

Runtime failure:

```text
zj-loop-cost failed: Unknown pattern: not-a-pattern. Use --list for ids.
```

Usage failure:

```text
zj-loop-cost: missing value for --pattern
Try 'zj-loop-cost --help'.
```

Rules:

- No stack trace by default.
- Command name always prefixes errors.
- Usage errors and runtime errors are distinct types.
- Tests should be able to assert error messages without spawning a process.

## First Target Shape: `zj-loop-cost`

`zj-loop-cost` is the best first migration target because it has no positional
target and only one output formatter.

```ts
const cli = defineCli({
  name: 'zj-loop-cost',
  summary: 'estimate daily token spend for loop patterns',
  usage: 'zj-loop-cost --pattern <id> [options]',
  options: [
    { name: 'pattern', alias: 'p', type: 'string', defaultValue: 'daily-triage', description: 'Pattern id' },
    { name: 'cadence', alias: 'c', type: 'string', description: 'Override cadence' },
    { name: 'level', alias: 'l', type: 'enum', values: ['L1', 'L2', 'L3'], defaultValue: 'L1', description: 'Readiness level' },
    { name: 'conservative', type: 'boolean', description: 'Use slower cadence from ranges' },
    { name: 'json', type: 'boolean', description: 'Machine-readable output' },
    { name: 'list', type: 'boolean', description: 'List pattern ids' },
    { name: 'help', alias: 'h', type: 'boolean', description: 'This help' },
  ],
  examples: [
    'zj-loop-cost --pattern ci-sweeper --cadence 15m --level L2',
    'zj-loop-cost --pattern daily-triage --level L1 --json',
    'zj-loop-cost --list',
  ],
  async run(ctx) {
    // load registry, estimate, print
    return { exit: { status: 'ok' } };
  },
});
```

## Migration Order

1. Add harness implementation and tests without migrating any CLI.
2. Migrate `zj-loop-cost`.
3. Migrate `zj-loop-audit`.
4. Migrate `zj-loop-sync`.
5. Migrate `zj-loop-init`.

Each migration should preserve the existing `--help` snapshots and command
examples unless there is an explicit product decision to change the surface.

## Test Contract

Harness tests should cover:

- Boolean option parsing.
- String option parsing with long, short, and `--name=value` forms.
- Enum option validation.
- Unknown option errors.
- Missing option value errors.
- Positional defaulting.
- Too many positional arguments.
- Help rendering determinism.
- Exit status to code mapping.
- Runtime error formatting.

Each migrated CLI should add at least:

- `--help` exits 0 and includes usage/options/examples.
- Unknown option exits 1.
- Missing value exits 1.
- Existing happy-path tests still pass.

## Product Decisions To Make Before Implementation

Recommended answers:

1. Harness location: start in `@jununfly/zj-loop-core`, extract later only if it
   grows.
2. `--fix` alias on audit: keep for one release but mark as deprecated in help
   once the harness can display aliases with notes.
3. `zj-loop-init --json`: defer. Add structured dry-run output only after the
   harness is stable.
4. Exit code `2`: standardize as `needsAttention`.
5. `zj-loop-mcp-server --help`: defer; MCP server can adopt error/help helpers
   later, but it should not drive v1 harness shape.

## Risks

- A too-powerful harness becomes a framework. Keep v1 boring.
- Strict unknown-option errors may break users relying on ignored typos. Treat
  that as a deliberate correctness improvement and call it out in release notes.
- Help rendering changes can create perceived product churn. Snapshot help before
  migration.
- Putting the harness in core can bloat core's purpose. Keep the module
  dependency-free and product-shell focused.
