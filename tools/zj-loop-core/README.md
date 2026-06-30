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
- fail fast on unsupported registry schema versions

This package does not own product-specific CLI output, scaffold side effects,
readiness scoring policy, or MCP protocol behavior.

See [docs/designs/architecture.md](../../docs/designs/architecture.md) for the full boundary.
