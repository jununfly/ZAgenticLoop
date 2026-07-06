# Report-only Route Decision E2E Test Cases

These test cases verify the report-only route:

```text
Signal -> Route Decision -> Report Evidence
```

This route kind is intentionally side-effect free. It must not create an Issue
Fix Request, Activation Request, workflow dispatch, branch, PR, or consumer work.

## Covered Routes

The ZAgenticLoop dogfood route table currently enables these report-only routes:

| Route | Match | Evidence target |
| --- | --- | --- |
| `human` | `risk: high` or `risk: unknown` | `zj-loop/STATE.md` |
| `ignore` | `route: ignore` | `zj-loop/STATE.md` |
| `daily-triage-report` | `route: daily-triage` | `zj-loop/STATE.md` |

## Local Replay Gate

Run:

```bash
node --test scripts/report-only-route-dispatcher.test.mjs
npm run test:route-decision
```

Expected results:

- A high-risk signal reaches `human` with `request_kind: report-only`.
- An ignored signal reaches `ignore` with `requested_action: ignore`.
- A Daily Triage report signal reaches `daily-triage-report`.
- A route kind drift to `issue-fix-request`, `activation-comment`, or
  `workflow-dispatch` is denied before any report evidence is produced.
- Non-matching signals are denied.
- Report evidence explicitly records that no Issue Fix Request, Activation
  Request, workflow dispatch, or consumer work was created.
- Allowed report-only Route Decisions finish with `status: closed`, because no
  request lifecycle remains pending after report evidence is produced.

## Activation Dogfood Evidence

This implementation was started through the full activation chain:

```text
Plan Signal -> Route Decision -> Activation Request -> Roadmap-Sliced Consumer -> Roadmap Branch/PR
```

Carrier issue:
[jununfly/ZAgenticLoop#21](https://github.com/jununfly/ZAgenticLoop/issues/21).

Captured activation evidence:

- Slash command:
  [issuecomment-4893264078](https://github.com/jununfly/ZAgenticLoop/issues/21#issuecomment-4893264078)
- Activation request:
  [issuecomment-4893268445](https://github.com/jununfly/ZAgenticLoop/issues/21#issuecomment-4893268445)
- Activation Route Decision:
  [issuecomment-4893272307](https://github.com/jununfly/ZAgenticLoop/issues/21#issuecomment-4893272307)
- Activation consumed:
  [issuecomment-4893302147](https://github.com/jununfly/ZAgenticLoop/issues/21#issuecomment-4893302147)

The report-only implementation itself remains a local deterministic replay gate;
it does not require a live issue comment because its expected output is report
evidence, not a request lifecycle transition.

## Report-only Dogfood Evidence

2026-07-06 local dogfood used the real
`zj-loop/zj-loop-route-table.yaml` and synthetic signals linked to carrier issue
[#21](https://github.com/jununfly/ZAgenticLoop/issues/21).

Captured Route Decisions:

| Route | Signal | Decision id | Outcome |
| --- | --- | --- | --- |
| `human` | `issue:21:high-risk` | `rd_report_37f23ba8d291` | `report`, `status: closed` |
| `ignore` | `daily:noise:report-only-dogfood` | `rd_report_608d990bd18f` | `ignore`, `status: closed` |
| `daily-triage-report` | `daily:report:report-only-dogfood` | `rd_report_8a9f213d1057` | `report`, `status: closed` |

Each report evidence object recorded all side-effect flags as `false`.

## Closeout Decision Audit

Durable decisions from the roadmap were classified as follows:

| Decision | Classification | Durable home |
| --- | --- | --- |
| Report-only Route Decision covers `human`, `ignore`, and `daily-triage-report`. | durable doc | This test case and `zj-loop/ZJ-LOOP.md`. |
| Report-only routes produce Route Decision plus report evidence only. | durable doc | This test case and `scripts/report-only-route-dispatcher.mjs`. |
| Report-only routes must not create Issue Fix Requests, Activation Requests, workflow dispatches, branches, PRs, or consumer work. | durable doc | This test case and dispatcher tests. |
| Allowed report-only Route Decisions use `status: closed`. | durable doc | This test case and dispatcher tests. |
| Feature-slice verification and commit bookkeeping. | discarded process note | Preserved by commit history; not needed as durable user-facing documentation. |

The process roadmap files were deleted after this audit because the durable docs,
tests, GitHub issue evidence, and commit history now absorb the reviewable
decisions.
