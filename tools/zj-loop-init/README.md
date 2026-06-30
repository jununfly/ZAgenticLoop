# zj-loop-init

Scaffold agentic loop working starters into your project by pattern and tool.

**npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok** works immediately.

## Install & Run

```bash
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok
npx @jununfly/zj-loop-init . -p pr-babysitter -t claude
npx @jununfly/zj-loop-init . -p dependency-sweeper --dry-run
```

See [docs/RELEASE.md](../../docs/RELEASE.md) for npm publish tags. The published package bundles `starters/` and `templates/` from this monorepo.

After scaffolding, always run `npx @jununfly/zj-loop-audit . --suggest` and actually execute the first report-only loop to generate activity signals.

## Patterns

| Pattern | Default state file |
|---------|-------------------|
| `daily-triage` | `STATE.md` |
| `pr-babysitter` | `pr-babysitter-state.md` |
| `ci-sweeper` | `ci-sweeper-state.md` |
| `dependency-sweeper` | `dependency-sweeper-state.md` |
| `post-merge-cleanup` | `post-merge-state.md` |
| `changelog-drafter` | `changelog-drafter-state.md` |
| `issue-triage` | `issue-triage-state.md` |

L2 patterns (`ci-sweeper`, `dependency-sweeper`) also copy `minimal-fix` and `loop-verifier` templates when missing from the starter.

Every scaffold also creates:

- `loop-budget.md` — pattern-specific daily caps and kill switch
- `loop-run-log.md` — append-only run history
- `loop-budget` skill — runtime budget guard at start/end of each run

## Tools

- `grok` (default)
- `claude`
- `codex`

Falls back to Grok starter paths when a per-tool variant is not yet available.

## From this repo

```bash
cd tools/zj-loop-init && npm ci && npm test
node dist/cli.js /path/to/project --pattern daily-triage --tool grok
```

Pair with `zj-loop-audit` and `zj-loop-cost` after scaffolding:

```bash
npx @jununfly/zj-loop-cost --pattern daily-triage --level L1
npx @jununfly/zj-loop-audit . --suggest
```