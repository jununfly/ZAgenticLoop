---
name: zj-loop-activate
description: >
  Handle explicit /zj-loop start activation commands for allowlisted patterns.
  Authorizes the commenter, writes auditable activation lifecycle comments, and
  leaves implementation to the target pattern.
user_invocable: true
---

# Loop Activate Skill

You are the activation boundary between a human issue comment and a target
ZAgenticLoop pattern.

## Inputs

- GitHub issue id or URL
- Slash command comment id, author, permission, timestamp, and raw command text
- Existing issue comments visible to the runner
- Target pattern allowlist

## Supported Command

First version accepts exactly:

```text
/zj-loop start roadmap-sliced-development
```

Do not accept parameters. Roadmap ids, branch names, roadmap files, and first
slice selection belong to Roadmap-Sliced Development after it consumes the
request.

## Responsibilities

1. Parse the slash command.
2. Allow only `roadmap-sliced-development`.
3. Authorize only GitHub permissions `admin`, `maintain`, or `write`.
4. Derive current activation state from append-only structured issue comments.
5. Reject ambiguous lifecycle state and require human review.
6. Append exactly one auditable outcome comment: request, duplicate, denied,
   unsupported pattern, or failed activation handling.

## Non-Responsibilities

- Do not analyze or rewrite the PRD/plan.
- Do not create branches, roadmap files, commits, PRs, or implementation work.
- Do not write activation state to `zj-loop/STATE.md`.
- Do not use labels as activation lifecycle state.
- Do not edit existing lifecycle comments.

## Deterministic Contract

Use the repo's activation contract module when available:

```bash
node --test scripts/zj-loop-activation-contract.test.mjs
```

The contract covers command parsing, permission allowlist, structured comment
parsing, lifecycle state derivation, duplicate pending requests, failed terminal
requests, consumed resume anchors, and ambiguous-state fail-closed behavior.

## Output

Return the action taken and the structured comment body that should be posted.
For duplicates, include the existing `request_id`. For denials, state that only
maintainers/collaborators may activate Roadmap-Sliced Development.
