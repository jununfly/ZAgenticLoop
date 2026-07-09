# User Project Execution-Ready Roadmap

Status: in progress
Branch: `zjal-user-project-execution-ready-roadmap-activation`
Source checklist: `docs/plans/user-project-implementation-gap-checklist.md`

Goal: move the generated user-project bundle from installable workflow evidence
toward route-by-route execution-ready behavior, starting with issue-triggered
Roadmap Activation.

## Parent 1: Readiness Vocabulary And Route Contract

Completion condition: code, template, tests, and release gate can distinguish
`install-ready` from `execution-ready`; no generated route can imply live user
execution through ambiguous `user-project-ready` wording.

- [x] Leaf 1-1: add readiness vocabulary support and tests in
  `@jununfly/zj-loop-core`.
  - Status: completed.
  - Verification: `cd tools/zj-loop-core && npm test` passed.
- [x] Leaf 1-2: update generated Route Table template and generated-bundle
  release gate to use `install-ready`/`execution-ready`.
  - Status: completed.
  - Verification: `npm run test:generated-bundle-release-gate` passed;
    `npm run check:zj-loop-init` passed.
- [x] Leaf 1-3: update user-facing docs wording so capability claims are
  readiness-specific.
  - Status: completed.
  - Verification: README/Quickstart keyword scan found no remaining
    `user-project-ready` or `dogfooded-live` wording; `npm run
    test:zj-loop-core`, `npm run test:zj-loop-init`, and `npm run
    test:generated-bundle-release-gate` passed.

## Parent 2: Roadmap Activation Deterministic Protocol

Completion condition: deterministic code owns activation command parsing,
authorization, dedupe, stable IDs, carrier comments, route validation,
branch/PR/contract generation, lifecycle classification, loop prevention, and
workflow summary next steps.

- [ ] Leaf 2-1: add Roadmap Activation contract helpers for stable IDs,
  branch/PR naming, PR body contract, lifecycle transitions, and loop markers.
- [ ] Leaf 2-2: expose contract helpers through the Roadmap Activation CLI.
- [ ] Leaf 2-3: update workflow template to call deterministic package
  commands and emit structured evidence.

## Parent 3: Deterministic User-Project Fixture

Completion condition: local deterministic fixture proves issue-comment signal
to Activation Request to Route Dispatcher to consumer dry-run plan, including
disabled, duplicate, invalid actor, missing permission, and loop-prevention
cases.

- [ ] Leaf 3-1: add fixture/replay script for local Roadmap Activation
  execution-ready dry-run.
- [ ] Leaf 3-2: wire fixture into release gate.
- [ ] Leaf 3-3: document GitHub smoke fixture as dogfood/periodic validation.

## Parent 4: Closeout And Durable Docs

Completion condition: process decisions are merged into durable architecture
docs, process files are removed or migrated, and PR evidence contains the
complete reviewable trail.

- [ ] Leaf 4-1: update durable architecture docs.
- [ ] Leaf 4-2: clean process files after durable docs absorb decisions.
- [ ] Leaf 4-3: final verification and PR handoff.
