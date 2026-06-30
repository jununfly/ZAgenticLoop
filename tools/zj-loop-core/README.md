# @jununfly/zj-loop-core

Shared Agentic Loop Working domain utilities.

Current responsibilities:

- load and validate `patterns/registry.yaml`
- expose stable registry domain types
- expose project evidence primitives
- provide registry-first semantic queries for pattern summaries, profiles,
  recommendations, cost estimates, and required skills
- fail fast on unsupported registry schema versions

This package does not own CLI parsing, readiness scoring, or MCP protocol behavior.

See [docs/designs/architecture.md](../../docs/designs/architecture.md) for the full boundary.
