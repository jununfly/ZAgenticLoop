# `@jununfly/zj-loop-github-infra`

Versioned, read-only GitHub provider infrastructure for ZJ Loop routes.

The package reads workflow runs, jobs/checks, artifacts, commits and refs. It
normalizes provider responses, validates exact run/job/artifact identity, and
emits provenance without creating or modifying GitHub resources.
