# CLI Product Surface Inventory

This inventory captures the current `zj-loop-*` CLI family before a shared CLI
harness is designed. It is descriptive only: no CLI behavior changes are implied
by this document.

## Scope

In scope:

- `zj-loop-audit`
- `zj-loop-init`
- `zj-loop-cost`
- `zj-loop-sync`

Adjacent but out of scope for the shared harness first pass:

- `zj-loop-mcp-server`: exposed as a `bin`, but it is a long-running MCP stdio
  server, not a human-facing command workflow.
- `goal-audit`: useful ancestry for `zj-loop-audit`, but not part of the
  `@jununfly/zj-loop-*` product family.

## Command Surface

| Command | Package | Primary job | Positional target | Machine output |
| --- | --- | --- | --- | --- |
| `zj-loop-audit` | `@jununfly/zj-loop-audit` | Readiness score and recommendations | Optional path, default `.` | `--json`, `--md`, `--badge` |
| `zj-loop-init` | `@jununfly/zj-loop-init` | Scaffold loop starters/templates | Optional target dir, default `.` | None |
| `zj-loop-cost` | `@jununfly/zj-loop-cost` | Estimate pattern token spend | None | `--json`, `--list` |
| `zj-loop-sync` | `@jununfly/zj-loop-sync` | Detect configuration drift | Optional target dir, default `.` | `--json` |

## Option Inventory

| Option | Audit | Init | Cost | Sync | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| `--help`, `-h` | Yes | Yes | Yes | Yes | Same concept; help copy format differs |
| `--json` | Yes | No | Yes | Yes | Same spelling; output contracts differ |
| `--md` | Yes | No | No | No | Audit-only report format |
| `--badge` | Yes | No | No | No | Audit-only README badge |
| `--suggest` | Yes | No | No | No | Audit-only; alias `--fix` |
| `--fix` | Alias | No | No | No | Misleading alias because audit only prints suggestions |
| `--pattern`, `-p` | No | Yes | Yes | No | Shared name, different consequences |
| `--tool`, `-t` | No | Yes | No | No | Init-only tool target |
| `--dry-run` | No | Yes | No | Yes | Same concept; sync also has `-d` |
| `--cadence`, `-c` | No | No | Yes | No | Cost-only |
| `--level`, `-l` | No | No | Yes | No | Cost-only readiness level |
| `--conservative` | No | No | Yes | No | Cost-only range handling |
| `--list` | No | No | Yes | No | Cost-only registry listing |
| `--auto-fix`, `-a` | No | No | No | Yes | Sync-only experimental action |
| `--verbose`, `-v` | No | No | No | Yes | Sync-only |

## Argument Parsing Patterns

All four commands parse `process.argv.slice(2)` by hand.

Current patterns:

- `zj-loop-audit` uses `args.includes(...)` for boolean flags and picks the
  first non-flag argument as target.
- `zj-loop-cost` has a local `parseArgs(argv)` with indexed consumption for
  flags that take values.
- `zj-loop-init` has a local `parseArgs(argv)` with indexed consumption and
  positional target fallback.
- `zj-loop-sync` has a local `parseArgs(argv)` and returns a `SyncOptions`
  object.

Gaps:

- Missing option values are not validated consistently. For example, an option
  followed by another flag can become the value.
- Unknown options are mostly ignored rather than reported.
- Boolean aliases are command-specific and not described in shared metadata.
- Help handling is done before command execution in each file, but with
  different return shapes and `process.exit` usage.

## Output Experience

| Command | Default output | Structured output | Follow-up CTA style |
| --- | --- | --- | --- |
| `zj-loop-audit` | Rich human report from `formatHuman` | JSON, Markdown, badge | Long `--suggest` copy block |
| `zj-loop-init` | Action log: copied/created/would copy | None | Always prints next steps |
| `zj-loop-cost` | Human cost table | JSON; tab-separated `--list` | None |
| `zj-loop-sync` | Human drift report | JSON | Help text explains score bands |

Notable inconsistencies:

- `zj-loop-audit --suggest` prints scaffold commands, while `zj-loop-init`
  actually scaffolds. The relationship is useful but not expressed as shared
  command metadata.
- `zj-loop-cost --list` uses tab-separated text rather than JSON or a formatted
  table.
- `zj-loop-init` has no JSON output, even though dry-run action plans would be
  useful for automation.
- `zj-loop-sync` parses `--json` but its `parseArgs` return type currently does
  not include `json`; the runtime still reads `args.json` after object creation.

## Error And Exit Behavior

| Command | Failure prefix | Success exit | Non-critical exit | Critical exit |
| --- | --- | ---: | ---: | ---: |
| `zj-loop-audit` | `Audit failed:` | `0` when score >= 40 | `2` when score < 40 | `1` on thrown error |
| `zj-loop-init` | `zj-loop-init failed:` plus direct validation errors | `0` | None | `1` |
| `zj-loop-cost` | `zj-loop-cost failed:` plus direct validation errors | `0` | None | `1` |
| `zj-loop-sync` | `zj-loop-sync failed:` | `0` healthy | `2` warning | `1` critical or thrown error |

Design pressure:

- Exit code `2` means "below threshold" for audit but "warning drift" for sync.
  Both are non-success but not runtime crashes.
- Validation errors sometimes call `process.exit(1)` inside business flow and
  sometimes throw to the final catch handler.
- Error prefixes are close but not standardized.

## Help Text Patterns

Common structure exists but is hand-maintained:

```text
<command> - one-line description

Usage:
  <command> ...

Options:
  ...

Examples:
  ...
```

Differences:

- Some help includes exit codes (`zj-loop-audit`), some includes score
  interpretation (`zj-loop-sync`), some includes pattern lists (`zj-loop-init`).
- Option alignment and alias formatting vary.
- Product language alternates between "Loop", "loop", and "agentic loop
  working".

## Repeated Implementation Blocks

Repeated enough to justify a harness:

- `parseArgs(argv)` or ad hoc argv scanning.
- Help flag detection.
- Help text printing and `process.exit(0)`.
- Top-level `main().catch(...)`.
- Error message extraction from `unknown`.
- JSON output branch.
- Positional target defaulting to `.`.
- Common package command metadata: name, usage, options, examples.

Not yet worth abstracting:

- Business-specific output formatting.
- Registry loading in `zj-loop-cost` and `zj-loop-init`.
- `zj-loop-init` scaffold action logging.
- `zj-loop-sync` drift level semantics.

## Harness Design Inputs For 1-5-2

A minimal shared CLI harness should probably provide:

- Command metadata:
  - `name`
  - `summary`
  - `usage`
  - `options`
  - `examples`
  - optional sections such as `exitCodes`, `scoreInterpretation`, `patterns`
- Strict option parsing:
  - boolean flags
  - string flags
  - enum flags
  - aliases
  - unknown option errors
  - missing value errors
- Positional parsing:
  - optional target with default `.`
  - command-specific positional names
- Output mode helpers:
  - `json`
  - `markdown`
  - default human output
- Exit semantics:
  - `ok`
  - `needsAttention` for audit/sync warning-like exits
  - `error`
- Error presentation:
  - standardized `<command> failed: <message>`
  - no stack trace by default
- Test helpers:
  - parse argv without invoking process exit
  - render help text deterministically

## Suggested First Harness API

The next slice should keep the API intentionally small:

```ts
defineCli({
  name: 'zj-loop-audit',
  summary: 'Loop Readiness Score CLI',
  usage: 'zj-loop-audit [path] [options]',
  options: [
    { name: 'json', type: 'boolean', description: 'JSON output' },
    { name: 'help', alias: 'h', type: 'boolean', description: 'This help' },
  ],
  positionals: [
    { name: 'target', defaultValue: '.' },
  ],
  async run(ctx) {
    // command-specific business logic
  },
});
```

The harness should not own command-specific formatting. It should normalize the
outer shell: parse, help, error, and exit.

## Migration Order

Recommended order:

1. Extract a tested parser/help renderer in `@jununfly/zj-loop-core` or a new
   private module under `tools/zj-loop-audit/src/cli-harness.ts`.
2. Migrate `zj-loop-cost` first. It has the smallest surface and clear enum
   validation.
3. Migrate `zj-loop-audit` second to exercise output modes and non-success exit
   code `2`.
4. Migrate `zj-loop-sync` third to test warning/critical exit semantics.
5. Migrate `zj-loop-init` last because it has scaffold side effects and the
   largest help surface.

## Open Questions

- Should the harness live in `@jununfly/zj-loop-core`, or should it be a new
  `@jununfly/zj-loop-cli` package to avoid bloating core?
- Should `--fix` remain as an audit alias for `--suggest`, or should it be
  deprecated because it does not mutate files?
- Should all CLIs support `--json`, including `zj-loop-init --dry-run`?
- Should exit code `2` be standardized as "needs attention" across audit and
  sync?
- Should `zj-loop-mcp-server --help` be covered by the same harness even though
  the server itself is not a human-facing workflow?
