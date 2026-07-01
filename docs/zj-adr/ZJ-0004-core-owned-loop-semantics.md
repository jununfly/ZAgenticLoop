# Core Owns Loop Semantics; Adapters Preserve Compatibility

Semantic loop behavior belongs in `@jununfly/zj-loop-core`, while MCP and CLI
packages remain adapters that resolve inputs, preserve compatibility, and format
outputs. We choose this over putting recommendation, cost, readiness, or pattern
profile policy directly in MCP handlers or individual CLIs because those
surfaces must agree on the same Agentic Loop Working concepts. Raw MCP
resources stay available as audit evidence, and existing MCP tool names remain
stable while their implementations consume core semantic queries.

The core package also carries a narrow shared single-command CLI harness for the
`zj-loop-*` tools. That harness owns duplicated lifecycle mechanics such as
option parsing, help dispatch, injected IO, fail-fast parse errors, handler
execution, and thrown-error formatting. It does not move product contracts into
core: cost output, sync reports, audit readiness policy, scaffold file writes,
and MCP protocol behavior stay in their adapters.

`zj-loop-audit` may keep its own package-local readiness rule engine and
`readiness.v1.yaml` policy. That rule engine consumes collected evidence and
formats audit guidance, but it does not move readiness policy into core.
