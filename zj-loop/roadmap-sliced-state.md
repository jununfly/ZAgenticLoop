# Roadmap-Sliced Development State — ZAgenticLoop

Last run: 2026-07-08

## Active Roadmap

- Roadmap id: route-consumer-execution
- Branch: zjal/route-consumer-execution
- Current parent node: consumer-runner-completion
- Current leaf: 2-1-ci-sweeper-completion-evidence

## Slice Status

| Leaf | Status | Evidence | Commit / PR |
|------|--------|----------|-------------|
| 1-7-audit-fail-upgrade-branch | completed | `tools/zj-loop-audit/src/auditor.ts`; generated bundle fail test; live readiness fail test; `npm run build`; `node --test tools/zj-loop-audit/test/auditor.test.mjs`; `node tools/zj-loop-audit/dist/cli.js .` | pending |
| 1-6-template-and-init-defaults | completed | `templates/zj-loop-route-table.yaml.template`; `node --test test/cli.test.mjs` in `tools/zj-loop-init`; `npm run check:zj-loop-init`; `bash scripts/ci-validate-gates.sh` with network rerun | pending |
| 1-5-audit-warning-branch | completed | `tools/zj-loop-audit/src/auditor.ts`; audit warning test; `npm run build`; `node --test tools/zj-loop-audit/test/auditor.test.mjs`; `node tools/zj-loop-audit/dist/cli.js .` | pending |
| 1-4-status-surface | completed | `zj-loop-route status` capability table; JSON detail path; `npm run build`; `node --test tools/zj-loop-core/test/route.test.mjs` | pending |
| 1-3-deterministic-contract-helpers | completed | `tools/zj-loop-core/src/route.ts`; `tools/zj-loop-core/test/route.test.mjs`; `npm run build`; `node --test tools/zj-loop-core/test/route.test.mjs`; dogfood Route Table contract helper validation | pending |
| 1-2-durable-architecture-doc | completed | `docs/designs/route-consumer-execution-architecture.md`; linked from route table/dogfood docs; `git diff --check` | pending |
| 1-1-dogfood-route-table-truth | completed | `zj-loop/zj-loop-route-table.yaml`; existing parser read 13 routes; `git diff --check` | pending |
| route-consumer-execution-roadmap | completed | `docs/plans/route-consumer-execution-roadmap.md`; `git diff --check` | pending |
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
  `docs/plans/route-consumer-execution-roadmap.md`. It must be merged into
  durable docs or PR body before deletion at closeout.
- Process roadmap files were deleted after durable docs absorbed the key
  decisions.
- Durable references:
  - `README.md`
  - `docs/QUICKSTART.md`
  - `docs/designs/route-table-architecture.md`
  - `docs/designs/dogfood-reference-case.md`
- Branch cleanup plan: delete `zjal/workflow-dispatch-user-project-bundle` after
  human-reviewed PR merge.
- PR handoff: https://github.com/jununfly/ZAgenticLoop/pull/53
