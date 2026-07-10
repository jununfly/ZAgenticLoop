# ZAgenticLoop 0.1 next release notes

Release scope:

- `@jununfly/zj-loop-core@0.1.5`
- `@jununfly/zj-loop-init@0.1.8`

This release does not publish audit, cost, sync, MCP, or goal-audit packages.

## Highlights

- GitHub route chains are now release-ready for the two validated dogfood paths:
  - `Signal -> Route Decision -> Issue Fix Request -> Fix Consumer -> Fix PR`
  - `Plan Signal -> Route Decision -> Activation Request -> Roadmap-Sliced Consumer -> Roadmap Branch/PR`
- GitLab support is aligned with the current GitHub provider baseline where the provider abstraction can safely share behavior.
- Generated GitHub Actions and GitLab CI bundles use explicit route table control, provider-aware defaults, and deterministic core package pins.
- Roadmap-Sliced activation, issue backlog triage, PR steward, dependency sweeper, changelog drafter, CI sweeper, and post-merge closeout have clearer route/consumer boundaries and stronger replay evidence.
- User project setup now favors a workflow-dispatch bundle that can start report-only and selectively enable live consumers.

## Operational notes

- Generated GitHub workflow templates and this repository's dogfood workflows pin `@jununfly/zj-loop-core@0.1.5`.
- GitLab no-publish validation can use a local packed core tarball via `--gitlab-core-package`.
- `@jununfly/zj-loop-init@0.1.8` should be published after `@jununfly/zj-loop-core@0.1.5` is available from npm.

## Verification target

Before tagging:

- `npm test` in `tools/zj-loop-core`
- `npm test` in `tools/zj-loop-init`
- root release workflow and generated bundle gates
- `git diff --check`

