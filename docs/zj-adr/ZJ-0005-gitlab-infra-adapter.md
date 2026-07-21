# GitLab Infra Adapter Is a Versioned Read-Only Provider Substrate

We introduce `@jununfly/zj-loop-gitlab-infra` as a separately versioned
provider package inside the ZAgenticLoop monorepo. The package owns GitLab
resource adapters, capability detection, version compatibility, normalized
responses, error classification, JSON CLI contracts, versioned GitLab CI
templates, provenance, and drift checks.

The package depends on provider-neutral contracts from `@jununfly/zj-loop-core`.
Routes do not inspect GitLab versions or consume raw GitLab responses. Existing
route CLIs, job names, variables, artifact names, and route schemas remain
stable while their provider access is migrated behind compatibility facades.

## Initial Scope

The first tracer bullet is Schedule Health. Its initial capability set is
read-only:

- `schedule-read`
- `pipeline-read`
- `job-read`
- `artifact-read`

The first implementation preserves `inspectGitLabScheduleHealth` and
`zj-loop-doctor --schedule-health` as compatibility entry points. It does not
add pipeline triggers, Issue/MR writes, comments, branch changes, schedule
changes, or webhook behavior.

## Compatibility Model

The infra package publishes a versioned contract and capability manifest. A
project pins the infra package version and records the verified GitLab instance,
contract, adapter commit, and capability set. Compatibility evidence is
content-addressed by those identities. A GitLab version, infra version, adapter
commit, or required capability change invalidates the evidence and requires a
new verification.

The central infra ledger records reusable GitLab compatibility evidence. Each
project records its project-level binding evidence separately, including runner,
permission, schedule, artifact, and variable readiness. Instance capability
and project binding must both pass preflight before a route runs.

## Verification Model

Infra contract tests use a local fake GitLab HTTP server and fixed response
fixtures. They cover URL/auth construction, pagination, response normalization,
version capability behavior, error taxonomy, and artifact identity. A
representative real GitLab dogfood validates each supported GitLab version or
capability set. Route tests use a fake infra contract and validate only route
state, artifacts, and side-effect boundaries.

Infra evidence and route evidence remain separate. Infra artifacts prove the
provider operation and compatibility identity; existing route artifacts prove
the route-specific business contract. A route cannot promote infra evidence to
live support unless its own contract is also satisfied.

## Safety and Migration

Infra capabilities are classified as `read`, `execute`, `write`, or `cleanup`.
The initial package exposes only `read` capabilities. Missing or unverified
capabilities fail closed and produce structured diagnostics without provider
side effects.

Migration uses a compatibility facade. Existing routes keep their external
contracts while GitLab access moves behind the infra resource interfaces.
After Schedule Health is proven, routes migrate in shared capability batches;
provider write routes are last.

GitLab CI templates are versioned package assets. Projects store rendered files
with package, contract, template, and template hash provenance. Drift checks
require an explicit regeneration and review when the pinned infra version
changes.
