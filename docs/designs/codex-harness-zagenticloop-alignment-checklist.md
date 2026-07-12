# Codex Harness + ZAgenticLoop Alignment Checklist

This document records the design alignment needed before implementing the Codex Harness + ZAgenticLoop product path.

The purpose is to reduce ambiguity for future agents and prevent the work from collapsing into isolated route fixes.

## 1. Harness Boundary

Codex Harness is responsible for product experience orchestration:

- conversational entry points;
- automatic continuation;
- stop explanation;
- recovery guidance;
- evidence summarization;
- next-action presentation.

Codex Harness is not responsible for replacing or bypassing:

- Route Table;
- Activation Request;
- Consumer Runner;
- readiness checks;
- evidence protocol;
- stop signal protocol.

Recommended decision: Codex Harness should wrap ZAgenticLoop primitives into a smoother experience, not create a parallel Codex-only protocol.

## 2. Experience Path Priority

The product has two first-class paths:

- provider-backed path: Codex + ZAgenticLoop + GitHub/GitLab;
- Codex-centered path: Codex + ZAgenticLoop without GitHub/GitLab.

Recommended decision: use the provider-backed path as the baseline for the first complete publishable path because it has issue, PR/MR, CI, review, and closeout evidence. Keep the Codex-centered path as a parallel no-provider product path with equivalent local evidence and review artifacts.

Confirmed alignment: the Codex-centered no-provider path must enter the first protocol-closure design pass, even if its implementation comes after the provider-backed baseline. The first design pass should define equivalents for local activation, local review artifact, local evidence, local closeout, and local resume so core protocol language does not become GitHub/GitLab-bound.

## 3. Automation Default Strategy

The product should default toward automatic continuation.

Automatic continuation must be gated by:

- authorization;
- budget;
- risk;
- verification.

When a gate fails, the system should not ask vague questions such as "continue?". It should emit a structured stop signal with:

- reason;
- impact;
- recovery action;
- whether a fixed human confirmation phrase is required;
- where that confirmation should be supplied.

Recommended decision: human confirmation should be the exception for real blockers, not the default mode of operation.

## 4. Global Input/Output Protocol

Codex Harness output must be structured, but output should not be designed in isolation.

The product needs a global Input/Output protocol for the whole loop path before designing any individual output block. Input and output should use aligned concepts so agents do not have to infer relationships from prose.

The protocol must distinguish:

- human natural-language instructions;
- explicit loop protocol inputs;
- agent-generated next actions;
- stop signals;
- confirmation requests;
- resume requests;
- provider-backed carrier updates;
- no-provider local state updates.

Canonical serialization:

- canonical internal format is JSON;
- schema definitions belong in `@jununfly/zj-loop-core`;
- every protocol object must include `schema_version`;
- fenced protocol blocks may be human-friendly, but must be normalized by the validator into canonical JSON before execution;
- Markdown rendering is allowed for human readability, but Markdown is not the source of truth.

Protocol input must not be easy to confuse with ordinary user language. A user saying "continue", "fix this", or "start route" in natural language might be asking for something outside the loop protocol. The harness should only treat an input as protocol input when it is explicit enough to be auditable and replayable.

Confirmed input envelopes:

- slash command: for human-facing short commands such as start, confirm, resume, and closeout;
- fenced protocol block: for complex auditable requests that need structured fields and replayability;
- deterministic CLI output: for scripts, route consumers, and automation handoff.

Ordinary natural language may trigger explanation, recommendation, or generation of a candidate protocol input. It must not directly trigger loop side effects.

Recommended decision: define the full-chain Input/Output protocol first, then design specific output blocks under that protocol. This avoids one-off next-action formats and prevents other agents from treating casual human language as loop commands.

Confirmed output minimum fields:

- `status`: one of `continued`, `stopped`, `completed`, `failed`, or `needs_confirmation`;
- `summary`: short human-readable summary;
- `next_actions`: structured array, not a single prose string;
- `evidence`: links, provider references, or local paths;
- `artifacts`: PR/MR, issue, branch, patch, docs, run summary, or local output;
- `stop_signal`: present when status is `stopped`, `failed`, or `needs_confirmation`;
- `confirmation`: present only when human confirmation is required;
- `resume`: present when the run can be resumed.

Codex may render this output in natural language for the human, but the structured output is the source of truth for agents, deterministic scripts, replay, and recovery.

Confirmed `next_actions` action types:

- `continue_loop`;
- `resume_loop`;
- `request_confirmation`;
- `create_review_artifact`;
- `run_verification`;
- `perform_closeout`;
- `open_provider_link`;
- `write_local_evidence`;
- `stop`.

Each `next_actions[]` item should include an action `type`, a machine-readable `target`, and a short human-readable `label`. Agents must not invent new action types without updating the protocol and deterministic validation.

Confirmed status-machine requirement:

| Status | Meaning | Side effects after output | Resume | Required fields |
| --- | --- | --- | --- | --- |
| `continued` | The loop performed bounded work and may continue under the same authorization/budget/risk envelope. | Allowed only if the next action is explicitly structured and still inside the current envelope. | Usually yes | `next_actions`, `evidence` |
| `stopped` | The loop intentionally stopped on a real stop signal before completing the goal. | Not allowed until the stop signal is resolved. | Yes, when `resume` is present | `stop_signal`, `next_actions`, `resume` when resumable |
| `completed` | The bounded loop goal is complete and reviewable artifacts/evidence exist. | Only closeout or post-completion actions are allowed. | No, except new request or closeout flow | `artifacts`, `evidence` |
| `failed` | The loop encountered an error or unrecoverable condition for the current run. | Not allowed without a new run or explicit recovery action. | Sometimes, only if `resume` is present | `stop_signal`, `evidence`, `next_actions` |
| `needs_confirmation` | The loop reached a human gate requiring a fixed confirmation phrase or explicit protocol input. | Not allowed until confirmation is supplied in the specified location. | Yes, after confirmation | `confirmation`, `stop_signal`, `next_actions` |

Agents must not infer status transitions from prose. Status transitions must be driven by structured output fields.

`needs_confirmation` must only be satisfied by a fixed confirmation envelope. Ordinary natural language such as "confirm", "agree", "continue", or "go ahead" must not trigger confirmation side effects by itself. This keeps protocol input auditable and prevents casual conversation from being interpreted as an execution authorization.

Confirmed confirmation envelope minimum fields:

- `kind`: fixed as `confirmation`;
- `confirmation_id`: stable identifier of the confirmation request;
- `required_phrase`: exact phrase required from the human or authorized actor;
- `scope`: what this confirmation authorizes;
- `side_effects`: structured list of operations that may happen after confirmation;
- `location`: where the confirmation must be supplied, such as Codex conversation, provider comment, workflow input, or local protocol block;
- `valid_until_state` or `expires_at`: when the confirmation is no longer valid;
- `actor_requirement`: who is allowed to confirm, such as maintainer, collaborator, repository owner, local operator, or explicit human.

Confirmation must bind to the original `confirmation_id`. Agents must reject confirmations that match the phrase but do not match the expected location, actor requirement, scope, or validity state.

Deterministic implementation requirement:

- envelope parsing;
- required-field validation;
- status transition validation;
- confirmation envelope validation;
- `next_actions` type validation;
- structured output template rendering;
- replay/evidence index validation.

These pieces should be implemented as deterministic scripts or APIs where practical. Agents should consume the deterministic result instead of guessing from prose at runtime.

First implementation target:

1. Protocol validator for input envelopes, output fields, status transitions, confirmation envelopes, and `next_actions` types.
2. Protocol renderer for structured output blocks and human-readable summaries generated from the same structured data.
3. Integration points for provider-backed and no-provider consumers after the validator/renderer exists.

Package ownership: the protocol validator and renderer belong in `@jununfly/zj-loop-core`. Codex-specific packages should provide harness adapters that consume the core protocol; they should not own or redefine the protocol.

Do not create a new Codex Harness package yet. First expose the protocol validator/renderer through `@jununfly/zj-loop-core`, then consume it from existing CLI surfaces, examples, or lightweight harness adapters. Revisit a dedicated package only after the runtime boundary and dogfood path are stable.

Route consumers should be connected after this deterministic substrate is available, so consumer integration does not redefine protocol behavior route by route.

## 5. Review Artifact Standard

Every completed loop must produce something reviewable.

Provider-backed path review artifacts:

- issue comment;
- PR/MR;
- CI evidence;
- closeout comment.

Codex-centered path review artifacts:

- branch or patch;
- changed docs/code;
- local run summary;
- local evidence;
- Codex-readable summary.

Recommended decision: no-provider execution must not end at "Codex says it is done"; it needs an artifact and evidence trail that can be inspected or replayed.

## 6. Evidence And Run Summary Format

The shared evidence shape should make runs replayable and debuggable.

Recommended fields:

- `goal`;
- `signal`;
- `route_decision`;
- `consumer`;
- `actions_taken`;
- `verification`;
- `artifacts`;
- `stop_signal`;
- `next_actions`;
- `cost_or_budget`.

Recommended decision: ZAgenticLoop owns the evidence protocol; Codex Harness may render a human-friendly summary from that evidence.

## 7. Roadmap Phase Order

The roadmap should not jump directly into route-specific implementation.

Recommended phases:

1. Readiness, authorization, evidence, and stop-signal substrate.
2. Codex Harness first complete experience path.
3. Route consumer promotion to execution-ready, including GitHub/GitLab/no-provider parity where relevant.

Recommended decision: phase order matters because route-specific execution-ready promotion will drift if readiness and evidence are not stabilized first.

## 8. Dogfood Verification Standard

The product should prove the experience with dogfood before release claims.

Required dogfood categories:

- GitHub issue to PR closeout;
- GitLab issue to MR or evidence;
- Codex-centered local no-provider loop.

Each category should include:

- happy path evidence;
- stop path evidence;
- resume path evidence.

Recommended decision: dogfood evidence should be treated as promotion material for capability maturity, not just an implementation anecdote.

First dogfood path: use the provider-backed GitHub issue -> Roadmap-Sliced -> PR -> closeout path. This path has the strongest existing evidence chain and is the best first test of whether Codex Harness reduces issue/PR/confirmation/closeout switching friction. The Codex-centered no-provider path should complete protocol-closure design in the same phase, then become the second dogfood path.

First dogfood success metrics must be explicit:

- human handoff count;
- location-switch count across Codex, issue, PR/MR, workflow, and closeout surfaces;
- unnecessary confirmation count;
- number of structured stop signals;
- number of ambiguous natural-language-only next steps;
- signal-to-review-artifact completion evidence;
- post-merge closeout evidence.

The dogfood result should compare before/after or baseline/harness-assisted runs where possible. The product claim is not "it felt smoother"; the claim must be supported by replayable evidence that the harness reduced avoidable human coordination work.

Dogfood metrics should be collected by a deterministic run metrics recorder, not by an after-the-fact agent summary.

The first recorder should be lightweight and derive metrics from:

- structured output status;
- `next_actions`;
- confirmation envelopes;
- artifact links;
- stop signals;
- provider links;
- local evidence paths;
- closeout evidence.

The recorder should emit replayable metrics for baseline and harness-assisted runs so product improvement can be compared without relying on memory or subjective narration.

Package ownership: the run metrics recorder also belongs in `@jununfly/zj-loop-core`. It consumes protocol output and evidence, not Codex-specific behavior, so GitHub/GitLab provider-backed paths, no-provider paths, Codex Harness, dogfood, and replay should share the same recorder.

## Current Alignment Decision

The first complete Codex Harness product path should use the provider-backed GitHub/GitLab path as the baseline while preserving the Codex-centered no-provider path as a parallel product path.

This gives the project a complete external evidence chain without binding the long-term product identity to GitHub or GitLab.

The no-provider path is therefore not a distant add-on. It is a protocol-design peer whose implementation can follow the provider-backed baseline.
