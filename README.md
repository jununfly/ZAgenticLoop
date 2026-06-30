# ZAgenticLoop


<p align="center">
  <a href="https://jununfly.github.io/ZAgenticLoop/">
    <img src="https://img.shields.io/badge/✨_Explore_the_Showcase-Design_systems_that_prompt_your_agents-0d1117?style=for-the-badge&labelColor=111a28&color=3ee8c5" alt="Explore the Showcase" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/jununfly/ZAgenticLoop/stargazers"><img src="https://img.shields.io/github/stars/jununfly/ZAgenticLoop?style=social" alt="GitHub stars"></a>
  <a href="https://github.com/jununfly/ZAgenticLoop/actions/workflows/audit.yml"><img src="https://img.shields.io/github/actions/workflow/status/jununfly/ZAgenticLoop/audit.yml?label=zj-loop-audit%20dogfood" alt="zj-loop-audit dogfood"></a>
  <a href="https://www.npmjs.com/package/@jununfly/zj-loop-audit"><img src="https://img.shields.io/npm/v/@jununfly/zj-loop-audit?label=zj-loop-audit" alt="zj-loop-audit npm"></a>
  <a href="https://www.npmjs.com/package/@jununfly/zj-loop-init"><img src="https://img.shields.io/npm/v/@jununfly/zj-loop-init?label=zj-loop-init" alt="zj-loop-init npm"></a>
  <a href="https://www.npmjs.com/package/@jununfly/zj-loop-cost"><img src="https://img.shields.io/npm/v/@jununfly/zj-loop-cost?label=zj-loop-cost" alt="zj-loop-cost npm"></a>
  <a href="https://github.com/jununfly/ZAgenticLoop/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
  <a href="https://jununfly.github.io/ZAgenticLoop/"><img src="https://img.shields.io/badge/GitHub_Pages-live%20%7C%20interactive-3ee8c5" alt="Pages"></a>
</p>


<p align="center">
  <a href="https://jununfly.github.io/ZAgenticLoop/">
    <img src="assets/visuals/zagenticloop-logo.svg" alt="ZAgenticLoop logo" width="88" />
  </a>
</p>

<p align="center">
  <img src="assets/visuals/LE5.jpeg" alt="ZAgenticLoop — design the system that prompts your agents" width="100%" />
</p>

**Agentic Loop Working is replacing yourself as the person who prompts the agent. You design the system that does it instead.**

**New here?** [Quickstart (5 min)](docs/QUICKSTART.md) · [Interactive picker](https://jununfly.github.io/ZAgenticLoop/#interactive)

For developers using Grok, Claude Code, Codex, Cursor, and other AI coding agents.

A loop is a recursive goal: you define a purpose and the AI iterates (often with sub-agents, verification, and external state) until the goal is complete or the loop decides to hand off to you.



<p align="center">
  <strong><a href="https://jununfly.github.io/ZAgenticLoop/">→ Interactive showcase + pattern picker</a></strong>
  <br>
  <strong><a href="https://jununfly.github.io/ZAgenticLoop">→ ZAgenticLoop essay (Substack)</a></strong>
  <br>
  <a href="https://addyosmani.com/blog/zagenticloop/">Canonical essay by Addy Osmani</a>
</p>

## Contents

- [Quickstart (5 min)](docs/QUICKSTART.md)
- [Quick Links](#quick-links)
- [Why This Matters](#why-this-matters)
- [Five Loop Primitives + Memory](#five-loop-primitives--memory)
- [Patterns](#patterns)
- [Getting Started (5 minutes)](#getting-started-5-minutes)
- [Examples by Tool](#examples-by-tool)
- [Operating & Safety](#operating--safety)
- [Caveats](#caveats)
- [Contributing](#contributing)
- [Sources](#sources)
- [License](#license)

## Quick Links

| Start here | Description |
|------------|-------------|
| [Quickstart (5 min)](docs/QUICKSTART.md) | Scaffold → cost check → audit → first loop — **start here if you just landed** |
| [ZAgenticLoop essay](https://jununfly.github.io/ZAgenticLoop) | The concept, primitives, and Grok mapping — read for the why |
| [Pattern Picker](docs/pattern-picker.md) | Which loop to run first — **start here if unsure** |
| [Primitives Matrix](docs/primitives-matrix.md) | Grok vs Claude Code vs Codex — bookmark this |
| [Loop Design Checklist](docs/loop-design-checklist.md) | Ship readiness rubric |
| [Patterns](patterns/README.md) | 7 production patterns + [interactive picker](https://jununfly.github.io/ZAgenticLoop/#interactive) |
| [Starters](starters/) | Clone-and-run kits (Grok, Claude Code, Codex) |
| [zj-loop-audit](tools/zj-loop-audit/) | Loop Readiness Score CLI (v1.4 + activity detection) — `npx @jununfly/zj-loop-audit . --suggest` · `--badge` for README |
| [zj-loop-init](tools/zj-loop-init/) | Scaffold starters + budget/run-log (v1.2) — `npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok` |
| [zj-loop-cost](tools/zj-loop-cost/) | Token spend estimator — `npx @jununfly/zj-loop-cost` |
| [zj-loop-sync](tools/zj-loop-sync/) | Drift detection between `STATE.md` and `LOOP.md` — `node tools/zj-loop-sync/dist/cli.js .` |
| [zj-loop-mcp-server](tools/zj-loop-mcp-server/) | MCP runtime lookup for patterns, skills, state — `node tools/zj-loop-mcp-server/dist/index.js` (repo v1; npm pending) |
| [Goal Engineering](https://github.com/cobusgreyling/goal-engineering) | Companion: Grok Build `/goal` — run-until-done objectives (`npx @cobusgreyling/goal-audit`) |
| [Stories](stories/) | Real wins and honest failures |
| [Community update](https://github.com/jununfly/ZAgenticLoop/discussions/89) | **New:** 7 community PRs merged — zj-loop-sync, constraints, MCP server |

<p align="center">
  <img src="assets/visuals/section-divider.svg" alt="" width="100%" />
</p>

## Why This Matters

Peter Steinberger:
> “You shouldn’t be prompting coding agents anymore. You should be designing loops that prompt your agents.”

Boris Cherny (Head of Claude Code at Anthropic):
> “I don’t prompt Claude anymore. I have loops running that prompt Claude and figuring out what to do. My job is to write loops.”

The leverage point has moved from crafting individual prompts to designing the control systems that orchestrate agents over time.

## Five Loop Primitives + Memory

| Primitive | Job in the Loop |
|-----------|-----------------|
| **Automations / Scheduling** | Discovery + triage on a cadence |
| **Worktrees** | Safe parallel execution |
| **Skills** | Persistent project knowledge |
| **Plugins & Connectors** | Reach into your real tools (MCP) |
| **Sub-agents** | Maker / checker split |
| **+ Memory / State** | Durable spine outside any conversation |

Full detail: [docs/primitives.md](docs/primitives.md) · Cross-tool matrix: [docs/primitives-matrix.md](docs/primitives-matrix.md)

### Visual Overview

<p align="center">
  <img src="assets/visuals/primitives-infographic.jpg" alt="Five Loop Primitives + Memory — ZAgenticLoop" width="100%" />
</p>

### Anatomy of a Loop

<p align="center">
  <img src="assets/visuals/loop-cycle-animated.svg" alt="Animated loop flow — schedule, triage, state, worktree, implement, verify, MCP, human gate" width="100%" />
</p>

<details>
<summary>Mermaid diagram (copy-friendly)</summary>

```mermaid
flowchart LR
    A[Schedule / Automation] --> B[Triage Skill]
    B --> C[Read + Write STATE / Memory]
    C --> D[Isolated Worktree]
    D --> E[Implementer Sub-agent]
    E --> F[Verifier Sub-agent<br/>tests + gates]
    F --> G[MCP / Git / Tickets]
    G --> H{Human Gate?}
    H -->|safe / allowlisted| I[Commit / PR / Action]
    H -->|risky / ambiguous| J[Escalate to human<br/>with full context]
    I --> A
    J --> A
```

</details>

**This reference repo now runs its own `validate-patterns` + `audit` workflows on every push/PR** (see `.github/workflows/`). We also added `LOOP.md` describing the loops that will maintain it.

## Patterns

<p align="center">
  <img src="assets/visuals/patterns-overview.svg" alt="Seven production loop patterns with cadence and token cost" width="100%" />
</p>

| Pattern | Cadence | Starter | Week 1 | Token cost |
|---------|---------|---------|--------|------------|
| [Daily Triage](patterns/daily-triage.md) | 1d–2h | [minimal-loop](starters/minimal-loop/) | **L1** report | Low |
| [PR Babysitter](patterns/pr-babysitter.md) | 5–15m | [pr-babysitter](starters/pr-babysitter/) | L1 watch | High |
| [CI Sweeper](patterns/ci-sweeper.md) | 5–15m | [ci-sweeper](starters/ci-sweeper/) | L2 cautious | Very high |
| [Dependency Sweeper](patterns/dependency-sweeper.md) | 6h–1d | [dependency-sweeper](starters/dependency-sweeper/) | L2 patch-only | Medium |
| [Changelog Drafter](patterns/changelog-drafter.md) | 1d or tag | [changelog-drafter](starters/changelog-drafter/) | **L1** draft | Low |
| [Post-Merge Cleanup](patterns/post-merge-cleanup.md) | 1d–6h | [post-merge-cleanup](starters/post-merge-cleanup/) | **L1** off-peak | Low |
| [Issue Triage](patterns/issue-triage.md) | 2h–1d | [issue-triage](starters/issue-triage/) | **L1** propose-only | Low |

Not sure which to pick? Try the [interactive picker](https://jununfly.github.io/ZAgenticLoop/#interactive) or [pattern-picker](docs/pattern-picker.md).

Machine-readable index: [patterns/registry.yaml](patterns/registry.yaml) (7 patterns)

## Getting Started (5 minutes)

```bash
# 1. Scaffold a starter (or copy manually — see starters/)
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok

# 2. Estimate token spend for your cadence
npx @jununfly/zj-loop-cost --pattern daily-triage --level L1

# 3. Audit readiness (budget + run-log now scored)
npx @jununfly/zj-loop-audit . --suggest

# Optional: paste Loop Ready badge into your README
npx @jununfly/zj-loop-audit . --badge

# 4. See scores climb: empty → L1 → L2
bash scripts/before-after-demo.sh

# 5. Start report-only (Grok example)
/loop 1d Run loop-triage. Update STATE.md. No auto-fix in week one.
```

All three CLIs publish to npm from tagged releases — see [docs/RELEASE.md](docs/RELEASE.md). No clone required.

**Develop from source** (monorepo contributors):

```bash
cd tools/zj-loop-init && npm ci && npm test && node dist/cli.js /path/to/project --pattern daily-triage --tool grok
cd tools/zj-loop-audit && npm ci && npm test && node dist/cli.js /path/to/project --suggest
cd tools/zj-loop-cost && npm ci && npm test && node dist/cli.js --pattern ci-sweeper --cadence 15m
```

Phased rollout: **L1 report → L2 assisted fixes → L3 unattended** — see [loop-design-checklist](docs/loop-design-checklist.md).

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
- [Safety](docs/safety.md) — denylist, auto-merge, MCP scopes
- [Security](SECURITY.md) — reporting and unattended automation risks
- [Concepts](docs/concepts.md) — intent debt, comprehension debt, harness vs loop
- [MCP Cookbook](examples/mcp/) — connector examples by pattern

## Caveats

Agentic Loop Working amplifies judgment — both good and bad.

- **Token costs** can explode with sub-agents and long-running loops.
- **Verification is still on you.** Unattended loops make unattended mistakes.
- **Comprehension debt** grows faster unless you read what the loop ships.
- Two people can run the same loop and get opposite results. The loop doesn't know. You do.

Addy Osmani:
> “Build the loop. But build it like someone who intends to stay the engineer, not just the person who presses go.”

## Contributing

Share production patterns, tool mappings, and failure stories. See [CONTRIBUTING.md](CONTRIBUTING.md), [adopters](docs/adopters.md), and [GitHub Discussions](https://github.com/jununfly/ZAgenticLoop/discussions).

## Sources

- [Cobus Greyling – ZAgenticLoop (Substack)](https://jununfly.github.io/ZAgenticLoop)
- [Addy Osmani – ZAgenticLoop](https://addyosmani.com/blog/zagenticloop/)
- [Attribution & further reading](resources/sources.md)

## License

MIT

---

*Practical, tool-aware reference for agentic loop working, patterns you can clone, checklists you can ship against, and stories that include what broke.*

<p align="center">
  <a href="https://jununfly.github.io/ZAgenticLoop">Essay</a>
  ·
  <a href="https://jununfly.github.io/ZAgenticLoop/">Showcase</a>
  ·
  <a href="https://github.com/jununfly">Jununfly</a>
</p>

<p align="center">
  <a href="https://www.star-history.com/?repos=jununfly%2FZAgenticLoop&type=timeline&legend=top-left">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=jununfly/ZAgenticLoop&type=timeline&theme=dark&legend=top-left" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=jununfly/ZAgenticLoop&type=timeline&legend=top-left" />
      <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=jununfly/ZAgenticLoop&type=timeline&legend=top-left" />
    </picture>
  </a>
</p>
