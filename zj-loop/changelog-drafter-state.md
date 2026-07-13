# Changelog Drafter State

Last run: 2026-07-13

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
  - Runner maturity: `replayed`

## Evidence

- Report replay covers merged PR batch and manual release-prep signals to
  Changelog Draft Evidence:
  `scripts/changelog-drafter-report-e2e-replay.test.mjs`.
- Draft request replay covers existing report evidence to draft request
  candidate evidence:
  `scripts/changelog-drafter-draft-request-e2e-replay.test.mjs`.
- Live runner replay covers `draft-request-candidate -> draft-evidence`,
  `draft-request-candidate -> draft-pr`, and escalation paths:
  `scripts/changelog-drafter-live-runner.test.mjs`.
- Reviewable draft outcome recorded as draft-evidence and draft-pr replay
  evidence. `draft-evidence` is the minimum successful workflow-dispatch
  dogfood outcome; `draft-pr` is stronger but not required for runner maturity
  promotion.
- Side effect boundary: tag_created=false, release_created=false,
  package_published=false, final_changelog_acceptance=false.
- Replay evidence verifies duplicates, missing report rejection,
  publish-adjacent signal denial, and human gates for breaking, security,
  major-version, or oversized scan windows.
- Real workflow-dispatch dogfood evidence:
  https://github.com/jununfly/ZAgenticLoop/actions/runs/29247657726
  - Event: `workflow_dispatch`
  - Branch: `codex/changelog-drafter-live-draft-path`
  - Inputs: `core_package=./tools/zj-loop-core`, `draft_mode=evidence`,
    `confirm_live_draft=CREATE_CHANGELOG_DRAFT_PR_OR_EVIDENCE`
  - Artifact includes `live-draft-result.json` and
    `draft-artifacts/changelog-draft.md`.
  - Live runner outcome: `draft-evidence`, status `completed`.
  - Side effect boundary: tag_created=false, release_created=false,
    package_published=false, final_changelog_acceptance=false.

## Boundary

Changelog Drafter is not live route automation in this repository yet. The
draft request route remains `report-only`, so automatic routing must not start
consumer work, generate release notes drafts, edit changelogs, create changelog
PRs, dispatch workflows, tag, release, publish packages, or finalize changelog
acceptance.

`scripts/changelog-drafter-live-runner.mjs` is now a replayed, guarded runner
for existing `draft-request-candidate` evidence. It requires the fixed
confirmation phrase `CREATE_CHANGELOG_DRAFT_PR_OR_EVIDENCE`, a clean working
tree, a non-human-gated `main` release window, and a safe markdown draft path.
It can produce `draft-evidence` or an independent `draft-pr`; tag, release,
publish, and final changelog acceptance remain false in runner evidence. The
route may move beyond report-only only after real workflow-dispatch dogfood
evidence shows draft evidence or draft PR creation is safe.
