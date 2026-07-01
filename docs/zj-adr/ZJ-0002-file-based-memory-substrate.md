# File-Based Memory Is the Default Loop Substrate

Loop starters and audits default to repo-local Markdown files for memory: state, run history, budgets, and operating constraints. We choose files over external systems as the default because they are cloneable, reviewable in PRs, easy for humans to inspect, and tool-agnostic; external systems such as GitHub Projects, Linear, databases, or MCP-backed stores can still be connectors, but they should not be required for the starter path.
