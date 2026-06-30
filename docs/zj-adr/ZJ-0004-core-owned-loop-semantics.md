# Core Owns Loop Semantics; Adapters Preserve Compatibility

Semantic loop behavior belongs in `@jununfly/zj-loop-core`, while MCP and CLI
packages remain adapters that resolve inputs, preserve compatibility, and format
outputs. We choose this over putting recommendation, cost, readiness, or pattern
profile policy directly in MCP handlers or individual CLIs because those
surfaces must agree on the same Agentic Loop Working concepts. Raw MCP
resources stay available as audit evidence, and existing MCP tool names remain
stable while their implementations consume core semantic queries.
