# Dependency Sweeper Claim Roadmap

Process roadmap for implementing the Dependency Sweeper claim contract.

Activation:

- Carrier issue: https://github.com/jununfly/ZAgenticLoop/issues/33
- Request comment: https://github.com/jununfly/ZAgenticLoop/issues/33#issuecomment-4900834781
- Branch: `zjal/dependency-sweeper-claim`

## Tree

- [~][Y+] 1. Dependency Sweeper claim contract
  - [x][Y+] 1-1. Deterministic claim replay and tests
  - [x][Y+] 1-2. Route docs, package scripts, CI gates, and dogfood status
  - [~][Y+] 1-3. Closeout and PR handoff evidence

## Current Focus

### 1-3. Closeout and PR handoff evidence

Commit intent: Delete process roadmap files after durable docs absorb decisions.

Verification gate: `git diff --check && bash scripts/ci-validate-gates.sh`

Scope:

- consume only an existing `requested` Issue Fix Request
- append deterministic `consumed` lifecycle evidence
- require `consumer_id: dependency-sweeper`
- require dependency capability and verifier gate
- deny mismatched consumer, high-risk/major requests, missing verifier gate, and non-requested status
- do not edit package manifests or lockfiles
- do not create branches, PRs, comments on source signals, workflow dispatches, or repair work

Completed evidence:

- `npm run test:dependency-sweeper-claim`
- `npm run test:dependency-sweeper-route`
- `npm run test:route-decision`
- `npm run test:issue-fix-request`
- `npm run validate:registry`
- `npm run check:zj-loop-init`
- `git diff --check`
- `bash scripts/ci-validate-gates.sh`

Note: the first `ci-validate-gates.sh` attempt failed on sandbox DNS for
`registry.npmmirror.com`; rerunning with network permission passed.
