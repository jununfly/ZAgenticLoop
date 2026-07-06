# Loop Configuration — Issue Triage

## Active Loops

| Pattern | Cadence | Status | Command |
|---------|---------|--------|---------|
| Issue Triage | 2h–1d | L1 propose-only week one | See README |

## Human Gates

- P0 / P1 assignment — human only for first weeks
- Auth, payments, security, public API — always escalate
- Duplicate closure — human confirms
- Stale issue closure — human confirms

## Pairing

Runs as a **feeder** for Daily Triage — merge Top 5 into `zj-loop/STATE.md` during morning triage.

## Budget

- Max sub-agent spawns per run: 1 (L2 label apply with verifier)
- See `zj-loop/zj-loop-budget.md`

## Routing

- Route policy lives in `zj-loop/zj-loop-route-table.yaml`.
- Keep cross-component dispatch routes disabled until the consumer workflow and state owner are ready.

## Links

- Pattern: [issue-triage](../../patterns/issue-triage.md)
- Examples: [examples/grok/issue-triage.md](../../examples/grok/issue-triage.md)
