# Changelog Drafter Report E2E Test Cases

These test cases verify the report-only release-prep route:

```text
Merged PR Batch / Manual Release Prep -> Route Decision -> Changelog Draft Evidence
```

The route records reviewable evidence for Changelog Drafter. It does not run the
Changelog Drafter consumer, generate release notes, edit `CHANGELOG.md`, create
PRs, create tags, publish releases, publish packages, or dispatch workflows.

## Local Replay Gate

Run:

```bash
node scripts/changelog-drafter-report-e2e-replay.mjs
node --test scripts/changelog-drafter-report-e2e-replay.test.mjs
```

Expected results:

- Merged PR release windows create report evidence in
  `zj-loop/changelog-drafter-state.md`.
- Manual release-prep signals create the same report evidence shape.
- Duplicate release windows return the existing evidence instead of creating a
  second report.
- Breaking, security, major-version, and oversized scan-window signals are not
  denied, but they require human review before changelog drafting.
- Tag and release events are denied in this first route slice because they are
  too close to publishing actions.
- Every side-effect flag remains false.

## Route Scope

Route id: `changelog-drafter-report`

Allowed signals:

- `source: pull_request`, `action: merged | merged_batch`, `base_branch: main`
- `source: human`, `action: release_prep`, `base_branch: main`

Denied in the first slice:

- tag events
- release events
- workflow-dispatch requests
- generated release notes drafts
- changelog edits
- changelog PRs
- tag/release/package publishing

## Dedupe

The route dedupes by release window:

```text
changelog:<repo>:<base_branch>:<since_ref>:<until_ref>
```

This keeps Changelog Drafter aligned with its real work unit: a release window,
not individual PRs and not calendar days.

## Closeout Decision Audit

| Decision | Classification | Durable home |
| --- | --- | --- |
| Changelog Drafter first Route Decision is `changelog-drafter-report`, not `changelog-drafter`. | durable doc | This test case and route table. |
| First slice is report-only and writes evidence to `zj-loop/changelog-drafter-state.md`. | durable doc | This test case and `zj-loop/ZJ-LOOP.md`. |
| The runtime route does not require Roadmap-Sliced activation; activation is only for implementation workflow. | durable doc | This test case and carrier issue #29. |
| Dedupe uses release window keys. | durable doc | Replay tests. |
| Breaking/security signals require human review but are not denied. | durable doc | Replay tests. |
