# Changelog Drafter State

Last run: 2026-07-08

## Current Capability

- Report route: `changelog-drafter-report`
  - Consumer kind: `draft-consumer`
  - Execution mode: `report-only`
  - Completion form: `draft-evidence`
  - Runner maturity: `missing`
- Draft request route: `changelog-drafter-draft-request`
  - Consumer kind: `draft-consumer`
  - Execution mode: `report-only`
  - Completion forms: `draft-pr`, `draft-evidence`, `escalation-issue`
  - Protocol maturity: `replayed`
  - Runner maturity: `missing`

## Evidence

- Report replay covers merged PR batch and manual release-prep signals to
  Changelog Draft Evidence:
  `scripts/changelog-drafter-report-e2e-replay.test.mjs`.
- Draft request replay covers existing report evidence to draft request
  candidate evidence:
  `scripts/changelog-drafter-draft-request-e2e-replay.test.mjs`.
- Replay evidence verifies duplicates, missing report rejection,
  publish-adjacent signal denial, and human gates for breaking, security,
  major-version, or oversized scan windows.

## Boundary

Changelog Drafter is not live drafting automation in this repository yet. It
must not generate `RELEASE_NOTES_DRAFT.md`, edit changelogs, create changelog
PRs, dispatch workflows, tag, release, publish packages, or start consumer work.

A future runner upgrade must produce bounded `draft-pr`, `draft-evidence`, or
`escalation-issue` evidence before either route can move beyond report-only.
