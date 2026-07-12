# ZAgenticLoop

ZAgenticLoop is a practical reference for **Agentic Loop Working**: designing the system that prompts, verifies, remembers, and hands off work for AI agents over time.

It gives you a method, production patterns, starter kits, and small CLIs for moving from ad-hoc prompting to repeatable loops across Grok, Claude Code, Codex, Cursor, OpenClaw, Windsurf, and GitHub Actions.

**Start here:** [Quickstart](docs/QUICKSTART.md) · [Pattern picker](docs/pattern-picker.md) · [User-project execution-ready bundle](docs/designs/user-project-execution-ready-bundle.md) · [Architecture](docs/designs/architecture.md) · [Route Table Architecture](docs/designs/route-table-architecture.md) · [Dogfood reference case](docs/designs/dogfood-reference-case.md) · [Release playbook](docs/RELEASE.md)

## What's New In This Release

This release is centered on two dogfood-proven routes that turn loop design into
an executable user-project path:

1. **Plan/PRD intake to Roadmap-Sliced Development**
   Maintainer issue comments can activate `roadmap-sliced-development`, create
   a bounded roadmap branch/PR handoff, preserve process evidence, and finish
   with guarded post-merge closeout.

2. **Issue backlog triage to source-issue request handoff**
   Open issues can be scanned into stable triage recommendations. A
   maintainer/collaborator can confirm a transition, and the system creates or
   dedupes request evidence on the source issue instead of spawning confusing
   duplicate carrier issues.

The release also tightens the architecture around Route Decision, Route Table
control, consumer execution, and triage state so agents can see where authority
lives instead of guessing from prose.

This branch also moves provider support from "GitHub Actions as the default
automation surface" toward explicit **GitHub/GitLab provider adapters**. GitLab
projects can install generated GitLab CI fragments, produce Route Decision
artifacts, and use provider-aware GitLab issue/MR/pipeline evidence without
being mistaken for GitHub repositories.

## What You Get

| Need | Start with |
|------|------------|
| Run a low-risk first loop | [Quickstart](docs/QUICKSTART.md) + [Daily Triage](patterns/daily-triage.md) |
| Choose the right pattern | [Pattern picker](docs/pattern-picker.md) |
| Map loops across tools | [Primitives matrix](docs/primitives-matrix.md) |
| Check whether a repo is loop-ready | `npx @jununfly/zj-loop-audit . --suggest` |
| Scaffold loop state and skills | `npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok` |
| Add GitHub provider smoke/consumer workflows | `npx @jununfly/zj-loop-init . --add github-actions` |
| Add GitLab provider smoke/consumer jobs | `npx @jununfly/zj-loop-init . --add gitlab-ci` |
| Choose the first execution-ready user-project route | [User-project execution-ready bundle](docs/designs/user-project-execution-ready-bundle.md) |
| Estimate token spend before scheduling | `npx @jununfly/zj-loop-cost . --pattern daily-triage --level L1 --cadence 1d` |
| Audit bounded goal readiness | `npx @jununfly/zj-goal-audit . --suggest` |
| Integrate loop knowledge through MCP | [zj-loop-mcp-server](tools/zj-loop-mcp-server/) |
| Turn a PRD/plan issue into a roadmap run | Comment `/zj-loop start roadmap-sliced-development` as a maintainer/collaborator |

## Product Experience Map

The shortest mental model: **Pattern -> Starter -> Route Table -> Memory -> Verifier -> Story**.

- **User story:** move from ad-hoc prompting to repeatable Agentic Loop Working without giving up human judgment.
- **Backbone:** choose a Pattern, scaffold a Starter, keep routing policy in `zj-loop/zj-loop-route-table.yaml`, preserve Memory in state/run logs, route signals through deterministic consumers, and use Human Gates only at risky boundaries.
- **Adoption path:** Quickstart with Daily Triage, run report-only, audit structural readiness, estimate cost from the local registry, then raise execution authority only after real loop activity is visible.
- **Evidence:** the pattern catalog is backed by [registry metadata](patterns/registry.yaml), [production stories](stories/), and this repo's [dogfood reference case](docs/designs/dogfood-reference-case.md).

## Architecture Map

The larger architecture docs are meant to answer different questions:

| Question | Read |
|----------|------|
| How do packages, patterns, starters, registry data, MCP, and CLIs fit together? | [Architecture](docs/designs/architecture.md) |
| Where does routing policy live, and how does a signal become a route decision? | [Route Table Architecture](docs/designs/route-table-architecture.md) |
| How should issue and daily triage divide discovery, recommendation, and side effects? | [Triage Architecture](docs/designs/triage-architecture.md) |
| What separates a route being installed, dogfood-verified, execution-ready, or live? | [Route Consumer Execution Architecture](docs/designs/route-consumer-execution-architecture.md) |
| How do GitHub and GitLab adapters share protocol while keeping platform semantics clear? | [Provider Adapter Parity Architecture](docs/designs/provider-adapter-parity-architecture.md) |

The important boundary: **readiness is not authority**. Readiness says the repo
has the structure and evidence to run a loop. Authority is granted by Route
Table status, route mode, confirmation phrases, and consumer-specific guards.

## Dogfood Reference

This repository is maintained as a live dogfood case for Agentic Loop Working.
It runs scheduled audit, validation, daily triage, changelog drafting, release
workflow checks, and drift detection against its own patterns and tooling.

The reference case explains the configuration sources, state files, workflow
flow, gates, and current automation boundaries: [Dogfood reference case](docs/designs/dogfood-reference-case.md).

## Install And Run

Use the public npm packages directly:

```bash
# Scaffold a starter into your repo
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok

# Estimate operating cost before scheduling
npx @jununfly/zj-loop-cost . --pattern daily-triage --level L1 --cadence 1d

# Audit loop readiness and get concrete next steps
npx @jununfly/zj-loop-audit . --suggest

# Optional for GitHub-hosted repos: install the workflow-dispatch adapter
npx @jununfly/zj-loop-init . --add github-actions

# Optional for GitLab-hosted repos: install the GitLab CI adapter
npx @jununfly/zj-loop-init . --add gitlab-ci

# Optional: audit run-until-done goal readiness
npx @jununfly/zj-goal-audit . --suggest
```

When contributing from source, run the same tools from this monorepo:

```bash
cd tools/zj-loop-init && npm ci && npm test
node dist/cli.js /path/to/project --pattern daily-triage --tool grok
```

If `npx` stalls on package resolution, use an already installed binary
(`zj-loop-init`, `zj-loop-audit`, `zj-loop-cost`), or reuse npm's cache:

```bash
npm exec --offline --package=@jununfly/zj-loop-init -- zj-loop-init . --pattern daily-triage --tool grok
```

More fallback paths are in [Quickstart](docs/QUICKSTART.md#if-npx-stalls-or-you-are-offline).

## First Loop In 5 Minutes

1. Scaffold Daily Triage into a repo:

```bash
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok
```

2. Check cost and readiness:

```bash
npx @jununfly/zj-loop-cost . --pattern daily-triage --level L1 --cadence 1d
npx @jununfly/zj-loop-audit . --suggest
```

3. Run report-only for week one:

```text
/loop 1d Run zj-loop-triage. Update zj-loop/STATE.md. No auto-fix in week one.
```

4. Read `zj-loop/STATE.md`, correct anything wrong, then commit the scaffold. For Daily Triage, `zj-loop/STATE.md` and `zj-loop/zj-loop-run-log.md` are local runtime files by default; commit the `.example` templates and policy files, not the cursor-bearing local state.

Phased rollout separates two axes: **readiness level** says how prepared the repo is; **execution authority** says what the loop may actually do. Start with report-only authority even when audit readiness is high. Do not skip the human-read step just because the loop is automated.

## Provider-Aware Adoption

Every project starts with the same portable loop substrate:

```bash
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok
npx @jununfly/zj-loop-init . --add route-table
npx @jununfly/zj-loop-audit . --suggest
```

Then install the provider adapter that matches the repository:

```bash
# GitHub-hosted repositories
npx @jununfly/zj-loop-init . --add github-actions

# GitLab-hosted or self-managed GitLab repositories
npx @jununfly/zj-loop-init . --add gitlab-ci
```

The GitHub bundle is a GitHub provider adapter, not a universal automation
substrate. `zj-loop-init --add github-actions` refuses detected GitLab projects
by default; use `--force` only for intentional GitHub adapter mirroring.

GitLab installation creates includeable fragments under `zj-loop/gitlab-ci/`;
root `.gitlab-ci.yml` is created only when absent. Stage, runner tag, image,
local tarball, and restricted-CI details are covered in
[Quickstart](docs/QUICKSTART.md#gitlab-ci).

### GitHub And GitLab Compared

GitHub and GitLab share the ZAgenticLoop route protocol. The same Route Table
decides whether a signal is report-only, request-backed, activation-backed, or
allowed to reach a consumer. Provider adapters only decide how that protocol is
carried through each platform.

| Area | Shared contract | GitHub adapter | GitLab adapter |
|------|-----------------|----------------|----------------|
| Automation surface | Generated jobs call published `@jununfly/zj-loop-*` commands and preserve JSON evidence. | Generated workflows live in `.github/workflows/zj-loop-*.yml` and run through GitHub Actions. | Generated fragments live in `zj-loop/gitlab-ci/`; init creates root `.gitlab-ci.yml` only when absent. |
| Routing policy | `zj-loop/zj-loop-route-table.yaml` owns route enablement, mode, maturity, and confirmation phrases. | Workflow inputs and event context feed Route Decision evidence. | Pipeline variables, job context, and GitLab CI artifacts feed Route Decision evidence. |
| Evidence carriers | Route Decision, request, claim, plan, runner, and closeout evidence stay replayable. | Issue/PR comments, workflow summaries, artifacts, branches, and PRs. | Issue/MR notes, job logs, artifacts, branches, and MRs. |
| Review boundary | Fix and roadmap work must cross a review boundary before merge. | Pull Requests. | Merge Requests. |
| Issue work | Existing source issues can carry request evidence instead of spawning duplicate carriers. | GitHub Issues and comments. | GitLab Issues and notes. |
| Smoke path | Manual smoke should be the first provider check. | `ZJ Loop Smoke` workflow writes route and consumer evidence to the workflow summary. | Manual smoke job writes route, consumer, and environment diagnostic evidence to job artifacts/logs. |
| Configuration knobs | Package pins and Route Table state should be deterministic. | GitHub templates are rendered directly from `templates/github-actions/`. | GitLab templates additionally render stage, runner tags, image, and optional core package source. |
| Install health | Generated substrate should be committed and auditable. | Audit checks generated workflow metadata, Route Table presence, manual smoke defaults, and package pins. | Audit warns when `.gitlab-ci.yml`, `zj-loop/gitlab-ci/zj-loop-*.yml`, or `zj-loop/zj-loop-route-table.yaml` are ignored or untracked. |
| Current side-effect boundary | Report-only routes never mutate trackers; live routes require Route Table enablement and consumer guards. | The currently validated live paths are strongest on GitHub, including request creation, roadmap branch/PR bootstrap, and guarded post-merge cleanup. | GitLab carries provider-aware evidence and dry-run/request plans; Roadmap Activation has a narrow guarded branch/draft-MR live path, while several other MR-producing consumers remain refused until promoted. |

Use GitHub Actions when the repository is GitHub-hosted and you want the most
complete live automation path today. Use GitLab CI when the repository is
GitLab-hosted or self-managed GitLab and you want the same route protocol with
GitLab-native evidence carriers. Do not install the GitHub adapter into a
GitLab project unless the repository intentionally mirrors GitHub Actions.

## GitHub Actions Bundle

Install the generated workflow-dispatch bundle in GitHub-hosted repositories:

```bash
npx @jununfly/zj-loop-init . --add github-actions
```

This creates `zj-loop-*.yml` workflows with pinned package versions and
generated metadata. Run `ZJ Loop Smoke` first, then inspect Route Table status
before enabling side-effecting routes:

```bash
npx --yes --package @jununfly/zj-loop-core@0.1.6 zj-loop-route status
npx --yes --package @jununfly/zj-loop-core@0.1.6 zj-loop-route enable ci-sweeper --confirm "enable ci-sweeper side effects"
npx --yes --package @jununfly/zj-loop-core@0.1.6 zj-loop-route disable ci-sweeper
```

The first execution-ready route set is request-backed:

- `roadmap-sliced-development`: issue slash command to Activation Request to
  bounded roadmap branch/PR bootstrap.
- `issue-backlog-triage`: open issue backlog to recommended triage transition
  evidence with fixed confirmation commands.
- `issue-triage-transition`: maintainer/collaborator confirmation to
  request-only source issue Issue Fix Request comments for `ready-for-agent`
  recommendations.
- `ci-sweeper`: failed workflow to durable GitHub Issue Fix Request.
- `post-merge-roadmap-closeout`: merged Roadmap-Sliced PR to guarded dry-run
  closeout, with optional fixed-phrase live cleanup.

Report-only scanners recommend; confirmed transitions create durable request
evidence; execution consumers produce branches, PRs, repair plans, or closeout
evidence inside their own authority boundary. For the complete route menu and
safety boundaries, see [User-project execution-ready bundle](docs/designs/user-project-execution-ready-bundle.md).

Upgrade generated workflows intentionally when package pins or templates change:

```bash
npx @jununfly/zj-loop-init . --upgrade github-actions
```

If a generated workflow was edited locally, upgrade renames the old file with a
`.bak` suffix and writes the new canonical file in place. Review both files
before committing; deep project-specific workflow migration remains a maintainer
decision.

## From Plan Intake To Roadmap

When an issue is really a PRD, plan, or multi-slice initiative, keep Daily Triage
as discovery and use an explicit activation comment to start Roadmap-Sliced
Development:

```text
/zj-loop start roadmap-sliced-development
```

First-version rules:

- Only maintainers/collaborators may activate.
- The command takes no parameters.
- `zj-loop-triage` may recommend the command, but it does not create branches,
  roadmap files, commits, or activation requests.
- `zj-loop-activate` owns authorization, duplicate detection, and append-only
  activation comments.
- Roadmap-Sliced Development consumes an explicit issue/request id and resumes
  from roadmap state after consumption.

When triage finds a ready PRD/plan issue and can name the exact next command,
surface that handoff explicitly instead of leaving it only in local state:

```bash
npx --yes --package @jununfly/zj-loop-core zj-loop-prd-handoff handoff-plan \
  --prd-issue-url https://github.com/OWNER/REPO/issues/123 \
  --next-command 'Ask Codex: "Run the roadmap-sliced-development loop for issue #123..."'
```

Default `report-only` mode prints the stable comment body and exact manual
`gh issue comment ...` command. `--mode comment-enabled` is an explicit opt-in
for workflows that are allowed to write PRD issue comments and must use the
marker `<!-- zj-loop:prd-next-command-handoff -->` for idempotency.

See [Daily Triage](patterns/daily-triage.md), [Roadmap-Sliced Development](patterns/roadmap-sliced-development.md), and [Triage Architecture](docs/designs/triage-architecture.md).

## Tool Packages

| Package | CLI | Purpose | Current version |
|---------|-----|---------|----------------|
| `@jununfly/zj-loop-core` | library + route CLIs | Shared registry, route decisions, consumer runners, project evidence, semantic queries, and CLI harness | `0.1.6` |
| `@jununfly/zj-loop-init` | `zj-loop-init` | Scaffold starters, route table, local runtime state, generated workflow bundle, budget, and run logs | `0.1.9` |
| `@jununfly/zj-loop-audit` | `zj-loop-audit` | Loop Readiness Score, policy suggestions, and generated artifact checks | `0.1.6` |
| `@jununfly/zj-loop-cost` | `zj-loop-cost` | Token spend estimator by local/project registry, pattern, level, and cadence | `0.1.5` |
| `@jununfly/zj-loop-sync` | `zj-loop-sync` | Drift check between loop state, route table, generated workflows, and config | `0.1.3` |
| `@jununfly/zj-loop-mcp-server` | `zj-loop-mcp-server` | Read-only MCP access to patterns, skills, route table, triage state, state, and safety docs | `0.1.4` |
| `@jununfly/zj-goal-audit` | `zj-goal-audit` | Goal Readiness Score for bounded run-until-done work | `0.1.1` |

Release details live in [docs/RELEASE.md](docs/RELEASE.md). The first release used `NPM_TOKEN`; Trusted Publisher is tracked as a post-first-release hardening step.

## Core Concepts

| Primitive | Job in the loop |
|-----------|-----------------|
| Automations / Scheduling | Discovery and triage on a cadence |
| Worktrees | Safe parallel execution |
| Skills | Persistent project knowledge |
| Plugins & Connectors | Reach into real tools through MCP and integrations |
| Sub-agents | Maker/checker split |
| Memory / State | Durable spine outside any one conversation |

Full detail: [docs/primitives.md](docs/primitives.md) · [docs/primitives-matrix.md](docs/primitives-matrix.md)

## Patterns

| Pattern | Cadence | Starter | Week 1 | Token cost |
|---------|---------|---------|--------|------------|
| [Daily Triage](patterns/daily-triage.md) | 1d-2h | [minimal-loop](starters/minimal-loop/) | L1 report | Low |
| [PR Steward](patterns/pr-steward.md) | 5-15m | [pr-steward](starters/pr-steward/) | L1 watch | High |
| [CI Sweeper](patterns/ci-sweeper.md) | 5-15m | [ci-sweeper](starters/ci-sweeper/) | L2 cautious | Very high |
| [Dependency Sweeper](patterns/dependency-sweeper.md) | 6h-1d | [dependency-sweeper](starters/dependency-sweeper/) | L2 patch-only | Medium |
| [Changelog Drafter](patterns/changelog-drafter.md) | 1d or tag | [changelog-drafter](starters/changelog-drafter/) | L1 draft | Low |
| [Post-Merge Cleanup](patterns/post-merge-cleanup.md) | 1d-6h | [post-merge-cleanup](starters/post-merge-cleanup/) | L1 off-peak | Low |
| [Issue Triage](patterns/issue-triage.md) | 2h-1d | [issue-triage](starters/issue-triage/) | L1 propose-only | Low |
| [Roadmap-Sliced Development](patterns/roadmap-sliced-development.md) | 1d | [roadmap-sliced-development](starters/roadmap-sliced-development/) | L2 guided | Medium |

Machine-readable index: [patterns/registry.yaml](patterns/registry.yaml)

## Examples by Tool

- [Grok](examples/grok/daily-triage.md)
- [Claude Code](examples/claude-code/)
- [Codex](examples/codex/)
- [OpenClaw](examples/openclaw/daily-triage.md)
- [GitHub Actions](examples/github-actions/)

## Operating & Safety

- [Failure Modes](docs/failure-modes.md) — incident-style catalog
- [Anti-Patterns](docs/anti-patterns.md) — design mistakes before production
- [Multi-Loop Coordination](docs/multi-loop.md) — when loops collide
- [Operating Loops](docs/operating-loops.md) — cost, logging, when to kill
- [Safety](zj-loop/zj-loop-safety.md) — denylist, auto-merge, MCP scopes
- [Route Table Architecture](docs/designs/route-table-architecture.md) — global routing control plane for loop signals
- [Security](SECURITY.md) — reporting and unattended automation risks
- [Concepts](docs/concepts.md) — intent debt, comprehension debt, harness vs loop
- [Architecture](docs/designs/architecture.md) — registry, core, readiness, MCP, CLI boundaries
- [MCP Cookbook](examples/mcp/) — connector examples by pattern

## Caveats

Agentic Loop Working amplifies judgment — both good and bad.

- **Token costs** can explode with sub-agents and long-running loops.
- **Verification is still on you.** Unattended loops make unattended mistakes.
- **Comprehension debt** grows faster unless you read what the loop ships.
- Two people can run the same loop and get opposite results. The loop doesn't know. You do.


## Contributing

Share production patterns, tool mappings, and failure stories. See [CONTRIBUTING.md](CONTRIBUTING.md), [adopters](docs/adopters.md), and [GitHub Issues](https://github.com/jununfly/ZAgenticLoop/issues).

## Sources

- [Attribution & further reading](resources/sources.md)

## License

MIT

---

*Practical, tool-aware reference for agentic loop working, patterns you can clone, checklists you can ship against, and stories that include what broke.*
