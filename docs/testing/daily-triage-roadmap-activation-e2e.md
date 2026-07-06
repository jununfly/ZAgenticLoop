# Daily Triage To Roadmap-Sliced Development Activation E2E Test Cases

These test cases verify the activation route:

```text
Daily Triage Signal -> Route Decision -> activation request -> Roadmap-Sliced Development
```

This is not an Issue Fix Request chain and must not create a Fix PR by protocol.

## Local Replay Gate

Run:

```bash
node scripts/roadmap-activation-e2e-replay.mjs
node --test scripts/roadmap-activation-e2e-replay.test.mjs
```

Expected results:

- Replay suite returns `passed: true`.
- A valid maintainer/collaborator activation reaches `activation-request`.
- Insufficient permission reaches `denied`.
- Existing pending activation reaches `duplicate`.
- No replay step is named `issue-fix-request`.

## Real GitHub Evidence

When running this as dogfood:

- Use an explicit issue or request id.
- Append structured activation comments; do not edit prior comments.
- Record Route Decision evidence separately from activation lifecycle.
- Roadmap-Sliced Development consumes the activation request and owns branch,
  roadmap file, roadmap view, and next-action resume anchors.
- Failed activation may be retried only through a new activation request.

This path proves Daily Triage can discover or report a plan-intake signal
without becoming the dispatcher or the roadmap implementer.
