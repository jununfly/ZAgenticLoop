# Release Notes: ZAgenticLoop 0.1.6 / 0.1.9

Planned package versions:

- `@jununfly/zj-loop-core@0.1.8`
- `@jununfly/zj-loop-audit@0.1.6`
- `@jununfly/zj-loop-init@0.1.9`

This release focuses on making the GitHub and GitLab provider bundles ready for
real user-project adoption while keeping route execution semantics aligned
across both platforms.

## Highlights

- Hardened provider-aware route execution and generated workflow readiness.
- Improved GitLab bundle scaffolding, package-source handling, and route table
  alignment with the GitHub baseline.
- Kept generated GitHub Actions and GitLab CI examples pinned to the current
  core/audit versions.
- Updated README and quickstart references so users see the current install and
  route-management commands.

## Publish Order

1. Publish `@jununfly/zj-loop-core@0.1.8`.
2. Publish `@jununfly/zj-loop-audit@0.1.6`.
3. Publish `@jununfly/zj-loop-init@0.1.9`.

Publishing still requires explicit human approval.
