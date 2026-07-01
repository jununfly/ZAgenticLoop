# ZAgenticLoop

ZAgenticLoop 是一份面向 **Agentic Loop Working** 的实践参考：帮助你设计一个能持续提示、验证、记忆并在合适边界交接给人的 AI Agent 工作系统。

它提供方法论、生产级 Pattern、Starter Kit 和一组轻量 CLI，帮助你从一次性的 ad-hoc prompting，走向可重复运行的 loop。适用工具包括 Grok、Claude Code、Codex、Cursor、OpenClaw、Windsurf 和 GitHub Actions。

**从这里开始：** [产品体验报告](https://jununfly.github.io/ZAgenticLoop/product-experience-report.zh-CN.html) · [Quickstart](docs/QUICKSTART.md) · [Pattern picker](docs/pattern-picker.md) · [Primitives matrix](docs/primitives-matrix.md) · [Release playbook](docs/RELEASE.md)

## 你能得到什么

| 需求 | 从这里开始 |
|------|------------|
| 跑一个低风险的第一个 loop | [Quickstart](docs/QUICKSTART.md) + [Daily Triage](patterns/daily-triage.md) |
| 选择合适的 pattern | [Pattern picker](docs/pattern-picker.md) |
| 对照不同工具中的 loop 能力 | [Primitives matrix](docs/primitives-matrix.md) |
| 检查一个 repo 是否具备 loop readiness | `npx @jununfly/zj-loop-audit . --suggest` |
| 初始化 loop state 和 skills | `npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok` |
| 在调度前估算 token 开销 | `npx @jununfly/zj-loop-cost --pattern daily-triage --level L1 --cadence 1d` |
| 审计有明确终止条件的 goal readiness | `npx @jununfly/zj-goal-audit . --suggest` |
| 通过 MCP 集成 loop knowledge | [zj-loop-mcp-server](tools/zj-loop-mcp-server/) |

## 产品体验地图

最短心智模型：**Pattern -> Starter -> Memory -> Verifier -> Story**。

- **User story：** 从 ad-hoc prompting 走向可重复的 Agentic Loop Working，同时保留人的判断权。
- **Backbone：** 选择 Pattern，复制 Starter，把 Memory 保存在 state/run log 中，加入 verifier 分离，并用 Human Gate 管住高风险边界。
- **采用路径：** 用 Daily Triage 跑 Quickstart，先 L1 report-only，再审计 readiness、估算成本；只有在看见真实 Loop Activity 后，才逐步走向 L2/L3。
- **证据来源：** pattern catalog 由 [registry metadata](patterns/registry.yaml)、[production stories](stories/) 和完整的 [产品体验报告](https://jununfly.github.io/ZAgenticLoop/product-experience-report.zh-CN.html) 支撑。

## 安装与运行

直接使用公开 npm packages：

```bash
# 在你的 repo 中初始化 starter
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok

# 在调度前估算运行成本
npx @jununfly/zj-loop-cost --pattern daily-triage --level L1 --cadence 1d

# 审计 loop readiness 并获得具体下一步
npx @jununfly/zj-loop-audit . --suggest

# 可选：审计 run-until-done goal readiness
npx @jununfly/zj-goal-audit . --suggest
```

从源码贡献时，在这个 monorepo 中运行同一组工具：

```bash
cd tools/zj-loop-init && npm ci && npm test && node dist/cli.js /path/to/project --pattern daily-triage --tool grok
cd tools/zj-loop-cost && npm ci && npm test && node dist/cli.js --pattern daily-triage --level L1 --cadence 1d
cd tools/zj-loop-audit && npm ci && npm test && node dist/cli.js /path/to/project --suggest
cd tools/zj-goal-audit && npm ci && npm test && node dist/cli.js /path/to/project --suggest
```

## 5 分钟跑起第一个 Loop

1. 在 repo 中初始化 Daily Triage：

```bash
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok
```

2. 检查成本和 readiness：

```bash
npx @jununfly/zj-loop-cost --pattern daily-triage --level L1 --cadence 1d
npx @jununfly/zj-loop-audit . --suggest
```

3. 第一周只跑 report-only：

```text
/loop 1d Run loop-triage. Update STATE.md. No auto-fix in week one.
```

4. 阅读 `STATE.md`，修正任何错误，然后提交 starter 和第一次 state update。

分阶段推出：**L1 report -> L2 assisted fixes -> L3 unattended**。不要因为 loop 已经自动化，就跳过人的阅读步骤。

## Tool Packages

| Package | CLI | 用途 | 当前版本 |
|---------|-----|------|----------|
| `@jununfly/zj-loop-core` | library | 共享 registry、project evidence、semantic queries 和 CLI harness | `0.1.0` |
| `@jununfly/zj-loop-init` | `zj-loop-init` | 初始化 starters、state files、budget 和 run logs | `0.1.0` |
| `@jununfly/zj-loop-audit` | `zj-loop-audit` | Loop Readiness Score 和建议 | `0.1.0` |
| `@jununfly/zj-loop-cost` | `zj-loop-cost` | 按 pattern、level、cadence 估算 token 开销 | `0.1.0` |
| `@jununfly/zj-loop-sync` | `zj-loop-sync` | 检查 loop state 与 config 之间的漂移 | `0.1.0` |
| `@jununfly/zj-loop-mcp-server` | `zj-loop-mcp-server` | 只读 MCP 访问 patterns、skills、state 和 safety docs | `0.1.0` |
| `@jununfly/zj-goal-audit` | `zj-goal-audit` | 面向 bounded run-until-done work 的 Goal Readiness Score | `0.1.0` |

发布细节见 [docs/RELEASE.md](docs/RELEASE.md)。首次发布使用 `NPM_TOKEN`；Trusted Publisher 作为首发后的加固项跟踪。

## 核心概念

| Primitive | 在 loop 中的职责 |
|-----------|------------------|
| Automations / Scheduling | 按 cadence 做发现和 triage |
| Worktrees | 安全并行执行 |
| Skills | 持久化项目知识 |
| Plugins & Connectors | 通过 MCP 和 integrations 触达真实工具 |
| Sub-agents | Maker/checker 分离 |
| Memory / State | 脱离单次对话的持久骨架 |

完整说明：[docs/primitives.md](docs/primitives.md) · [docs/primitives-matrix.md](docs/primitives-matrix.md)

## Patterns

| Pattern | Cadence | Starter | Week 1 | Token cost |
|---------|---------|---------|--------|------------|
| [Daily Triage](patterns/daily-triage.md) | 1d-2h | [minimal-loop](starters/minimal-loop/) | L1 report | Low |
| [PR Babysitter](patterns/pr-babysitter.md) | 5-15m | [pr-babysitter](starters/pr-babysitter/) | L1 watch | High |
| [CI Sweeper](patterns/ci-sweeper.md) | 5-15m | [ci-sweeper](starters/ci-sweeper/) | L2 cautious | Very high |
| [Dependency Sweeper](patterns/dependency-sweeper.md) | 6h-1d | [dependency-sweeper](starters/dependency-sweeper/) | L2 patch-only | Medium |
| [Changelog Drafter](patterns/changelog-drafter.md) | 1d or tag | [changelog-drafter](starters/changelog-drafter/) | L1 draft | Low |
| [Post-Merge Cleanup](patterns/post-merge-cleanup.md) | 1d-6h | [post-merge-cleanup](starters/post-merge-cleanup/) | L1 off-peak | Low |
| [Issue Triage](patterns/issue-triage.md) | 2h-1d | [issue-triage](starters/issue-triage/) | L1 propose-only | Low |

机器可读索引：[patterns/registry.yaml](patterns/registry.yaml)

## 按工具查看 Examples

- [Grok](examples/grok/daily-triage.md)
- [Claude Code](examples/claude-code/)
- [Codex](examples/codex/)
- [OpenClaw](examples/openclaw/daily-triage.md)
- [GitHub Actions](examples/github-actions/)

## 运行与安全

- [Failure Modes](docs/failure-modes.md) — incident-style catalog
- [Anti-Patterns](docs/anti-patterns.md) — 上生产前要避开的设计错误
- [Multi-Loop Coordination](docs/multi-loop.md) — 多个 loop 冲突时怎么办
- [Operating Loops](docs/operating-loops.md) — 成本、日志、何时杀掉 loop
- [Safety](docs/safety.md) — denylist、auto-merge、MCP scopes
- [Security](SECURITY.md) — 报告安全问题和 unattended automation 风险
- [Concepts](docs/concepts.md) — intent debt、comprehension debt、harness vs loop
- [Architecture](docs/designs/architecture.md) — registry、core、readiness、MCP、CLI 边界
- [MCP Cookbook](examples/mcp/) — 按 pattern 展示 connector examples

## 注意事项

Agentic Loop Working 会放大判断力，好的和坏的都会被放大。

- **Token costs** 可能随着 sub-agents 和 long-running loops 快速膨胀。
- **Verification 仍然是你的责任。** Unattended loops 会制造 unattended mistakes。
- **Comprehension debt** 会更快增长，除非你认真阅读 loop 产出的内容。
- 两个人运行同一个 loop，可能得到相反结果。loop 不知道这一点，你知道。

## 贡献

欢迎分享 production patterns、tool mappings 和 failure stories。见 [CONTRIBUTING.md](CONTRIBUTING.md)、[adopters](docs/adopters.md) 和 [GitHub Issues](https://github.com/jununfly/ZAgenticLoop/issues)。

## Sources

- [Attribution & further reading](resources/sources.md)

## License

MIT

---

*一份实用、工具感知的 agentic loop working 参考：可复制的 patterns、可发布前检查的 checklists，以及包含真实故障的 stories。*
