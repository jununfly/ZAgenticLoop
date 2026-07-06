# Dependency Sweeper Route Roadmap

Activation carrier: [jununfly/ZAgenticLoop#23](https://github.com/jununfly/ZAgenticLoop/issues/23)

Branch: `zjal/dependency-sweeper-route`

Runtime chain:

```text
Dependency Alert -> Route Decision -> Issue Fix Request -> Dependency Sweeper
```

## Decisions

| ID | Status | Decision |
| --- | --- | --- |
| d1 | accepted | Runtime chain is Dependency Alert -> Route Decision -> Issue Fix Request -> Dependency Sweeper. |
| d2 | accepted | This implementation work is activated through a GitHub issue comment Activation Request. |
| d3 | accepted | First slice stops at Issue Fix Request requested, duplicate, or denied; it does not simulate Dependency Sweeper claim or Fix PR. |
| d4 | accepted | Only patch/minor dependency alerts with low/medium risk may create requests. Major, high, critical, and non-main signals are denied. |

## Nodes

### 1. Dependency Sweeper Route Entry

Status: `in_progress`

Completion condition: all child leaves are completed/deferred/linked follow-up and durable decisions are absorbed into tests or docs.

#### 1-1. Add Deterministic Route Replay And Route Table Entry

Status: `completed`

Commit intent: `Add dependency sweeper route replay`

Verification gate:

- `node --test scripts/dependency-sweeper-route-e2e-replay.test.mjs`
- `npm run test:route-decision`
- `git diff --check`

Notes:

- No package.json or lockfile edits.
- No real Dependency Sweeper consumer claim, package upgrade, branch, PR, or GitHub issue mutation in replay.
- Implemented a dependency-sweeper route that only allows patch/minor low/medium dependency alerts and denies risky/non-main signals before request creation.

Verification evidence:

- `node --test scripts/dependency-sweeper-route-e2e-replay.test.mjs` passed.
- `npm run test:route-decision` passed.
- `npm run test:issue-fix-request` passed.
- `npm run validate:registry` passed.
- `npm run check:zj-loop-init` passed.
- `git diff --check` passed.
- `bash scripts/ci-validate-gates.sh` passed after network-enabled rerun; the first sandbox run failed on npm registry DNS.

#### 1-2. Closeout Docs And Activation Evidence

Status: `pending`

Commit intent: `Document dependency sweeper route closeout`

Verification gate:

- `npm run validate:registry`
- `npm run check:zj-loop-init`
- `bash scripts/ci-validate-gates.sh`

Notes:

- Merge process decisions into durable testing/ZJ-LOOP docs before closeout.
- Process roadmap should be deleted or absorbed before merging to main.
