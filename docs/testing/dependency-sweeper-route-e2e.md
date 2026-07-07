# Dependency Sweeper Route E2E Test Cases

These test cases verify the Dependency Sweeper request route:

```text
Dependency Alert -> Route Decision -> Issue Fix Request -> Dependency Sweeper
```

This route is a request creation lane. It does not run Dependency Sweeper,
change dependency manifests, update lockfiles, open a Fix PR, or auto-merge.

## Scope

The local replay proves that allowlisted dependency alerts can be routed through
the dogfood route table into a verifier-backed Issue Fix Request for
Dependency Sweeper.

The current implementation stops at:

- `requested`
- `duplicate`
- `denied`

It intentionally does not simulate package upgrades, verifier execution, Fix PR
creation, or escalation issues. Claim-only lifecycle evidence is covered by the
Dependency Sweeper Claim section below.

## Local Replay Gate

Run:

```bash
node scripts/dependency-sweeper-route-e2e-replay.mjs
node --test scripts/dependency-sweeper-route-e2e-replay.test.mjs
node scripts/dependency-sweeper-claim-e2e-replay.mjs
node --test scripts/dependency-sweeper-claim-e2e-replay.test.mjs
```

Expected results:

- Replay suite returns `passed: true` with the real
  `zj-loop/zj-loop-route-table.yaml`.
- Patch + low-risk dependency alerts create an Issue Fix Request.
- Minor + medium-risk dependency alerts create an Issue Fix Request.
- Existing active requests return `duplicate` and reference the active request.
- Major updates are denied before request creation.
- High-risk and critical dependency alerts are denied before request creation.
- Non-main dependency alerts are denied by route guards.
- Created requests target `dependency-sweeper` with capability
  `patch-dependency-fix` or `minor-dependency-fix`.
- Created requests include verifier commands but do not run them in replay.

## Dependency Sweeper Claim

The claim-only upgrade verifies this chain:

```text
Dependency Alert -> Route Decision -> Issue Fix Request -> Dependency Sweeper Claim Evidence
```

Claim replay consumes only an existing `requested` Issue Fix Request and appends
`consumed` lifecycle evidence. It requires:

- `requested_consumer.consumer_id: dependency-sweeper`
- capability `patch-dependency-fix` or `minor-dependency-fix`
- a non-empty verifier gate
- `route_id: dependency-sweeper`

It denies:

- mismatched consumer
- missing verifier gate
- repeated claim of a non-`requested` request
- major updates before request creation
- high-risk dependency updates before request creation

Claim replay still does not edit `package.json`, edit lockfiles, create
branches, create PRs, dispatch workflows, start repair work, or auto-merge.

## Activation Boundary

The implementation work may be started through the issue/comment activation
path:

```text
Issue Slash Command -> Route Decision -> Activation Request -> Roadmap-Sliced Consumer -> Roadmap Branch/PR
```

That activation path starts the development slice. The runtime route input is a
Dependency Alert, not the activation issue signal.

Dogfood activation evidence:

- Carrier issue:
  [jununfly/ZAgenticLoop#23](https://github.com/jununfly/ZAgenticLoop/issues/23)
- Slash command:
  [issuecomment-4895586832](https://github.com/jununfly/ZAgenticLoop/issues/23#issuecomment-4895586832)
- Activation request:
  [issuecomment-4895594821](https://github.com/jununfly/ZAgenticLoop/issues/23#issuecomment-4895594821)
- Activation consumed:
  [issuecomment-4895606098](https://github.com/jununfly/ZAgenticLoop/issues/23#issuecomment-4895606098)

## Failure Diagnosis Matrix

| Failing layer | Expected evidence |
| --- | --- |
| Signal | `source`, `update_type`, `risk`, or branch does not match the route. |
| Route Decision | `allowed: false` with a route guard reason. |
| Issue Fix Request | Contract fields missing, wrong consumer, or missing verifier gate. |
| Duplicate | `duplicate` request points at the existing active request id. |
| Claim evidence | `requested -> consumed` only when consumer, capability, verifier gate, route, and request status match. |
| Consumer repair work | Not present in this replay; package changes and Fix PR require a later explicit slice. |

## Closeout Decision Audit

| Decision | Classification | Durable home |
| --- | --- | --- |
| Canonical request chain wording is `Dependency Alert -> Route Decision -> Issue Fix Request -> Dependency Sweeper`. | durable doc | This test case and `zj-loop/ZJ-LOOP.md`. |
| Canonical claim chain wording is `Dependency Alert -> Route Decision -> Issue Fix Request -> Dependency Sweeper Claim Evidence`. | durable doc | This test case and claim replay tests. |
| First route slice stops at requested, duplicate, or denied. | durable doc | This test case and replay tests. |
| Claim slice stops at consumed lifecycle evidence and does not start repair work. | durable doc | This test case and replay tests. |
| Only patch/minor low/medium dependency alerts may create requests. | durable doc | Route table and replay tests. |
| Major, high, critical, and non-main dependency alerts are denied in this route. | durable doc | Route table and replay tests. |
| Process roadmap was reviewable on branch, then deleted at closeout after durable docs absorbed key decisions. | discarded process note | Commit history and this closeout audit. |
