# Roadmap-Sliced Development State — ZAgenticLoop

Last run: 2026-07-09

## Active Roadmap

- Roadmap id: user-project-ready-route-consumers
- Branch: codex-user-project-ready-route-consumers
- Status: active
- Current parent node: packaged-consumer-runner-surface
- Current leaf: 2-5-route-specific-execution-apis

## Slice Status

| Leaf | Status | Evidence | Commit / PR |
|------|--------|----------|-------------|
| 2-5-route-specific-execution-apis | in-progress | CI Sweeper packaged repair-plan API and `zj-loop-ci-sweeper repair-plan` command added; Post-Merge Closeout packaged closeout-plan API and `zj-loop-post-merge-closeout closeout-plan` command added; Issue Fix Request contract helpers moved into core; Dependency Sweeper packaged repair-plan API and `zj-loop-dependency-sweeper repair-plan` command added; PR Steward packaged fix-plan API and `zj-loop-pr-steward fix-plan` command added; Changelog Drafter packaged draft-plan API and `zj-loop-changelog-drafter draft-plan` command added with draft evidence/PR actions and no release-side-effect evidence; `cd tools/zj-loop-core && npm test`; next slice: continue route-specific execution API migration for remaining action consumer | pending |
| 2-4-packaged-live-runner-evidence-contract | completed | Added `buildLiveRunnerEvidence()`, `validateLiveRunnerEvidence()`, structured evidence comment builder/parser, and completion-form/status validation to `@jununfly/zj-loop-core`; `cd tools/zj-loop-core && npm test`; `git diff --check` | pending |
| 2-3-route-specific-consumer-runner-promotion | completed | Added narrow package commands for action-capable routes; commands pin route identity and delegate to shared consumer plan gate; generated action-capable workflows for CI Sweeper, Dependency Sweeper, and Post-Merge Closeout use narrow commands while report workflows stay generic; `cd tools/zj-loop-core && npm test`; `cd tools/zj-loop-init && npm test`; `node tools/zj-loop-audit/dist/cli.js .`; `git diff --check` | pending |
| 2-2-generated-workflow-consumer-gate-integration | completed | Generated workflows and dogfood generated workflows now call `zj-loop-consumer plan` after Route Decision; core pin prepared for `0.1.3`; generated metadata hashes valid; `cd tools/zj-loop-core && npm test`; `cd tools/zj-loop-init && npm test`; `node tools/zj-loop-audit/dist/cli.js .`; `git diff --check` | pending |
| 2-1-runner-command-contract | completed | Added `buildConsumerRunPlan()` and `zj-loop-consumer plan`; blocks disabled routes, invalid execution contracts, and non-`user-project-ready` action routes; report-only routes produce evidence plans; `cd tools/zj-loop-core && npm test`; `node tools/zj-loop-audit/dist/cli.js .`; `git diff --check` | pending |
| 1-2-user-project-readiness-status-surface | completed | `zj-loop-route status` table/JSON exposes readiness and `user_project_ready`; README/README.zh-CN/Quickstart describe route self-selection and `dogfooded-live` vs `user-project-ready`; `cd tools/zj-loop-core && npm test`; `node tools/zj-loop-audit/dist/cli.js .`; `git diff --check` | pending |
| 1-1-generated-bundle-route-identity-alignment | completed | Generated workflow templates and dogfood generated workflows now dispatch `pr-steward-report`, `issue-triage-report`, `changelog-drafter-report`, and `post-merge-roadmap-closeout`; generated Route Table template separates report/action/fix-request route ids; `cd tools/zj-loop-init && npm test`; `npm run check:zj-loop-init`; `git diff --check` | `7e46acd` |
| user-project-ready-route-consumers-roadmap | active | Issue-triggered Activation Request process accepted by human; roadmap seeded from `docs/plans/user-project-ready-route-consumer-checklist.md` | pending |
| 4-2-closeout | completed | `bash scripts/ci-validate-gates.sh` passed after network-enabled rerun; `bash scripts/ci-audit-gates.sh` passed; `git diff --check`; durable docs/state already carry the live/non-live runner matrix and verification commands; process roadmap `docs/plans/live-runner-upgrades-roadmap.md` deleted | pending |
| 4-1-product-and-docs-alignment | completed | README and README.zh-CN automation boundary tables; Chinese GitHub Actions bundle section; `zj-loop/ZJ-LOOP.md` and Dogfood Reference verification command updates; roadmap/state branch and next-leaf alignment; `git diff --check`; `node tools/zj-loop-audit/dist/cli.js .` | pending |
| 3-2-issue-triage-action-route-design | completed | `scripts/issue-triage-action-runner.mjs`; `scripts/issue-triage-action-runner.test.mjs`; `scripts/live-runner-contract.mjs`; `tools/zj-loop-core/src/route.ts`; `tools/zj-loop-audit/src/auditor.ts`; `zj-loop/issue-triage-state.md`; Route Table/doc updates; `npm run build` in `tools/zj-loop-core`; `npm run build` in `tools/zj-loop-audit`; `node --test scripts/issue-triage-action-runner.test.mjs scripts/issue-triage-report-e2e-replay.test.mjs scripts/live-runner-contract.test.mjs`; `node --test tools/zj-loop-core/test/route.test.mjs`; `npm run test:route-decision`; `node tools/zj-loop-audit/dist/cli.js .`; `git diff --check` | pending |
| 3-1-changelog-drafter-live-draft-consumer | completed | `scripts/changelog-drafter-live-runner.mjs`; `scripts/changelog-drafter-live-runner.test.mjs`; `scripts/write-file-once.mjs`; `scripts/write-file-once.test.mjs`; `zj-loop/changelog-drafter-state.md`; Route Table/doc updates; `node --test scripts/changelog-drafter-live-runner.test.mjs scripts/changelog-drafter-draft-request-e2e-replay.test.mjs scripts/changelog-drafter-report-e2e-replay.test.mjs scripts/live-runner-contract.test.mjs`; `git diff --check` | `89dc12e` |
| 2-3-pr-steward-live-runner | completed | `scripts/pr-steward-live-runner.mjs`; `scripts/pr-steward-live-runner.test.mjs`; `zj-loop/pr-steward-state.md`; Route Table/doc updates; `node --test scripts/pr-steward-live-runner.test.mjs scripts/pr-steward-claim-e2e-replay.test.mjs scripts/pr-steward-fix-request-e2e-replay.test.mjs scripts/live-runner-contract.test.mjs`; `git diff --check` | `7b3b69a` |
| 2-2-dependency-sweeper-live-runner | completed | `scripts/dependency-sweeper-live-runner.mjs`; `scripts/dependency-sweeper-live-runner.test.mjs`; `scripts/issue-fix-request-dispatcher.mjs`; `zj-loop/dependency-sweeper-state.md`; Route Table/doc updates; `node --test scripts/dependency-sweeper-live-runner.test.mjs scripts/dependency-sweeper-claim-e2e-replay.test.mjs scripts/dependency-sweeper-route-e2e-replay.test.mjs scripts/live-runner-contract.test.mjs`; `git diff --check` | `8bb37a3` |
| 2-1-post-merge-cleanup-live-runner | completed | `scripts/post-merge-roadmap-closeout.mjs`; `scripts/post-merge-roadmap-closeout.test.mjs`; `zj-loop/post-merge-state.md`; `node --test scripts/post-merge-roadmap-closeout.test.mjs scripts/live-runner-contract.test.mjs`; `node tools/zj-loop-audit/dist/cli.js .`; `git diff --check` | pending |
| 1-2-route-table-live-eligibility-gate | completed | `tools/zj-loop-core/src/route.ts`; `tools/zj-loop-core/test/route.test.mjs`; `npm run build`; `node --test tools/zj-loop-core/test/route.test.mjs`; `node tools/zj-loop-audit/dist/cli.js .`; `git diff --check` | pending |
| 1-1-runner-lifecycle-contract | completed | `scripts/live-runner-contract.mjs`; `scripts/live-runner-contract.test.mjs`; Route Consumer Execution Architecture; `node --test scripts/live-runner-contract.test.mjs`; `node tools/zj-loop-audit/dist/cli.js .`; `git diff --check` | pending |
| live-runner-upgrades-roadmap | completed | Process roadmap created for live-runner-upgrades, executed, and deleted at closeout after durable docs/state absorbed key decisions; Route Table baseline review; `git diff --check` | pending |
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

- Process roadmap `docs/plans/live-runner-upgrades-roadmap.md` was deleted
  after durable docs and consumer-owned state files absorbed the live/non-live
  capability matrix, runner evidence boundaries, and verification commands.
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
- Full live-runner-upgrades closeout gates passed on 2026-07-09:
  - `bash scripts/ci-validate-gates.sh`
  - `bash scripts/ci-audit-gates.sh`
  - `git diff --check`
- Branch cleanup plan: delete `zjal/live-runner-closeout` after
  human-reviewed PR merge.
