# `@jununfly/zj-loop-gitlab-infra`

Versioned GitLab provider infrastructure for ZJ Loop routes.

The initial contract is read-only and covers `schedule-read`, `pipeline-read`,
`job-read`, and `artifact-read`. Route-specific state machines and artifact
schemas remain in `@jununfly/zj-loop-core`.

This package normalizes GitLab responses, classifies provider failures, and
emits a stable provenance envelope. It does not trigger pipelines or write
Issues, MRs, comments, branches, schedules, or webhooks.
