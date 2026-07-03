# zj-loop-cost

Estimate daily token spend for [agentic loop working](https://github.com/jununfly/ZAgenticLoop) patterns by cadence and readiness level (L1–L3).

Uses cost metadata from `patterns/registry.yaml`.

## Install & Run

```bash
npx @jununfly/zj-loop-cost --pattern ci-sweeper --cadence 15m --level L2
npx @jununfly/zj-loop-cost --pattern daily-triage --level L1 --json
npx @jununfly/zj-loop-cost --list
```

If `npx` stalls on package resolution, use an installed binary or npm's local cache:

```bash
zj-loop-cost --pattern daily-triage --level L1
npm exec --offline --package=@jununfly/zj-loop-cost -- zj-loop-cost --pattern daily-triage --level L1
```

**From this repo:**

```bash
cd tools/zj-loop-cost
npm install
npm test
```

## Options

| Flag | Description |
|------|-------------|
| `--pattern` | Pattern id (see `--list`) |
| `--cadence` | Override cadence (e.g. `15m`, `1d`) |
| `--level` | `L1`, `L2`, or `L3` (default `L1`) |
| `--conservative` | Use slower cadence from ranges |
| `--json` | Machine-readable output |

## Scenarios

Each estimate includes:

- **Early-exit / no-op** — empty watchlist, minimal tokens
- **Full triage** — every run does a full scan
- **Action every run** — implementer + verifier every time (worst case)
- **Realistic blend** — level-based mix (documented in output)

Pair with `zj-loop/zj-loop-budget.md` (scaffolded by `zj-loop-init`) and `zj-loop-audit` cost observability checks.

See [docs/operating-loops.md](../../docs/operating-loops.md).
