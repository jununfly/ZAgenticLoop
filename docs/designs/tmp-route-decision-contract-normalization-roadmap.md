# Route Decision Contract Normalization Roadmap

Process roadmap for GitHub issue #48 and activation request
`rsd-48-route-decision-contract-normalization`.

## Objective

Normalize low-level Route Decision contract construction helpers while keeping
all existing route-specific replay behavior stable.

## Hard Gates

- Existing route-specific replay behavior must not change.
- Do not add a global `statusForDecision`.
- Do not add a generic `dispatchRouteDecision()`.
- Do not unify activation, issue-fix-request, claim, or closeout lifecycles.
- Do not introduce a runtime queue, worker, consumer runner, or mega dispatcher.
- Preserve route-specific replay files and test entry points.
- Add helper contract tests before migrating call sites.

## Parent Node 1: Helper Contract Foundation

Status: completed

Completion condition:

- Leaf nodes are completed/deferred/linked follow-up.
- Durable decision is recorded in existing route decision documentation during
  closeout.

### Leaf 1.1: Add Helper Contract Tests

Status: completed

Intent:

- Add `scripts/route-decision-contract.test.mjs`.
- Cover deterministic helper behavior only:
  - stable hash shape
  - evidence normalization
  - route match diagnostics
  - side-effect false defaults
  - report evidence base assembly

Verification evidence:

- `node --test scripts/route-decision-contract.test.mjs` passed.

Notes:

- Tests must not encode route-specific lifecycle status rules.

### Leaf 1.2: Add Pure Helper Module

Status: completed

Intent:

- Add `scripts/route-decision-contract.mjs`.
- Provide pure, script-level helpers only.

Verification evidence:

- `node --test scripts/route-decision-contract.test.mjs` passed.

Notes:

- The module must not dispatch routes or own lifecycle decisions.

## Parent Node 2: Narrow Call-Site Migration

Status: in-progress

Completion condition:

- Leaf nodes are completed/deferred/linked follow-up.
- Durable decision is recorded in existing route decision documentation during
  closeout.

### Leaf 2.1: Migrate Report-Only Dispatcher

Status: completed

Intent:

- Reuse helpers in `scripts/report-only-route-dispatcher.mjs` for stable hash,
  evidence normalization, route matching, and false-by-default report side
  effects.

Verification evidence:

- `node --test scripts/report-only-route-dispatcher.test.mjs` passed.
- `node --test scripts/route-decision-contract.test.mjs` passed.

Notes:

- Output shape must remain unchanged.

### Leaf 2.2: Migrate Issue Fix Request Dispatcher

Status: completed

Intent:

- Reuse helpers in `scripts/issue-fix-request-dispatcher.mjs` for stable hash
  and route matching.

Verification evidence:

- `node --test scripts/issue-fix-request-dispatcher.test.mjs scripts/issue-fix-request-e2e-replay.test.mjs` passed.
- `node --test scripts/route-decision-contract.test.mjs` passed.

Notes:

- Keep issue-fix-specific dedupe and request construction local.

### Leaf 2.3: Migrate Issue Triage Report Replay

Status: completed

Intent:

- Reuse helpers in `scripts/issue-triage-report-e2e-replay.mjs` for route
  matching and evidence normalization only.

Verification evidence:

- `node --test scripts/issue-triage-report-e2e-replay.test.mjs` passed.
- `node --test scripts/route-decision-contract.test.mjs` passed.

Notes:

- Do not move `statusForDecision` or `reasonForDecision`.
- Migrated evidence normalization only. Route matching remains local because
  issue-triage deliberately ignores `signal_kind` in route match and validates
  it through a separate allowlist/forbidden-field contract.

## Parent Node 3: Verification And Closeout

Status: pending

Completion condition:

- All child leaf nodes are completed/deferred/linked follow-up.
- Durable decisions are absorbed into long-lived documentation.

### Leaf 3.1: Route Decision Gates

Status: pending

Intent:

- Run required verification:
  - `npm run test:route-decision`
  - `bash scripts/ci-validate-gates.sh`
  - `git diff --check`

Verification evidence:

- Pending.

### Leaf 3.2: Closeout Documentation

Status: pending

Intent:

- Merge process decisions into durable docs.
- Delete this process roadmap before PR closeout.

Verification evidence:

- Pending.
