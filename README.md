# ZAgenticLoop

ZAgenticLoop is a practical reference for **Agentic Loop Working**: designing the system that prompts, verifies, remembers, and hands off work for AI agents over time.

It gives you a method, production patterns, starter kits, and small CLIs for moving from ad-hoc prompting to repeatable loops across Grok, Claude Code, Codex, Cursor, OpenClaw, Windsurf, and GitHub Actions.

**Start here:** [Quickstart](docs/QUICKSTART.md) · [Pattern picker](docs/pattern-picker.md) · [Dogfood reference case](docs/designs/dogfood-reference-case.md) · [Primitives matrix](docs/primitives-matrix.md) · [Release playbook](docs/RELEASE.md)

## What You Get

| Need | Start with |
|------|------------|
| Run a low-risk first loop | [Quickstart](docs/QUICKSTART.md) + [Daily Triage](patterns/daily-triage.md) |
| Choose the right pattern | [Pattern picker](docs/pattern-picker.md) |
| Map loops across tools | [Primitives matrix](docs/primitives-matrix.md) |
| Check whether a repo is loop-ready | `npx @jununfly/zj-loop-audit . --suggest` |
| Scaffold loop state and skills | `npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok` |
| Add GitHub Actions smoke/consumer workflows | `npx @jununfly/zj-loop-init . --add github-actions` |
| Estimate token spend before scheduling | `npx @jununfly/zj-loop-cost --pattern daily-triage --level L1 --cadence 1d` |
| Audit bounded goal readiness | `npx @jununfly/zj-goal-audit . --suggest` |
| Integrate loop knowledge through MCP | [zj-loop-mcp-server](tools/zj-loop-mcp-server/) |
| Turn a PRD/plan issue into a roadmap run | Comment `/zj-loop start roadmap-sliced-development` as a maintainer/collaborator |

## Product Experience Map

The shortest mental model: **Pattern -> Starter -> Route Table -> Memory -> Verifier -> Story**.

- **User story:** move from ad-hoc prompting to repeatable Agentic Loop Working without giving up human judgment.
- **Backbone:** choose a Pattern, scaffold a Starter, keep routing policy in `zj-loop/zj-loop-route-table.yaml`, preserve Memory in state/run logs, add verifier separation, and use Human Gates for risky boundaries.
- **Adoption path:** Quickstart with Daily Triage, run L1 report-only, audit readiness, estimate cost, then graduate toward L2/L3 only after real loop activity is visible.
- **Evidence:** the pattern catalog is backed by [registry metadata](patterns/registry.yaml), [production stories](stories/), and this repo's [dogfood reference case](docs/designs/dogfood-reference-case.md).

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
npx @jununfly/zj-loop-cost --pattern daily-triage --level L1 --cadence 1d

# Audit loop readiness and get concrete next steps
npx @jununfly/zj-loop-audit . --suggest

# Optional: install the workflow-dispatch bundle
npx @jununfly/zj-loop-init . --add github-actions

# Optional: audit run-until-done goal readiness
npx @jununfly/zj-goal-audit . --suggest
```

When contributing from source, run the same tools from this monorepo:

```bash
cd tools/zj-loop-init && npm ci && npm test && node dist/cli.js /path/to/project --pattern daily-triage --tool grok
cd tools/zj-loop-cost && npm ci && npm test && node dist/cli.js --pattern daily-triage --level L1 --cadence 1d
cd tools/zj-loop-audit && npm ci && npm test && node dist/cli.js /path/to/project --suggest
cd tools/zj-goal-audit && npm ci && npm test && node dist/cli.js /path/to/project --suggest
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
npx @jununfly/zj-loop-cost --pattern daily-triage --level L1 --cadence 1d
npx @jununfly/zj-loop-audit . --suggest
```

3. Run report-only for week one:

```text
/loop 1d Run zj-loop-triage. Update zj-loop/STATE.md. No auto-fix in week one.
```

4. Read `zj-loop/STATE.md`, correct anything wrong, then commit the scaffold and first state update.

Phased rollout: **L1 report -> L2 assisted fixes -> L3 unattended**. Do not skip the human-read step just because the loop is automated.

## GitHub Actions Bundle

Install the generated workflow-dispatch bundle when you want a repo-local smoke
path and Route Table-controlled consumer workflows:

```bash
npx @jununfly/zj-loop-init . --add github-actions
```

This creates `zj-loop-*.yml` workflows with pinned package versions and
generated metadata. Only `manual-smoke-report` is intended to run safely by
default; side-effecting consumers still need explicit Route Table enablement:

```bash
npx --yes --package @jununfly/zj-loop-core@0.1.2 zj-loop-route status
npx --yes --package @jununfly/zj-loop-core@0.1.2 zj-loop-route enable ci-sweeper --confirm "enable ci-sweeper side effects"
npx --yes --package @jununfly/zj-loop-core@0.1.2 zj-loop-route disable ci-sweeper
```

Run the `ZJ Loop Smoke` workflow manually first, then audit:

```bash
npx @jununfly/zj-loop-audit . --suggest
```

Upgrade generated workflows intentionally:

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

See [Daily Triage](patterns/daily-triage.md), [Roadmap-Sliced Development](patterns/roadmap-sliced-development.md), and [Triage Architecture](docs/designs/triage-architecture.md).

## Tool Packages

| Package | CLI | Purpose | Current version |
|---------|-----|---------|----------------|
| `@jununfly/zj-loop-core` | library | Shared registry, project evidence, semantic queries, and CLI harness | `0.1.2` |
| `@jununfly/zj-loop-init` | `zj-loop-init` | Scaffold starters, route table, state files, budget, and run logs | `0.1.6` |
| `@jununfly/zj-loop-audit` | `zj-loop-audit` | Loop Readiness Score and suggestions | `0.1.3` |
| `@jununfly/zj-loop-cost` | `zj-loop-cost` | Token spend estimator by pattern, level, and cadence | `0.1.4` |
| `@jununfly/zj-loop-sync` | `zj-loop-sync` | Drift check between loop state and config | `0.1.2` |
| `@jununfly/zj-loop-mcp-server` | `zj-loop-mcp-server` | Read-only MCP access to patterns, skills, route table, state, and safety docs | `0.1.3` |
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
