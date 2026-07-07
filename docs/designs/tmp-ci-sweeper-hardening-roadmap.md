# CI Sweeper Hardening Roadmap

Process roadmap for issue #44 and branch `zjal/ci-sweeper-hardening`.

Activation request: `rsd-44-ci-sweeper-hardening`

## Goal

Harden the live CI Sweeper route for loop prevention and evidence clarity
without expanding deterministic repair capability.

Confirmed boundaries:

- Keep deterministic repair allowlist narrow.
- Do not add auto-merge.
- Use deterministic scripts for lifecycle classification and evidence text where
  suitable.
- Keep human-facing evidence in `zj-loop/STATE.md`; keep machine fields in
  GitHub Actions outputs.
- Touching `.github/workflows/**` requires PR review.

## Decisions

- Existing lifecycle is classified in this priority order, first match wins:
  `existing_repair_pr`, `existing_issue_fix_request`,
  `existing_escalation_issue`, `none`.
- Open escalation for the same `source_run_id` suppresses new dispatch and new
  Issue Fix Request creation.
- Generated CI Sweeper branch denial is a hard route denial with
  `next_action` and `loop_prevention` evidence; it does not create an issue and
  does not become a Human Gate.
- Stale `source_run_id` is a hard route denial. It records evidence only.
- Same-day generated repair branch behavior remains "regenerate from current
  `main` and push with `--force-with-lease`"; do not rebase stale generated
  commits.

## Leaf 1: Route Decision Contract Hardening

Status: completed

Commit intent: `test(route): harden ci sweeper route decision contract`

Gate:

- `node --test scripts/route-ci-failure.test.mjs`

Work:

- Add deterministic route outputs for generated branch denial:
  `next_action` and `loop_prevention`.
- Add deterministic stale `source_run_id` handling.
- Preserve no-dispatch behavior for duplicate lifecycle inputs.

Evidence:

- Added route decision test coverage for generated branch denial evidence and
  stale source run denial.
- Implemented `next_action`, `loop_prevention`, and stale-source no-dispatch
  route fields.
- Verification passed: `node --test scripts/route-ci-failure.test.mjs`.

## Leaf 2: Existing Lifecycle Classifier

Status: completed

Commit intent: `feat(route): classify existing ci sweeper lifecycle`

Gate:

- `node --test scripts/ci-sweeper-lifecycle.test.mjs`

Work:

- Add a deterministic classifier for existing repair PR, Issue Fix Request, and
  escalation issue evidence.
- Generate stable GitHub Actions outputs and a stable `zj-loop/STATE.md`
  Markdown evidence fragment.

Evidence:

- Added deterministic `scripts/ci-sweeper-lifecycle.mjs`.
- Classifier priority is first match wins: repair PR, Issue Fix Request,
  escalation issue, then none.
- Script emits GitHub Actions outputs plus stable `zj-loop/STATE.md` Markdown
  evidence.
- Verification passed: `node --test scripts/ci-sweeper-lifecycle.test.mjs`.

## Leaf 3: Daily Triage Integration

Status: pending

Commit intent: `feat(loop): use ci sweeper lifecycle classification in daily triage`

Gate:

- `node --test scripts/ci-sweeper-workflow-contract.test.mjs`
- `bash scripts/ci-validate-gates.sh`

Work:

- Replace ad hoc duplicate handling in `daily-triage.yml` with the deterministic
  lifecycle classifier output.
- Dispatch CI Sweeper only when route decision dispatches and lifecycle is
  `none`.
- Write clear existing-lifecycle and loop-prevention evidence into
  `zj-loop/STATE.md`.

Evidence:

- Pending.

## Leaf 4: Replay And Durable Docs

Status: pending

Commit intent: `docs(testing): document ci sweeper hardening replay coverage`

Gate:

- `node --test scripts/ci-sweeper-e2e-replay.test.mjs scripts/ci-sweeper-workflow-contract.test.mjs`
- `npm run test:protocol-terminology`
- `git diff --check`

Work:

- Add replay coverage for generated branch denied, duplicate source run,
  existing escalation, stale source run, and same-day branch overwrite behavior.
- Update durable docs/checklists with the confirmed hardening decisions.

Evidence:

- Pending.

## Closeout

Status: pending

Gate:

- process roadmap decisions merged into durable docs or PR body
- this temporary roadmap deleted
- draft PR opened with post-merge cleanup contract

Evidence:

- Pending.
