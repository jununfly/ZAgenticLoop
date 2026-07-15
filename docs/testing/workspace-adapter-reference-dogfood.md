# Workspace Adapter Reference Dogfood

This reference proves the no-provider Workspace Adapter in real temporary Git
worktrees. It does not treat local files as a substitute for issue or PR/MR
semantic objects.

Run the reference suite with:

```bash
cd tools/zj-loop-core && npm test
```

The dispatch integration tests exercise these applicable route families:

| Route family | Workspace outcome | Evidence |
| --- | --- | --- |
| Manual Smoke / control report | Local report evidence without a code diff | `zj-loop/evidence/workspace-reports/` |
| CI Sweeper | Current Git patch and changed-file manifest | `zj-loop/reviews/` |
| Dependency Sweeper | Current Git patch and changed-file manifest | `zj-loop/reviews/` |
| Changelog Drafter | Draft evidence by default; patch only with `workspace_draft_mode: file-patch` | `zj-loop/evidence/workspace-drafts/` or `zj-loop/reviews/` |
| Roadmap-Sliced Development | Current Git patch and changed-file manifest | `zj-loop/reviews/` |

The shared lifecycle is:

```text
provider:none signal -> local activation carrier -> route-decision evidence
-> route-specific evidence or review artifact -> local closeout/resume
```

The Workspace Adapter intentionally does not apply to issue triage actions,
issue transitions, PR Steward reports, or PR Steward fix requests. Those
routes require issue or PR/MR semantic objects and remain
`not-applicable-with-reason` for Workspace.

`zj-loop-workspace-closeout` archives only an accepted local activation
carrier. It does not create, merge, or delete Git branches.
