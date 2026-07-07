# Issue Triage Report Route Roadmap

Process roadmap for the `issue-triage-report` Route Decision slice.

Activation:

- Carrier issue: https://github.com/jununfly/ZAgenticLoop/issues/31
- Request comment: https://github.com/jununfly/ZAgenticLoop/issues/31#issuecomment-4900598781
- Branch: `zjal-issue-triage-report-route`

Branch naming decision: `zjal/<roadmap-id>` could not be created in this working
tree without mutating hidden Git refs, so this branch uses
`zjal-issue-triage-report-route` and records the exception.

## Tree

- [~][Y+] 1. Issue triage report route implementation
  - [x][Y+] 1-1. Deterministic issue triage report replay contract
  - [x][Y+] 1-2. Route table and durable documentation alignment
  - [~][Y+] 1-3. Roadmap closeout and PR handoff evidence

## Current Focus

### 1-3. Roadmap closeout and PR handoff evidence

Commit intent: Consolidate process decisions into durable docs and delete process roadmap files.

Verification gate: `git diff --check && bash scripts/ci-validate-gates.sh`

Completed evidence for 1-1:

- `scripts/issue-triage-report-e2e-replay.mjs`
- `scripts/issue-triage-report-e2e-replay.test.mjs`
- `node --test scripts/issue-triage-report-e2e-replay.test.mjs`

Required outcomes:

- `recorded`
- `already-recorded`
- `rejected` with `unsupported_signal_kind`
- `routed-to-human-review`
- fixed evidence path: `zj-loop/issue-triage-state.md`
- no public comments, label mutation, assignment, milestone, close/reopen, or
  formal issue lifecycle transition

Completed evidence for 1-2:

- `npm run test:issue-triage-report`
- `npm run test:route-decision`
- `npm run validate:registry`
- stale issue-triage-report protocol terminology scan returned no matches

Verification evidence before feature commit:

- `git diff --check`
- `npm run test:issue-triage-report`
- `npm run test:route-decision`
- `npm run test:zj-loop-init`
- `npm run validate:registry`
- `npm run check:zj-loop-init`
- `bash scripts/ci-validate-gates.sh`

Note: the first `ci-validate-gates.sh` attempt failed on sandbox DNS for
`registry.npmmirror.com`; rerunning with network permission passed.
