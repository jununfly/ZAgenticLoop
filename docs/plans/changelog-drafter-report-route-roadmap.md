# Changelog Drafter Report Route Roadmap

Roadmap id: `changelog-drafter-report-route`
Branch: `zjal/changelog-drafter-report-route`
Activation carrier: [jununfly/ZAgenticLoop#29](https://github.com/jununfly/ZAgenticLoop/issues/29)
Activation request: [issuecomment-4899364242](https://github.com/jununfly/ZAgenticLoop/issues/29#issuecomment-4899364242)
Activation consumed: [issuecomment-4899368875](https://github.com/jununfly/ZAgenticLoop/issues/29#issuecomment-4899368875)

## Goal

Implement the next Route Decision slice:

```text
Merged PR Batch / Manual Release Prep -> Route Decision -> Changelog Draft Evidence
```

## Decisions

- Route id: `changelog-drafter-report`.
- Consumer: `changelog-drafter`.
- Request kind: `report-only`.
- Evidence store: `zj-loop/changelog-drafter-state.md`.
- Runtime route does not require activation; activation is only for this
  implementation workflow.
- First version supports merged PR and manual release-prep signals.
- First version does not support tag or release events.
- Route Decision records evidence only. It does not generate release notes,
  edit `CHANGELOG.md`, create PRs, tag, release, publish packages, or dispatch
  workflows.
- Dedupe key: `changelog:<repo>:<base_branch>:<since_ref>:<until_ref>`.
- Breaking/security signals are not denied, but require human review before
  drafting.

## Slices

### 1. Report Route Contract

Status: completed
Commit intent: `Add Changelog Drafter report route`
Gate:

- `npm run test:changelog-drafter-report`
- `npm run test:route-decision`
- `npm run validate:registry`
- `npm run check:zj-loop-init`
- `git diff --check`

Work:

- Add `changelog-drafter-report` to the dogfood route table.
- Add deterministic replay coverage for allowed, duplicate, human-gated, and
  denied release-prep signals.
- Update durable testing/design docs.
- Keep side effects report-only.

Verification evidence:

- `npm run test:changelog-drafter-report` passed.
- `npm run test:route-decision` passed.
- `npm run validate:registry` passed.
- `npm run check:zj-loop-init` passed.
- `git diff --check` passed.

Notes:

- Implementation started only after the issue-triggered Activation Request was
  created and consumed on GitHub issue #29.
- The route records release-window report evidence only. It does not run
  Changelog Drafter, generate release notes, edit changelogs, create PRs, tag,
  release, publish packages, or dispatch workflows.

### 2. Closeout

Status: pending
Commit intent: `Close out Changelog Drafter report route roadmap`
Gate:

- durable docs absorb decisions
- process roadmap is deleted
- Roadmap Handoff Gate passes after PR creation

Work:

- Audit decisions into durable docs and PR body.
- Delete this process roadmap before PR handoff.
