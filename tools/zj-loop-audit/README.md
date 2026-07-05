# zj-loop-audit

CLI that scores a project's **Loop Readiness** (0–100) and suggests next steps.

**npx @jununfly/zj-loop-audit . --suggest** works immediately (published package).

## Install & Run

**npm (recommended):**

```bash
npx @jununfly/zj-loop-audit .
npx @jununfly/zj-loop-audit . --suggest
```

If `npx` stalls on package resolution, use an installed binary or npm's local cache:

```bash
zj-loop-audit . --suggest
npm exec --offline --package=@jununfly/zj-loop-audit -- zj-loop-audit . --suggest
```

**From this repo:**

```bash
cd tools/zj-loop-audit
npm install
npm run build
node dist/cli.js /path/to/your/project
```

## Before/after demo

See scores climb from empty → L1 starter → L2 verifier:

```bash
bash scripts/before-after-demo.sh
```

## Options

```bash
zj-loop-audit .              # human-readable (default)
zj-loop-audit . --json       # machine-readable
zj-loop-audit . --md         # markdown report
zj-loop-audit . --suggest    # context-aware actions for missing or incomplete pieces
zj-loop-audit . --badge      # markdown README badge (Loop Ready level + score)
```

Exit code `2` if score < 40 (useful for CI gates once your project is loop-ready).

## Publish to npm

Maintainers:

```bash
cd tools/zj-loop-audit
npm run build
npm publish --access public
```

## Signals Checked (v1.4+)

| Signal                  | Notes |
|-------------------------|-------|
| State file              | `zj-loop/STATE.md` or `zj-loop/<pattern>-state.md` |
| Triage skill            | zj-loop-triage / zj-ci-triage / zj-pr-review-triage etc. |
| Verifier skill          | maker/checker split (skills or Claude/Codex agents) |
| `zj-loop/ZJ-LOOP.md` / config | Cadence, limits, handoff |
| AGENTS.md / CLAUDE.md   | Project conventions |
| Loop safety policy             | zj-loop/zj-loop-safety.md + ZJ-LOOP.md mentions of gates |
| .github/ + workflows    | Dogfooding / automation |
| MCP / connectors        | Mentions or config files |
| Worktree evidence       | Isolation patterns in docs |
| patterns/registry.yaml  | Machine index for tooling |
| `zj-loop/zj-loop-budget.md` | Token caps and kill switch |
| `zj-loop/zj-loop-run-log.md` | Append-only run history |
| `zj-loop/ZJ-LOOP.md` budget section | Cadence limits documented in config |
| zj-loop-budget skill       | Runtime budget guard |
| **loopActivity (v1.4)** | **Dynamic proof**: "Last run" timestamps in state, loop-related git commits, scheduled workflows, run logs |

L3 requires verifier + state + cost observability (budget + run log + zj-loop/ZJ-LOOP.md budget) **and** proven loop activity (not just files on disk).

## Levels

| Level | Meaning |
|-------|---------|
| L0 | Draft — document intent |
| L1 | Report-only loops |
| L2 | Assisted auto-fix with verifier |
| L3 | Unattended-capable (with human gates) |

See [docs/loop-design-checklist.md](../../docs/loop-design-checklist.md) and
[docs/designs/architecture.md](../../docs/designs/architecture.md#readiness-policy).
