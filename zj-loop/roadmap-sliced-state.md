# Roadmap-Sliced Development State — ZAgenticLoop

Last run: 2026-07-08

## Active Roadmap

- Roadmap id: live-runner-upgrades
- Branch: zjal/live-runner-upgrades
- Status: active
- Current parent node: cleanup-and-fix-runners
- Current leaf: 2-1-post-merge-cleanup-live-runner

## Slice Status

| Leaf | Status | Evidence | Commit / PR |
|------|--------|----------|-------------|
| 1-2-route-table-live-eligibility-gate | completed | `tools/zj-loop-core/src/route.ts`; `tools/zj-loop-core/test/route.test.mjs`; `npm run build`; `node --test tools/zj-loop-core/test/route.test.mjs`; `node tools/zj-loop-audit/dist/cli.js .`; `git diff --check` | pending |
| 1-1-runner-lifecycle-contract | completed | `scripts/live-runner-contract.mjs`; `scripts/live-runner-contract.test.mjs`; Route Consumer Execution Architecture; `node --test scripts/live-runner-contract.test.mjs`; `node tools/zj-loop-audit/dist/cli.js .`; `git diff --check` | pending |
| live-runner-upgrades-roadmap | completed | `docs/plans/live-runner-upgrades-roadmap.md`; Route Table baseline review; `git diff --check` | pending |
| 2-8-release-readiness-closeout | completed | `bash scripts/ci-validate-gates.sh`; `bash scripts/ci-audit-gates.sh`; `git diff --check`; process roadmap deleted after durable docs/state absorbed key decisions | pending |
| 2-7-report-only-boundaries | completed | `zj-loop/issue-triage-state.md`; Dogfood Reference Case report-only boundary section; report-only dispatcher and issue triage replay tests; `node tools/zj-loop-audit/dist/cli.js .` | pending |
| 2-6-roadmap-sliced-activation-consumer | completed | `zj-loop/roadmap-activation-state.md`; Dogfood Reference Case; roadmap activation replay/dispatcher tests; `node tools/zj-loop-audit/dist/cli.js .` | pending |
| 2-5-post-merge-cleanup-consumer | completed | `zj-loop/post-merge-state.md`; Dogfood Reference Case; post-merge contract/e2e/executor/workflow tests; `node tools/zj-loop-audit/dist/cli.js .` | pending |
| 2-4-changelog-drafter-draft-consumer | completed | `zj-loop/changelog-drafter-state.md`; Dogfood Reference Case; Changelog Drafter report/draft-request replay tests; `node tools/zj-loop-audit/dist/cli.js .` | pending |
| 2-3-pr-steward-runner | completed | `zj-loop/pr-steward-state.md`; Dogfood Reference Case; PR Steward report/fix-request/claim replay tests; `node tools/zj-loop-audit/dist/cli.js .` | pending |
| 2-2-dependency-sweeper-runner | completed | `zj-loop/dependency-sweeper-state.md`; Dogfood Reference Case; dependency route/claim replay tests; `node tools/zj-loop-audit/dist/cli.js .` | pending |
| 2-1-ci-sweeper-completion-evidence | completed | `zj-loop/ci-sweeper-state.md`; Dogfood Reference Case; CI Sweeper deterministic/lifecycle/e2e tests; `node tools/zj-loop-audit/dist/cli.js .` | pending |
| 1-7-audit-fail-upgrade-branch | completed | `tools/zj-loop-audit/src/auditor.ts`; generated bundle fail test; live readiness fail test; `npm run build`; `node --test tools/zj-loop-audit/test/auditor.test.mjs`; `node tools/zj-loop-audit/dist/cli.js .` | pending |
| 1-6-template-and-init-defaults | completed | `templates/zj-loop-route-table.yaml.template`; `node --test test/cli.test.mjs` in `tools/zj-loop-init`; `npm run check:zj-loop-init`; `bash scripts/ci-validate-gates.sh` with network rerun | pending |
| 1-5-audit-warning-branch | completed | `tools/zj-loop-audit/src/auditor.ts`; audit warning test; `npm run build`; `node --test tools/zj-loop-audit/test/auditor.test.mjs`; `node tools/zj-loop-audit/dist/cli.js .` | pending |
| 1-4-status-surface | completed | `zj-loop-route status` capability table; JSON detail path; `npm run build`; `node --test tools/zj-loop-core/test/route.test.mjs` | pending |
| 1-3-deterministic-contract-helpers | completed | `tools/zj-loop-core/src/route.ts`; `tools/zj-loop-core/test/route.test.mjs`; `npm run build`; `node --test tools/zj-loop-core/test/route.test.mjs`; dogfood Route Table contract helper validation | pending |
| 1-2-durable-architecture-doc | completed | `docs/designs/route-consumer-execution-architecture.md`; linked from route table/dogfood docs; `git diff --check` | pending |
| 1-1-dogfood-route-table-truth | completed | `zj-loop/zj-loop-route-table.yaml`; existing parser read 13 routes; `git diff --check` | pending |
| route-consumer-execution-roadmap | completed | Process roadmap created, executed, then deleted at closeout after durable docs/state absorbed key decisions | pending |
| workflow-dispatch-user-project-bundle | completed | README, Quickstart, Route Table Architecture, Dogfood Reference Case, generated `zj-loop-*.yml` workflows, audit/validate gates | `2637db0`, `9672593`, PR #53 |

## Human Gates

- Naming or public terminology:
- Scope expansion:
- Release/package identity:
- Branch merge approval:
- Process roadmap deletion or durable retention:

## Closeout Checklist

- [x] All leaf nodes are completed, deferred, or linked to follow-up
- [x] Durable decisions are moved into docs or PR body
- [x] Verification evidence is attached before commit
- [x] Closeout commit is separate from final feature slice
- [x] PR handoff includes branch cleanup plan

## Closeout Notes

- Active process roadmap:
  `docs/plans/live-runner-upgrades-roadmap.md`. It must be merged into durable
  docs/state or deleted at closeout.
- Process roadmap `docs/plans/route-consumer-execution-roadmap.md` was deleted
  after durable docs and consumer-owned state files absorbed the key decisions,
  capability map, and verification evidence.
- Durable references:
  - `docs/designs/route-consumer-execution-architecture.md`
  - `docs/designs/route-table-architecture.md`
  - `docs/designs/dogfood-reference-case.md`
  - `zj-loop/ci-sweeper-state.md`
  - `zj-loop/dependency-sweeper-state.md`
  - `zj-loop/pr-steward-state.md`
  - `zj-loop/changelog-drafter-state.md`
  - `zj-loop/post-merge-state.md`
  - `zj-loop/roadmap-activation-state.md`
  - `zj-loop/issue-triage-state.md`
- Full closeout gates passed on 2026-07-08:
  - `bash scripts/ci-validate-gates.sh`
  - `bash scripts/ci-audit-gates.sh`
  - `git diff --check`
- Branch cleanup plan: delete `zjal/route-consumer-execution` after
  human-reviewed PR merge.
