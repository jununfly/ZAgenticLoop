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

Current focus: `4. Upgrade And Audit`

Next action: start leaf `4.1 Add zj-loop-init --upgrade github-actions`.

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

## Completion Condition

All roadmap parent nodes are completed or explicitly deferred with linked
follow-up evidence, durable design decisions are merged into long-lived docs,
and process roadmap files are either removed or migrated during closeout.
