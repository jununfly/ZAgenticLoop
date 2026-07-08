# Roadmap-Sliced State

Roadmap id: `workflow-dispatch-user-project-bundle`

Carrier issue: https://github.com/jununfly/ZAgenticLoop/issues/52

Activation request: `rsd-52-workflow-dispatch-bundle`

Roadmap branch: `zjal/workflow-dispatch-user-project-bundle`

Roadmap file:
`docs/plans/workflow-dispatch-user-project-bundle-roadmap.md`

Roadmap view:
`docs/plans/workflow-dispatch-user-project-bundle-checklist.md`

Current status: `in-progress`

Current focus: `5. Documentation And Dogfood`

Next action: start leaf `5.1 Update README and QUICKSTART with install, smoke, enable, verify, disable/rollback, and upgrade commands`.

Last updated: 2026-07-08

## Process Evidence

- GitHub carrier issue created: #52
- Slash command comment:
  https://github.com/jununfly/ZAgenticLoop/issues/52#issuecomment-4912094358
- Activation request comment:
  https://github.com/jununfly/ZAgenticLoop/issues/52#issuecomment-4912098429
- Activation consumed comment:
  https://github.com/jununfly/ZAgenticLoop/issues/52#issuecomment-4912126166
- Slice 1 verification:
  - `npm test` in `tools/zj-loop-init`
  - `npm run check:zj-loop-init`
- Slice 2 verification:
  - `npm test` in `tools/zj-loop-core`
  - `npm test` in `tools/zj-loop-init`
- Slice 4 verification:
  - `npm test` in `tools/zj-loop-audit`
  - `npm test` in `tools/zj-loop-init`
  - `npm test` in `tools/zj-loop-core`
  - `npm run check:zj-loop-init`
  - `node dist/cli.js ../..` in `tools/zj-loop-audit`
  - `bash scripts/before-after-demo.sh`
  - `git diff --check`

## Completion Condition

All roadmap parent nodes are completed or explicitly deferred with linked
follow-up evidence, durable design decisions are merged into long-lived docs,
and process roadmap files are either removed or migrated during closeout.
