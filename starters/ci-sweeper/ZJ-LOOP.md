# Loop Configuration — CI Sweeper

## Active Loops

| Pattern | Cadence | Status | Command |
|---------|---------|--------|---------|
| CI Sweeper | 15m when CI is active | L2 guarded fixes | `/loop 15m Check CI on main. Update ci-sweeper-state.md. Classify failures. For new actionable failures: worktree + zj-minimal-fix + zj-loop-verifier. Escalate after 3 attempts.` |

## Human Gates

- Infra outages or provider failures
- Security, auth, payments, or release infrastructure paths
- More than 3 failed fix attempts
- Test failures that look flaky or non-deterministic

## Budget

- Max runs/day: 96
- Max tokens/day: 1M
- Max sub-agent spawns/run: 0 (L1) / 3 (L2)
- Kill switch: `loop-pause-all`
- Append each run to `zj-loop/zj-loop-run-log.md`; use `zj-loop-budget` at start/end.

## Isolation

- Fixes run in a git worktree.
- One minimal fix per run.
- No auto-merge.
