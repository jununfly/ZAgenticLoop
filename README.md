# Loop Engineering

<p align="center">
  <a href="https://cobusgreyling.github.io/loop-engineering/">
    <img src="https://img.shields.io/badge/✨_Explore_the_Showcase-Design_systems_that_prompt_your_agents-0d1117?style=for-the-badge&labelColor=111a28&color=3ee8c5" alt="Explore the Showcase" />
  </a>
</p>

<p align="center">
  <strong><a href="https://cobusgreyling.github.io/loop-engineering/">→ cobusgreyling.github.io/loop-engineering</a></strong>
</p>

<p align="center">
  <img src="assets/cobus-greyling.jpg" alt="Cobus Greyling" width="640" />
</p>



**Loop engineering is replacing yourself as the person who prompts the agent. You design the system that does it instead.**

A loop is a recursive goal: you define a purpose and the AI iterates (often with sub-agents, verification, and external state) until the goal is complete or the loop decides to hand off to you.

## Quick Links

| Start here | Description |
|------------|-------------|
| [Primitives Matrix](docs/primitives-matrix.md) | Grok vs Claude Code vs Codex — **bookmark this** |
| [Loop Design Checklist](docs/loop-design-checklist.md) | Ship readiness rubric |
| [Patterns](patterns/README.md) | PR babysitter, daily triage, CI sweeper, post-merge |
| [Starters](starters/minimal-loop/) | Clone-and-run kits |
| [loop-audit](tools/loop-audit/) | Loop Readiness Score CLI |
| [Stories](stories/) | Real wins and honest failures |

## Why This Matters

Peter Steinberger:
> “You shouldn’t be prompting coding agents anymore. You should be designing loops that prompt your agents.”

Boris Cherny (Head of Claude Code at Anthropic):
> “I don’t prompt Claude anymore. I have loops running that prompt Claude and figuring out what to do. My job is to write loops.”

The leverage point has moved from crafting individual prompts to designing the control systems that orchestrate agents over time.

## The Five Building Blocks + Memory

| Primitive | Job in the Loop |
|-----------|-----------------|
| **Automations / Scheduling** | Discovery + triage on a cadence |
| **Worktrees** | Safe parallel execution |
| **Skills** | Persistent project knowledge |
| **Plugins & Connectors** | Reach into your real tools (MCP) |
| **Sub-agents** | Maker / checker split |
| **+ Memory / State** | Durable spine outside any conversation |

Full detail: [docs/primitives.md](docs/primitives.md) · Cross-tool matrix: [docs/primitives-matrix.md](docs/primitives-matrix.md)

## Patterns

| Pattern | Cadence | Starter |
|---------|---------|---------|
| [PR Babysitter](patterns/pr-babysitter.md) | 5–15m | [starters/pr-babysitter](starters/pr-babysitter/) |
| [Daily Triage](patterns/daily-triage.md) | 1d–2h | [starters/minimal-loop](starters/minimal-loop/) |
| [CI Sweeper](patterns/ci-sweeper.md) | 5–15m | [starters/ci-sweeper](starters/ci-sweeper/) |
| [Post-Merge Cleanup](patterns/post-merge-cleanup.md) | 1d–6h | — |

Machine-readable index: [patterns/registry.yaml](patterns/registry.yaml)

## Getting Started (5 minutes)

```bash
# 1. Clone this repo or copy a starter into your project
cp -r starters/minimal-loop/.grok/skills/loop-triage .grok/skills/
cp starters/minimal-loop/STATE.md.example STATE.md

# 2. Audit readiness
cd tools/loop-audit && npm install && npm run build
node dist/cli.js /path/to/your/project

# 3. Start report-only (Grok)
/loop 1d Run loop-triage. Update STATE.md. No auto-fix in week one.
```

Phased rollout: **L1 report → L2 assisted fixes → L3 unattended** — see [loop-design-checklist](docs/loop-design-checklist.md).

## Examples by Tool

- [Grok](examples/grok/daily-triage.md)
- [Claude Code](examples/claude-code/)
- [Codex](examples/codex/)
- [GitHub Actions](examples/github-actions/)

## Operating & Safety

- [Failure Modes](docs/failure-modes.md) — incident-style catalog
- [Operating Loops](docs/operating-loops.md) — cost, logging, when to kill
- [Safety](docs/safety.md) — denylist, auto-merge, MCP scopes
- [Concepts](docs/concepts.md) — intent debt, comprehension debt, harness vs loop

## Caveats

Loop engineering amplifies judgment — both good and bad.

- **Token costs** can explode with sub-agents and long-running loops.
- **Verification is still on you.** Unattended loops make unattended mistakes.
- **Comprehension debt** grows faster unless you read what the loop ships.
- Two people can run the same loop and get opposite results. The loop doesn't know. You do.

Addy Osmani:
> “Build the loop. But build it like someone who intends to stay the engineer, not just the person who presses go.”

## Contributing

Share production patterns, tool mappings, and failure stories. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Sources

- [Addy Osmani – Loop Engineering](https://addyosmani.com/blog/loop-engineering/)
- [Attribution & further reading](resources/sources.md)

## License

MIT

---

*Practical, tool-aware reference for loop engineering — patterns you can clone, checklists you can ship against, and stories that include what broke.*
