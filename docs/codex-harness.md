# Codex Harness

Codex Harness is the product-experience layer that lets Codex run
ZAgenticLoop paths with less manual handoff. It does not replace Route Table,
Activation Request, consumer runners, verification gates, or closeout
contracts. It wraps them with structured input, structured output, evidence,
resume anchors, and clear stop signals.

## User Story: Issue To PR

You have a GitHub issue that contains a PRD, plan, bug report, or improvement
request. Instead of manually copying context through several steps, the harness
path should make the loop explicit:

```text
GitHub Issue -> Roadmap-Sliced Development -> PR -> Post-Merge Closeout
```

1. The issue or command becomes a structured harness input.
2. Route Decision decides whether the route is allowed.
3. Roadmap-Sliced Development creates bounded work, review artifacts, and
   verification evidence.
4. Codex keeps running while authorization, budget, risk, and verification
   gates pass.
5. The loop stops only on a structured stop signal, such as waiting for PR
   merge or requiring a fixed confirmation phrase.
6. After merge, closeout writes evidence before deleting branches or closing
   carrier issues.

The current provider-backed dogfood run is recorded in
[Codex Harness Provider-Backed Dogfood](testing/codex-harness-provider-backed-dogfood.md).

## User Story: No Provider

You may also want Codex + ZAgenticLoop without GitHub or GitLab. In that path,
the same protocol is carried by local files:

```text
Local Protocol Input -> Route Decision -> Local Activation -> Local Review Artifact -> Local Closeout
```

Provider-backed and no-provider paths share the same harness protocol. Only the
carrier surfaces differ:

| Provider-backed | No-provider |
| --- | --- |
| Issue or MR/PR comment | Local activation file |
| PR/MR | Local branch, patch, or changed files |
| Workflow artifact | Local evidence JSON/log |
| Provider closeout comment | Local closeout record |

Replayable examples are in
[Codex Harness No-Provider E2E Protocol](testing/codex-harness-no-provider-e2e.md).

## Protocol Inputs

Ordinary natural language is not protocol input. A sentence such as "continue"
or "start route" may be a conversation request, so it must not trigger loop
side effects by itself.

Accepted input envelope types:

- `slash_command`
- `fenced_protocol_block`
- `deterministic_cli_output`

Validate an input file:

```bash
node tools/zj-loop-core/dist/harness-protocol-cli.js validate-input docs/testing/codex-harness-no-provider-input.json
```

## Protocol Outputs

Harness outputs are JSON first. Markdown is only a rendering for humans.

Required output fields:

- `status`
- `summary`
- `next_actions`
- `evidence`
- `artifacts`
- `stop_signal` when stopped, failed, or waiting for confirmation
- `confirmation` when a fixed phrase is required
- `resume` when the run can resume

Validate and render an output file:

```bash
node tools/zj-loop-core/dist/harness-protocol-cli.js validate-output docs/testing/codex-harness-no-provider-output.json --expect-status completed
node tools/zj-loop-core/dist/harness-protocol-cli.js render-output docs/testing/codex-harness-no-provider-output.json
```

## Metrics

Dogfood claims should come from deterministic metrics, not memory. The metrics
recorder summarizes structured harness outputs:

- human handoff count;
- location switch count;
- ambiguous natural-language next steps;
- structured stop signals;
- review artifact completion;
- post-merge closeout evidence count;
- surfaces touched during the run.

Generate metrics from the current provider-backed dogfood run:

```bash
node tools/zj-loop-core/dist/harness-protocol-cli.js record-metrics docs/testing/codex-harness-provider-backed-dogfood-run.json
```

## When The Harness Stops

The harness should keep going while the current authorization, budget, risk,
and verification envelope permits it. It should stop when continuing would
cross a real boundary:

- PR/MR review or merge is required;
- a fixed confirmation phrase is required;
- verification failed;
- budget or safety gates failed;
- the next action would require a new request lifecycle.

The stop must be structured enough for a later agent or human to resume without
guessing.
