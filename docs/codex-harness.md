# Codex Harness

Codex Harness is the product-experience layer that lets Codex run
ZAgenticLoop paths with less manual handoff. It does not replace Route Table,
Activation Request, consumer runners, verification gates, or closeout
contracts. It wraps them with structured input, structured output, evidence,
resume anchors, and clear stop signals.

## Goal-Oriented Entry

`zj-loop-run` is the goal-oriented entry point for Codex + ZAgenticLoop. It
accepts a user goal, resolves the route through deterministic rules, builds the
consumer run plan, writes thin replay state under `zj-loop/runs/<run_id>.json`,
and keeps going until the current route reaches its first review artifact or a
hard stop signal.

```bash
npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-run "Implement this PRD with roadmap sliced development"
npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-run --route issue-backlog-triage "Scan open issues"
npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-run --plan-only "Prepare a roadmap implementation plan"
```

The default output is structured JSON. Automation should consume
`machine_envelope`; `human_summary` is only for display. Use `--format text`
for a short human-readable rendering.

`zj-loop-doctor` replays recent run state and summarizes improvement signals
without triggering new side effects by default:

```bash
npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-doctor
npx --yes --package @jununfly/zj-loop-core@0.1.7 zj-loop-doctor --emit-signal
```

`--emit-signal` prints a Route Decision signal envelope for another route to
consume. It does not write tracker state or start a fix loop by itself.

## User Story: PRD To Roadmap PR

You have a PRD or implementation plan and want Codex to start the loop without
manually walking every protocol step:

```bash
zj-loop-run "Implement this PRD with roadmap sliced development"
```

The harness resolves the goal to `roadmap-sliced-development`, checks the Route
Table and consumer run contract, writes `zj-loop/runs/<run_id>.json`, and
returns a structured next action. If the route is execution-ready, the loop
continues toward a roadmap branch/PR handoff. If authority, verifier, or runner
capability is missing, the output is `stopped` with a replayable stop signal.

## User Story: Issue Backlog To Transition Evidence

You want to scan open issues, classify them, and advance only the items that
are allowed by the triage transition contract:

```bash
zj-loop-run --route issue-backlog-triage "Scan current open issues"
```

The harness must not mutate tracker state just because a goal says "triage".
It follows the Route Table and issue-triage transition boundary. Recommendation
evidence can be produced automatically; side effects such as labels or comments
require the route's authority and verifier requirements.

## User Story: Why Did The Loop Stop?

You want to understand repeated stops, protocol repairs, or confirmation
friction across recent loop runs:

```bash
zj-loop-doctor
```

The doctor reads `zj-loop/runs/*.json`, summarizes route ambiguity,
protocol-repair requests, and hard stops, then returns a structured
`diagnostic_report`. It stores no large logs and does not scan unrelated
project files.

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

For a `provider: none` dispatch, the Workspace Adapter writes the activation
carrier beneath `zj-loop/requests/` and its Route Decision evidence beneath
`zj-loop/evidence/route-decisions/`. These are the replayable local handoff;
they are not a substitute for the branch, patch, or changed-file review
artifact produced by the Workspace executor.

When the same local orchestration is executed, the executor snapshots the
current Git branch and `HEAD`, then writes a binary patch and changed-file
manifest under `zj-loop/reviews/`. It never creates a branch, commits, or
edits product files. A clean workspace is a structured `workspace-no-changes`
hard stop, because there is no reviewable implementation artifact.

After review, `zj-loop-workspace-closeout` keeps the carrier resumable until
it receives `ACCEPT_LOCAL_REVIEW_ARTIFACT`. It then moves only the local
activation request to `zj-loop/archive/requests/` and records closeout evidence
under `zj-loop/closeouts/`. Repeating a completed closeout is idempotent.

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

Normalize a candidate input and auto-fill low-risk defaults:

```bash
node tools/zj-loop-core/dist/harness-protocol-cli.js normalize-input docs/testing/codex-harness-no-provider-input.json --default-run-id local-run-1
```

## Protocol Outputs

Harness outputs are JSON first. Markdown is only a rendering for humans.

Required output fields:

- `human_summary`: short text for humans only;
- `machine_envelope`: the only object agents, scripts, and CI may consume.

Required `machine_envelope` fields:

- `status`: one of `completed`, `in_progress`, `stopped`, `failed`, `skipped`, or `needs_protocol_repair`;
- `run_id`;
- `route_id`;
- `consumer`;
- `completed_steps`;
- `next_action`;
- `evidence`;
- `artifacts`;
- `stop_signal` and `resume` when `status` is `stopped`;
- `failure` and `retry_policy` when `status` is `failed`;
- `protocol_repair_request` when `status` is `needs_protocol_repair`.

Automation must consume `machine_envelope`, not `human_summary`.

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

## Resume And Run State

Every `stopped` output must include `machine_envelope.stop_signal` and
`machine_envelope.resume`. Provider-backed adapters should store the resulting
run-state record near the provider carrier or workflow artifact. No-provider
adapters should store it under:

```text
zj-loop/runs/<run_id>.json
```

The shared core API exposes deterministic helpers for this contract:

- `buildHarnessRunStateRecord(...)`;
- `getHarnessRunStatePath(run_id)`;
- `findHarnessResumeEnvelope(...)`.

Legacy harness adapters may still read older `zj-loop/harness/runs/` records,
but new goal-oriented runs should use `zj-loop/runs/`.

Natural language such as "continue" may ask Codex to look up an active resume
envelope, but it is not itself the resume protocol action.

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
