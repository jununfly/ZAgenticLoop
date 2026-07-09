# Issue 6 Roadmap — Daily Triage Local Registry And Execution Authority

Source issue: https://github.com/jununfly/ZAgenticLoop/issues/6
Issue Fix Request: https://github.com/jununfly/ZAgenticLoop/issues/6#issuecomment-4925604217
Activation run: https://github.com/jununfly/ZAgenticLoop/actions/runs/29022420139
Branch: `zjal/issue-6-daily-triage-local-registry`

## Goal

Make the daily-triage setup flow trustable for real user projects:

- cost reads the same local registry truth that init/audit create
- init does not silently overwrite an existing loop contract
- daily-triage runtime state defaults are safer for cursor-based local runs
- readiness level and execution authority are described as separate concepts

## Leaf Slices

| Leaf | Status | Commit intent | Gate | Notes |
| --- | --- | --- | --- | --- |
| 1-cost-local-registry | completed | `cost: prefer project registry and expose registry source` | `cd tools/zj-loop-cost && npm test`; `git diff --check` | Added project-root positional support, `--registry`, `--package-registry`, and human/JSON registry source evidence. `cd tools/zj-loop-cost && npm test` passed. |
| 2-init-existing-loop-safety | pending | `init: guard existing loop contract overwrite` | `cd tools/zj-loop-init && npm test`; `npm run check:zj-loop-init`; `git diff --check` | Default should skip/refuse replacing an existing `zj-loop/ZJ-LOOP.md`; `--force` remains explicit overwrite. |
| 3-daily-triage-runtime-state | pending | `init: scaffold daily triage runtime state safely` | `cd tools/zj-loop-init && npm test`; `bash scripts/ci-audit-gates.sh`; `git diff --check` | Decide whether state examples/gitignore can be implemented narrowly without breaking current repo dogfood. |
| 4-readiness-execution-language | pending | `docs: separate readiness level from execution authority` | `npm run validate:registry`; `bash scripts/ci-audit-gates.sh`; `git diff --check` | Update docs/tool text where users could confuse L3 readiness with live mutation authority. |
| 5-closeout | pending | `docs: close issue 6 roadmap` | `bash scripts/ci-validate-gates.sh`; `bash scripts/ci-audit-gates.sh`; `git diff --check` | Merge process decisions into durable docs, remove this roadmap, open PR with post-merge contract. |

## Decisions

- Keep #6 as the lifecycle carrier. Do not create a separate Issue Fix Request issue.
- Use one PR for this issue unless implementation proves the runtime-state slice needs a separate follow-up.
- Process roadmap is temporary and must be deleted during closeout after durable docs absorb the decisions.
