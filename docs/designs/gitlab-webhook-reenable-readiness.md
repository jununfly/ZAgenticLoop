# GitLab Webhook Re-enable Readiness

Status: preparation only. The `gitlab-issue-note-bridge` route remains
disabled and unavailable until the gates in this document are satisfied.

## Scope

This is the re-enable contract for the next package release after `0.1.11`,
proposed as `0.1.12`. The owners are:

- Product and runtime approval: `mlive-dev/ai-studio` maintainers
- Provider adapter and protocol: ZAgenticLoop maintainers
- Bridge deployment and HTTPS ownership: `mlive-dev/ai-studio-gitlab` test-environment owner

The reference installation is fixed to:

| Field | Value |
| --- | --- |
| Bridge deployment | Internal HTTPS deployment of the `mlive-dev/ai-studio-gitlab` test fork |
| Live fixture project | `mlive-dev/ai-studio-gitlab` |
| Production project | `mlive-dev/ai-studio` (protected; no fixture or Webhook) |
| Route | `gitlab-issue-note-bridge` |
| Target ref | `master` in the test fork |
| Webhook path | `/gitlab/webhook/issue-note` |
| Health path | `/healthz` |
| Webhook event | `Issue Hook` only |

`mlive-dev/ai-studio` is the real product project with active users. It must
not be used to create a fixture Issue or Note, configure a Webhook, or trigger
an API pipeline during development validation. The deployment host is
intentionally a required test-environment input. It must be assigned before
promotion; no placeholder host may be configured in a GitLab Project Webhook.

The selected hosting model is the existing internal Ingress with a fixed
private DNS name and TLS certificate. No public endpoint or new public
service is part of this readiness scope. The Ingress may expose only
`/gitlab/webhook/issue-note` and `/healthz` for the test fork.

The hostname follows the test-cluster convention:
`zj-loop-gitlab-bridge.<internal-test-domain>`. The infrastructure owner must
replace `<internal-test-domain>` with the existing private suffix in deployment
evidence; this repository does not invent or commit an unverified hostname.
The same owner supplies the TLS Secret reference and sanitized Ingress
provenance. ZAgenticLoop does not create infrastructure or choose a cluster
suffix.

## Credential Boundary

Two independent runtime secrets are required:

| Secret | Used by | Permission | Must never be used for |
| --- | --- | --- | --- |
| `ZJ_LOOP_GITLAB_WEBHOOK_SECRET` | bridge request validation | compare `X-Gitlab-Token` | triggering pipelines or consumer writes |
| `ZJ_LOOP_GITLAB_BRIDGE_TRIGGER_TOKEN` | bridge pipeline trigger | create the fixed API pipeline only | Issue/Note/MR/branch writes |

The consumer's `GITLAB_TOKEN` remains separate and is not injected into the
bridge. Secret values are configured by a Human maintainer through the
deployment/project secret store. They are never committed, printed, or placed
in evidence artifacts.

## Fixed Runtime Contract

The bridge must reject requests before any GitLab API call when any of these
checks fail:

1. HTTPS host and `/healthz` are reachable and return the bridge health schema.
2. `X-Gitlab-Event` is exactly `Issue Hook`.
3. `X-Gitlab-Event-UUID` is present and becomes the receipt identity.
4. The payload project is exactly `mlive-dev/ai-studio-gitlab` for the live
   fixture; a production payload from `mlive-dev/ai-studio` is rejected by the
   test bridge.
5. The note is the route marker configured for `gitlab-issue-note-bridge`.
6. The route maps only to the test fork's `master`; webhook input cannot
   choose project, ref, route, or job.
7. The bridge uses only `ZJ_LOOP_GITLAB_BRIDGE_TRIGGER_TOKEN` to create the
   API pipeline and passes the seven allowlisted variables.

The API pipeline is an execution carrier, not proof of a native GitLab event.
Evidence must retain the webhook event ID, Issue IID, Note ID, request/dedupe
identity, fixed route/ref, and created pipeline ID.

## Promotion Gates

The following gates are required in order:

- [ ] Infrastructure owner and version target confirmed.
- [ ] Existing internal Ingress is assigned a fixed private DNS name and TLS
      certificate for the `mlive-dev/ai-studio-gitlab` test fork.
- [ ] The assigned hostname follows
      `zj-loop-gitlab-bridge.<internal-test-domain>` and is recorded in
      sanitized deployment provenance.
- [ ] The test-environment owner records the TLS Secret reference and Ingress
      provenance without exposing certificate material or Secret values.
- [ ] The bridge deployment is reachable through that Ingress without any
      public listener.
- [ ] `/healthz` returns `zj-loop.gitlab_issue_note_bridge_health.v1` without
      provider writes.
- [ ] Two secrets are injected independently at runtime.
- [ ] The test fork's Project Webhook enables only `Issues events` and points
      to the fixed path; Push, Merge request, Pipeline, Job, Tag, and Comment
      events remain disabled. The production project has no Webhook for this
      capability.
- [ ] Local negative/recovery matrix passes: wrong secret, wrong event,
      project mismatch, ordinary note, marker mismatch, duplicate event,
      trigger-failed, trigger-uncertain, and explicit recovery.
- [ ] Human-approved promotion PR changes the route from disabled only after
      the prior evidence is complete.
- [ ] A dedicated live fixture Issue and marker Note are created by a Human
      in the test fork; the positive path creates exactly one fixed API
      pipeline and its bound artifacts. The production project remains
      untouched.

Until every gate is checked, the Route Table must remain
`enabled=false`, `provider_writes_allowed=false`, and the capability status
must remain `unavailable` with `planning_status=deferred`.

## Evidence and Cleanup

Evidence records only sanitized identities and provenance: project, route,
ref, event ID, Issue IID, Note ID, request/dedupe ID, pipeline ID, artifact
names, and auth source. It must not contain either secret or the raw webhook
payload.

The test-fork fixture retains its Issue, Note, pipeline, and artifacts for
audit. After evidence is accepted, the Human disables the test-fork Project
Webhook and rotates or removes the test trigger token. Disabling the webhook
is separate cleanup evidence and does not make the route complete by itself.
No production Issue, Note, pipeline, Webhook, or token is part of this
development validation.
