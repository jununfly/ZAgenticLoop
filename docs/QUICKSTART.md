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
/loop 1d Run loop-triage. Update STATE.md. No auto-fix.

# Also try the new low-risk pattern
/loop 1d Run changelog-scan + draft-release-notes. Write RELEASE_NOTES_DRAFT.md. Human review only.
```

Or start with **Daily Triage** if you just want to learn loop discipline with low risk.

## 2. Scaffold in your repo (60 seconds)

Run this in the root of any git project (no clone required):

```bash
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok
```

Swap `--tool grok` for `claude` or `codex` if needed. Swap `--pattern` for any pattern from [patterns/registry.yaml](../patterns/registry.yaml).

`zj-loop-init` copies the starter kit, creates `STATE.md`, `LOOP.md`, `loop-budget.md`, and `loop-run-log.md`, then prints your first command.

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
/loop 1d Run loop-triage. Update STATE.md. No auto-fix in week one.
```

### Claude Code

```bash
/loop 1d Run $loop-triage. Read STATE.md. Merge findings into High Priority and Watch List. Update Last run. Do not edit code.
```

### Codex

Use the first-run command printed by `zj-loop-init` (pattern-specific). Week one: triage and state updates only.

### OpenClaw

No `zj-loop-init --tool openclaw` yet — copy `skills/loop-triage/SKILL.md` and `STATE.md`, then create an isolated cron job. See [examples/openclaw/daily-triage.md](../examples/openclaw/daily-triage.md).

### Cursor or Windsurf

No `zj-loop-init --tool cursor` yet — copy skills and state from any starter, then map scheduling to editor Automations or Workflows. See the [Cursor & Windsurf appendix](./primitives-matrix.md#appendix-editor-transfer-recipes-cursor-windsurf) in the primitives matrix.

### GitHub Actions only

Workflow examples under [examples/github-actions/](../examples/github-actions/) are schema-complete; you wire the agent invocation (Codex API, `repository_dispatch`, etc.). Start with report-only outputs to a state file or issue comment.

## 6. Read the output, commit state (1 minute)

Open `STATE.md`. Did the loop capture real priorities? Edit anything wrong — you're still the engineer.

Commit the scaffold + first run update so `zj-loop-audit` sees activity on the next audit.

## What next?

| When | Do this |
|------|---------|
| End of week one | Re-run `npx @jununfly/zj-loop-audit . --suggest` — aim for L1 (score ~40+) |
| Week two | Add a verifier skill; try one assisted fix in a worktree (L2) |
| Before unattended (L3) | `loop-budget.md` + `loop-run-log.md` filled, human gates in `LOOP.md`, proven runs |
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

## Learn the why (optional, 10 minutes)

- [Attribution and further reading](../resources/sources.md) — concept and primitives
- [Primitives matrix](./primitives-matrix.md) — Grok vs Claude vs Codex vs OpenClaw vs Cursor
- [Operating loops](./operating-loops.md) — when to kill a loop
