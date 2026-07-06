# Loop Configuration — Post-Merge Cleanup

## Active Loops

| Pattern | Cadence | Status | Command |
|---------|---------|--------|---------|
| Post-Merge Cleanup | 1d | L1 report-only week one | See README |

## Human Gates

- Architectural debt → create ticket, do not fix
- Feature flag removal → human approval
- Multi-file refactors → escalate

## Budget

- Max sub-agent spawns per run: 2 (L2)
- Run off-peak (evening / overnight)

## Routing

- Route policy lives in `zj-loop/zj-loop-route-table.yaml`.
- Keep cross-component dispatch routes disabled until the consumer workflow and state owner are ready.

## Links

- Pattern: [post-merge-cleanup](../../patterns/post-merge-cleanup.md)
