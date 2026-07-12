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
