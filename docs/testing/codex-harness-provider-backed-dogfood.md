# Codex Harness Provider-Backed Dogfood

This dogfood case verifies the first publishable Codex Harness path:

```text
GitHub Issue -> Roadmap-Sliced Development -> PR -> Post-Merge Closeout
```

The goal is to prove that Codex Harness can wrap the existing ZAgenticLoop
provider-backed primitives without inventing a parallel protocol. The harness
output is structured JSON first; Markdown summaries are only renderings.

## Current Dogfood Run

Run id:

```text
codex-harness-provider-backed-dogfood-2026-07-12
```

Carrier issue:
[jununfly/ZAgenticLoop#109](https://github.com/jununfly/ZAgenticLoop/issues/109).

Pre-merge evidence comment:
[issuecomment-4951081405](https://github.com/jununfly/ZAgenticLoop/issues/109#issuecomment-4951081405).

Review artifact:
[jununfly/ZAgenticLoop#110](https://github.com/jununfly/ZAgenticLoop/pull/110).

Closeout evidence:
[issuecomment-4951105306](https://github.com/jununfly/ZAgenticLoop/issues/109#issuecomment-4951105306).

Carrier close comment:
[issuecomment-4951105657](https://github.com/jununfly/ZAgenticLoop/issues/109#issuecomment-4951105657).

Roadmap branch:

```text
zjal-value-oriented-product-upgrade-map
```

Structured harness run input:

```bash
node tools/zj-loop-core/dist/harness-protocol-cli.js record-metrics docs/testing/codex-harness-provider-backed-dogfood-run.json
```

The run completed after PR #110 merged. Post-merge closeout wrote evidence to
carrier issue #109 before closing it, and deleted the merged roadmap branch.

## Expected Evidence

Before PR merge:

- GitHub carrier issue exists.
- Roadmap branch exists.
- Structured harness output validates.
- Metrics can be regenerated deterministically from
  `docs/testing/codex-harness-provider-backed-dogfood-run.json`.
- Stop signal explicitly says closeout is pending PR merge.

After PR merge:

- PR link is added as review artifact evidence.
- Post-merge closeout writes evidence back to the carrier issue.
- Carrier issue is closed only after closeout evidence is written.
- Metrics are regenerated with `post_merge_closeout_evidence_count > 0`.

Observed metrics after closeout:

```text
human_handoff_count: 0
structured_stop_signal_count: 0
post_merge_closeout_evidence_count: 1
```

## Product Observation

This run exposes the first real Codex Harness value boundary: the harness should
not ask vague "continue?" questions while the work can safely proceed, but it
must stop on a structured signal when the next step depends on review/merge
state outside the current execution envelope.
