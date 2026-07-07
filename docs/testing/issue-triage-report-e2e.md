# Issue Triage Report E2E Test Cases

These test cases verify the report-only Issue Triage route:

```text
Issue Backlog Signal -> Route Decision -> Issue Triage Report Evidence
```

This route is an observation lane. It is not an issue comment bot, not a label
worker, not a lifecycle-state engine, and not an Issue Fix Request creator.

## Scope

The local replay proves that selected issue and discussion backlog signals can
be routed through the dogfood route table and produce Issue Triage report
evidence.

The current implementation is intentionally report-only:

- no public issue comment
- no label mutation
- no assignment
- no milestone change
- no close or reopen
- no formal issue lifecycle transition
- no batch mutation
- no consumer work start

The evidence store is fixed as `zj-loop/issue-triage-state.md`.

## Local Replay Gate

Run:

```bash
node scripts/issue-triage-report-e2e-replay.mjs
node --test scripts/issue-triage-report-e2e-replay.test.mjs
npm run test:issue-triage-report
```

Expected results:

- Replay suite returns `passed: true` with the real
  `zj-loop/zj-loop-route-table.yaml`.
- The Route Decision has `request_kind: report-only` and
  `target_consumer: issue-triage`.
- The only allowed `signal_kind` values are:
  - `missing-info-observation`
  - `possible-duplicate-observation`
  - `label-suggestion-observation`
  - `human-attention-candidate`
  - `issue-backlog-summary`
- The only route decision statuses are:
  - `recorded`
  - `already-recorded`
  - `rejected`
  - `routed-to-human-review`
- Unsupported signal kinds return `rejected` with
  `reason: unsupported_signal_kind`.
- Repeated report evidence returns `already-recorded`.
- `already-recorded` means report evidence dedupe, not an issue duplicate
  action.
- `human-attention-candidate` remains report-only unless high/unknown risk or a
  hard human-review guard is present.
- Backlog summaries are summary evidence only and never batch mutation requests.

## Failure Diagnosis Matrix

| Failing layer | Expected evidence |
| --- | --- |
| Signal kind | `rejected` with `unsupported_signal_kind`; no issue triage report is created. |
| Forbidden protocol field | `rejected` with `forbidden_protocol_field:<field>`; no public side effect is inferred. |
| Report dedupe | `already-recorded` with `existing_report_id`; no issue duplicate action is inferred. |
| Human review guard | `routed-to-human-review` only for hard risk or mutation/lifecycle/comment requirements. |
| Evidence path | `evidence-path-not-fixed` if the route table stops pointing to `zj-loop/issue-triage-state.md`. |

## Closeout Decision Audit

| Decision | Classification | Durable home |
| --- | --- | --- |
| Canonical chain wording is `Issue Backlog Signal -> Route Decision -> Issue Triage Report Evidence`. | durable doc | This test case, `patterns/issue-triage.md`, and `zj-loop/ZJ-LOOP.md`. |
| `issue-triage-report` is report-only and writes no public comments, labels, assignments, milestones, close/reopen, lifecycle transitions, requests, or batch mutations. | durable doc | This test case and route table. |
| Report evidence belongs in `zj-loop/issue-triage-state.md`. | durable doc | This test case and route table. |
| Protocol names use observation/candidate language instead of action/lifecycle language. | durable doc | This test case, Triage Architecture, and Route Table Architecture. |
