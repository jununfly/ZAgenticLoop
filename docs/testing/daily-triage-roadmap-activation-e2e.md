# Daily Triage To Roadmap-Sliced Development Activation E2E Test Cases

These test cases verify the activation route:

```text
Issue Slash Command -> Route Decision -> Activation Request -> Roadmap-Sliced Consumer -> Roadmap Branch/PR
```

For this repository's dogfood run, the producer-specific chain is:

```text
Daily Triage Candidate -> Route Decision -> Activation Request -> Roadmap-Sliced Development -> Roadmap Branch/PR
```

This is not an Issue Fix Request chain and must not create a Fix PR by protocol.
Daily Triage may discover or report the signal, but Route Dispatcher owns the
request creation and Roadmap-Sliced Development owns activation consumption.

## Local Replay Gate

Run:

```bash
node scripts/roadmap-activation-e2e-replay.mjs
node --test scripts/roadmap-activation-e2e-replay.test.mjs scripts/roadmap-activation-dispatcher.test.mjs
```

Expected results:

- Replay suite returns `passed: true`.
- Replay reads `zj-loop/zj-loop-route-table.yaml`; the
  `roadmap-sliced-development` route must be enabled with
  `request_kind: activation-comment`.
- The dispatcher can produce the exact structured comment body to append, but
  it does not call GitHub APIs or create roadmap process artifacts.
- A valid maintainer/collaborator activation reaches `activation-request`.
- Insufficient permission reaches `denied`.
- Existing pending activation reaches `duplicate`.
- A disabled or malformed route reaches `route-denied`.
- No replay step is named `issue-fix-request`.

## Real GitHub Evidence

When running this as dogfood:

- Use an explicit issue or request id. Synthetic carrier issues are acceptable
  for protocol dogfood when they are clearly titled and closed after evidence
  capture.
- Append structured activation comments; do not edit prior comments.
- Record Route Decision evidence separately from activation lifecycle.
- Roadmap-Sliced Development consumes the activation request and owns branch,
  roadmap file, roadmap view, and next-action resume anchors.
- Failed activation may be retried only through a new activation request.

This path proves Daily Triage can discover or report a plan-intake signal
without becoming the dispatcher or the roadmap implementer.

### ZAgenticLoop Dogfood Evidence

2026-07-06 dogfood carrier:
[jununfly/ZAgenticLoop#19](https://github.com/jununfly/ZAgenticLoop/issues/19).

Captured evidence:

- Slash command:
  [issuecomment-4892978818](https://github.com/jununfly/ZAgenticLoop/issues/19#issuecomment-4892978818)
- Activation request:
  [issuecomment-4892983991](https://github.com/jununfly/ZAgenticLoop/issues/19#issuecomment-4892983991)
- Route Decision:
  [issuecomment-4893003970](https://github.com/jununfly/ZAgenticLoop/issues/19#issuecomment-4893003970)
- Activation consumed:
  [issuecomment-4893007904](https://github.com/jununfly/ZAgenticLoop/issues/19#issuecomment-4893007904)

The carrier issue was closed after evidence capture. The consumed comment records
the consumer handoff anchors: branch
`codex-daily-triage-roadmap-activation`, roadmap file
`docs/plans/daily-triage-roadmap-activation-roadmap.json`, and roadmap view
`docs/plans/daily-triage-roadmap-activation-roadmap.md`.

## Closeout Decision Audit

Durable decisions from the roadmap were classified as follows:

| Decision | Classification | Durable home |
| --- | --- | --- |
| Canonical issue-command chain wording is `Issue Slash Command -> Route Decision -> Activation Request -> Roadmap-Sliced Consumer -> Roadmap Branch/PR`. | durable doc | This test case and `zj-loop/ZJ-LOOP.md`. |
| Canonical triage-candidate chain wording is `Daily Triage Candidate -> Route Decision -> Activation Request -> Roadmap-Sliced Development -> Roadmap Branch/PR`. | durable doc | This test case and `zj-loop/ZJ-LOOP.md`. |
| Daily Triage is only the producer; Route Dispatcher creates activation requests; Roadmap-Sliced Development consumes them. | durable doc | This test case and `zj-loop/ZJ-LOOP.md`. |
| `roadmap-sliced-development` is enabled as an `activation-comment` route in the dogfood route table. | durable doc | `zj-loop/zj-loop-route-table.yaml` and `zj-loop/ZJ-LOOP.md`. |
| Activation replay must read the real route table and fail when the route is disabled or malformed. | durable doc | `scripts/roadmap-activation-e2e-replay.mjs` tests and this test case. |
| Synthetic issue dogfood is acceptable when the carrier is clearly marked and closed after evidence capture. | durable doc | This test case. |
| Feature-slice commit intent. | discarded process note | Preserved by commit history; it does not need to survive as user-facing documentation. |

The process roadmap files were deleted after this audit because the durable docs,
tests, route table, GitHub issue evidence, and commit history now absorb the
reviewable decisions.
