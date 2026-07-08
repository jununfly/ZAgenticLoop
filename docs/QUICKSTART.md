# Quickstart — 5 minutes to your first loop

Landed from the [repository](https://github.com/jununfly/ZAgenticLoop), a package page, or a friend's README? This is the shortest path from zero to a running loop.

**Week one rule:** report only. No auto-fix, no auto-merge. Read what the loop writes before you let it act.

The commands below use the public npm packages. Contributors can also run the
same CLIs from this monorepo; see [From source](#from-source) below.

## 1. Pick your pain (30 seconds)

Not sure which loop?

```bash
# Scaffold starter (or copy manually)
npx @jununfly/zj-loop-init . --pattern daily-triage --tool codex

# Score loop readiness (this repo also comments scores on PRs in CI)
npx @jununfly/zj-loop-audit . --suggest

# Optional: score run-until-done goal readiness
npx @jununfly/zj-goal-audit . --suggest

# Codex — report only, week one
/loop 1d Run zj-loop-triage. Update zj-loop/STATE.md. No auto-fix.

# Also try the new low-risk pattern
/loop 1d Run zj-changelog-scan + zj-draft-release-notes. Write RELEASE_NOTES_DRAFT.md. Human review only.
```

Or start with **Daily Triage** if you just want to learn loop discipline with low risk.

## 2. Scaffold in your repo (60 seconds)

Run this in the root of any git project (no clone required):

```bash
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok
```

Swap `--tool grok` for `claude` or `codex` if needed. Swap `--pattern` for any pattern from [patterns/registry.yaml](../patterns/registry.yaml).

`zj-loop-init` copies the starter kit, creates `zj-loop/STATE.md`, `zj-loop/ZJ-LOOP.md`, `zj-loop/zj-loop-route-table.yaml`, `zj-loop/zj-loop-budget.md`, and `zj-loop/zj-loop-run-log.md`, then prints your first command.

`zj-loop/zj-loop-route-table.yaml` is the routing control plane. It records which loop signals should stay human-readable, be ignored, remain report-only, or later dispatch to another pattern. It is policy, not a runtime queue.

Optional GitHub Actions bundle:

```bash
npx @jununfly/zj-loop-init . --add github-actions
```

This adds generated `zj-loop-*.yml` workflows. Start with the manual `ZJ Loop
Smoke` workflow; it produces Route Decision evidence and runs audit without
creating issues, PRs, branches, or comments. Side-effecting consumers stay under
Route Table control.

## 3. Check cost before you schedule (30 seconds)

```bash
npx @jununfly/zj-loop-cost --pattern daily-triage --level L1 --cadence 1d
```

Adjust `--pattern`, `--level` (L1 → L2 → L3), and `--cadence` to match what you plan to run. High-frequency loops (CI Sweeper at 5m) can burn tokens fast — slow the cadence or require early-exit triage first.

## 4. Audit readiness (30 seconds)

```bash
npx @jununfly/zj-loop-audit . --suggest
```

Scores 0–100 with concrete next steps. Re-run after each improvement. Paste a badge when you're proud of the score:

```bash
npx @jununfly/zj-loop-audit . --badge
```

For bounded run-until-done work, audit goal readiness separately:

```bash
npx @jununfly/zj-goal-audit . --suggest
```

## 5. Run your first loop — report only (2 minutes)

### Grok

```bash
/loop 1d Run zj-loop-triage. Update zj-loop/STATE.md. No auto-fix in week one.
```

### Claude Code

```bash
/loop 1d Run $zj-loop-triage. Read zj-loop/STATE.md. Merge findings into High Priority and Watch List. Update Last run. Do not edit code.
```

### Codex

Use the first-run command printed by `zj-loop-init` (pattern-specific). Week one: triage and state updates only.

### OpenClaw

No `zj-loop-init --tool openclaw` yet — copy `skills/zj-loop-triage/SKILL.md` and `zj-loop/STATE.md`, then create an isolated cron job. See [examples/openclaw/daily-triage.md](../examples/openclaw/daily-triage.md).

### Cursor or Windsurf

No `zj-loop-init --tool cursor` yet — copy skills and state from any starter, then map scheduling to editor Automations or Workflows. See the [Cursor & Windsurf appendix](./primitives-matrix.md#appendix-editor-transfer-recipes-cursor-windsurf) in the primitives matrix.

### GitHub Actions

Install the workflow-dispatch bundle:

```bash
npx @jununfly/zj-loop-init . --add github-actions
```

Run `ZJ Loop Smoke` manually from GitHub Actions first. It should write the
Route Decision payload to the workflow summary and run:

```bash
npx @jununfly/zj-loop-audit . --suggest
```

Then inspect Route Table status before enabling any consumer route:

```bash
npx --yes --package @jununfly/zj-loop-core@0.1.2 zj-loop-route status
```

Treat this output as the route selection menu. The `readiness` column separates
reference-repo evidence from user-project readiness: `dogfooded-live` is proven
inside this repo; `user-project-ready` means the generated bundle can call a
published package runner in a user project.

Generated workflows should also pass through the packaged consumer gate before
runner side effects:

```bash
npx --yes --package @jununfly/zj-loop-core zj-loop-consumer plan <route-id> --json
```

Enable side-effecting routes with a fixed confirmation phrase:

```bash
npx --yes --package @jununfly/zj-loop-core@0.1.2 zj-loop-route enable ci-sweeper --confirm "enable ci-sweeper side effects"
```

Disable is intentionally low friction:

```bash
npx --yes --package @jununfly/zj-loop-core@0.1.2 zj-loop-route disable ci-sweeper
```

Upgrade generated workflows intentionally when package pins or templates change:

```bash
npx @jununfly/zj-loop-init . --upgrade github-actions
```

If a generated workflow was edited locally, upgrade writes the new canonical
workflow and keeps the old one as `.bak` for review.

## 6. Read the output, commit state (1 minute)

Open `zj-loop/STATE.md`. Did the loop capture real priorities? Edit anything wrong — you're still the engineer.

Commit the scaffold + first run update so `zj-loop-audit` sees activity on the next audit.

## What next?

| When | Do this |
|------|---------|
| End of week one | Re-run `npx @jununfly/zj-loop-audit . --suggest` — aim for L1 (score ~40+) |
| Week two | Add a verifier skill; try one assisted fix in a worktree (L2) |
| Before unattended (L3) | `zj-loop/zj-loop-budget.md` + `zj-loop/zj-loop-run-log.md` filled, `zj-loop/zj-loop-route-table.yaml` reviewed, human gates in `zj-loop/ZJ-LOOP.md`, proven runs |
| Unsure which pattern | [pattern-picker.md](./pattern-picker.md) · [loop-design-checklist.md](./loop-design-checklist.md) |
| Something broke | [failure-modes.md](./failure-modes.md) · [stories/](../stories/) |

## Copy-paste cheat sheet

```bash
# Scaffold
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok

# Cost check
npx @jununfly/zj-loop-cost --pattern daily-triage --level L1 --cadence 1d

# Audit + suggestions
npx @jununfly/zj-loop-audit . --suggest

# Optional GitHub Actions bundle
npx @jununfly/zj-loop-init . --add github-actions

# Optional badge for your README
npx @jununfly/zj-loop-audit . --badge
```

## From source

When contributing to this repo, run the CLIs from a local checkout:

```bash
cd tools/zj-loop-init && npm ci && npm test && node dist/cli.js /path/to/project --pattern daily-triage --tool grok
cd tools/zj-loop-cost && npm ci && npm test && node dist/cli.js --pattern daily-triage --level L1 --cadence 1d
cd tools/zj-loop-audit && npm ci && npm test && node dist/cli.js /path/to/project --suggest
cd tools/zj-goal-audit && npm ci && npm test && node dist/cli.js /path/to/project --suggest
```

## If npx stalls or you are offline

`npx` may look silent while npm resolves the package, especially behind a slow
registry mirror or DNS failure. Use one of these paths instead:

```bash
# Already installed globally
zj-loop-init . --pattern daily-triage --tool grok
zj-loop-audit . --suggest
zj-loop-cost --pattern daily-triage --level L1

# Reuse npm's local cache without network
npm exec --offline --package=@jununfly/zj-loop-init -- zj-loop-init . --pattern daily-triage --tool grok
npm exec --offline --package=@jununfly/zj-loop-audit -- zj-loop-audit . --suggest
npm exec --offline --package=@jununfly/zj-loop-cost -- zj-loop-cost --pattern daily-triage --level L1

# Force the official npm registry when a mirror is unhealthy
npm_config_registry=https://registry.npmjs.org npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok
```

If you have cloned this repository, the [From source](#from-source) commands are
the most deterministic option because they avoid package resolution entirely.

## Learn the why (optional, 10 minutes)

- [Attribution and further reading](../resources/sources.md) — concept and primitives
- [Primitives matrix](./primitives-matrix.md) — Grok vs Claude vs Codex vs OpenClaw vs Cursor
- [Operating loops](./operating-loops.md) — when to kill a loop
