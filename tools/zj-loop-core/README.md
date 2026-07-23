# @jununfly/zj-loop-core

Shared Agentic Loop Working domain utilities.

Current responsibilities:

- load and validate `patterns/registry.yaml`
- expose stable registry domain types
- expose project evidence primitives
- provide registry-first semantic queries for pattern summaries, profiles,
  recommendations, cost estimates, and required skills
- provide the narrow shared single-command CLI harness used by `zj-loop-*`
  product CLIs
- provide `zj-loop-dispatch` for structured Signal Envelope orchestration into
  route decisions, carrier plans, consumer run plans, and replayable
  orchestration envelopes
- fail fast on unsupported registry schema versions

This package does not own product-specific CLI output, scaffold side effects,
readiness scoring policy, or MCP protocol behavior.

## Dispatch

`zj-loop-dispatch` accepts only structured `zj-loop.signal.v1` JSON input:

```bash
zj-loop-dispatch --signal signal.json --mode auto
```

It writes the canonical replay artifact under
`zj-loop/orchestrations/<orchestration_id>.json`. Natural language goals belong
to `zj-loop-run`; automation and workflow signals belong to `zj-loop-dispatch`.

See [docs/designs/architecture.md](../../docs/designs/architecture.md) for the full boundary.

## GitLab Issue-Note Bridge Configuration

The bridge accepts its non-secret route settings in one optional
`ZJ_LOOP_BRIDGE_CONFIG_JSON` environment variable. Existing individual
`ZJ_LOOP_BRIDGE_*` variables remain supported as a fallback.

```json
{
  "ZJ_LOOP_BRIDGE_PROJECT_PATH": "group/project",
  "ZJ_LOOP_BRIDGE_ROUTE_ID": "bridge-ci-sweeper",
  "ZJ_LOOP_BRIDGE_PIPELINE_REF": "master",
  "ZJ_LOOP_BRIDGE_TARGET_ROUTE": "ci-sweeper",
  "ZJ_LOOP_BRIDGE_MARKER": "/zj-loop start ci-sweeper",
  "ZJ_LOOP_BRIDGE_ALLOWED_EVENT_TYPE": "Note Hook",
  "ZJ_LOOP_BRIDGE_ENABLED": "true",
  "ZJ_LOOP_BRIDGE_MATURITY": "install-ready"
}
```

Keep `ZJ_LOOP_GITLAB_WEBHOOK_SECRET` and
`ZJ_LOOP_GITLAB_BRIDGE_TRIGGER_TOKEN` as separate secret environment
variables. The bridge does not read secrets from the JSON profile.
