# Loop Configuration — PR Steward

| Pattern | Cadence | Status |
|---------|---------|--------|
| PR Steward | 5m (work hours) | L2 assisted |

## Limits

- Max fix attempts per PR: 3
- Auto-merge: **disabled**
- Watched: PRs authored by team / label `loop-watch`

## Human Gates

- Security, auth, payments, infrastructure
- PRs with >10 files changed in loop fix

## Routing

- Route policy lives in `zj-loop/zj-loop-route-table.yaml`.
- Keep cross-component dispatch routes disabled until the consumer workflow and state owner are ready.

## Pattern

[pr-steward.md](../../patterns/pr-steward.md)
