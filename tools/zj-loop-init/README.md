# zj-loop-init

Scaffold agentic loop working starters into your project by pattern and tool.

**npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok** works immediately.

## Install & Run

```bash
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok
npx @jununfly/zj-loop-init . -p pr-steward -t claude
npx @jununfly/zj-loop-init . -p dependency-sweeper --dry-run
```

See [docs/RELEASE.md](../../docs/RELEASE.md) for npm publish tags. The published package bundles `starters/` and `templates/` from this monorepo.

After scaffolding, always run `npx @jununfly/zj-loop-audit . --suggest` and actually execute the first report-only loop to generate activity signals.

If `npx` stalls on package resolution, use an installed binary or npm's local cache:

```bash
zj-loop-init . --pattern daily-triage --tool grok
npm exec --offline --package=@jununfly/zj-loop-init -- zj-loop-init . --pattern daily-triage --tool grok
```

## Patterns

| Pattern | Default state file |
|---------|-------------------|
| `daily-triage` | `zj-loop/STATE.md` |
| `pr-steward` | `zj-loop/pr-steward-state.md` |
| `ci-sweeper` | `zj-loop/ci-sweeper-state.md` |
| `dependency-sweeper` | `zj-loop/dependency-sweeper-state.md` |
| `post-merge-cleanup` | `zj-loop/post-merge-state.md` |
| `changelog-drafter` | `zj-loop/changelog-drafter-state.md` |
| `zj-issue-triage` | `zj-loop/issue-triage-state.md` |
| `roadmap-sliced-development` | `zj-loop/roadmap-sliced-state.md` |

L2 patterns (`ci-sweeper`, `dependency-sweeper`, `roadmap-sliced-development`) also copy verifier templates when missing from the starter; fix loops only copy `zj-minimal-fix` where the registry asks for it.

Every scaffold also creates:

- `zj-loop/zj-loop-budget.md` — pattern-specific daily caps and kill switch
- `zj-loop/zj-loop-run-log.md` — append-only run history
- `zj-loop/zj-loop-constraints.md` — structured runtime constraints
- `zj-loop-budget` skill — runtime budget guard at start/end of each run

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
