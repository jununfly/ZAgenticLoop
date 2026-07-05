# Loop Configuration — Dependency Sweeper

## Active Loops

| Pattern | Cadence | Status | Command |
|---------|---------|--------|---------|
| Dependency Sweeper | 6h | L2 assisted (patch-only) | See README |

## Human Gates

- Major version bumps → human approval always
- High-severity CVE requiring breaking change → human
- Denylist packages (edit in state file) → never auto-touch
- No auto-merge without verifier pass + allowlist

## Worktrees

- One worktree per package update attempt
- Discard worktree on REJECT or after human escalation

## Budget

- Max sub-agent spawns per run: 3
- Max auto-PRs per day: 5
- Pause if token budget exceeded (see `templates/zj-loop-budget.md.template`)

## Links

- Pattern: [dependency-sweeper](../../patterns/dependency-sweeper.md)
- Safety: [zj-loop/zj-loop-safety.md](../../zj-loop/zj-loop-safety.md)