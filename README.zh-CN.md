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
| 初始化 route table、loop state 和 skills | `npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok` |
| 添加 GitHub Actions smoke/consumer workflows | `npx @jununfly/zj-loop-init . --add github-actions` |
| 在调度前估算 token 开销 | `npx @jununfly/zj-loop-cost --pattern daily-triage --level L1 --cadence 1d` |
| 审计有明确终止条件的 goal readiness | `npx @jununfly/zj-goal-audit . --suggest` |
| 通过 MCP 集成 loop knowledge | [zj-loop-mcp-server](tools/zj-loop-mcp-server/) |
| 把 PRD/plan issue 转成 roadmap run | 由 maintainer/collaborator 评论 `/zj-loop start roadmap-sliced-development` |

## 产品体验地图

最短心智模型：**Pattern -> Starter -> Route Table -> Memory -> Verifier -> Story**。

- **User story：** 从 ad-hoc prompting 走向可重复的 Agentic Loop Working，同时保留人的判断权。
- **Backbone：** 选择 Pattern，初始化 Starter，把 routing policy 放在 `zj-loop/zj-loop-route-table.yaml`，把 Memory 保存在 state/run log 中，加入 verifier 分离，并用 Human Gate 管住高风险边界。
- **采用路径：** 用 Daily Triage 跑 Quickstart，先 L1 report-only，再审计 readiness、估算成本；只有在看见真实 Loop Activity 后，才逐步走向 L2/L3。
- **证据来源：** pattern catalog 由 [registry metadata](patterns/registry.yaml)、[production stories](stories/) 和完整的 [产品体验报告](https://jununfly.github.io/ZAgenticLoop/product-experience-report.zh-CN.html) 支撑。

## Dogfood Reference

本仓库本身就是 Agentic Loop Working 的 live dogfood case。它会用自己的 patterns 和工具持续运行 audit、validation、daily triage、changelog drafting、release workflow checks 和 drift detection。

参考案例说明了配置来源、state files、workflow flow、gates 和当前自动化边界：[Dogfood reference case](docs/designs/dogfood-reference-case.md)。

## 安装与运行

直接使用公开 npm packages：

```bash
# 在你的 repo 中初始化 starter
npx @jununfly/zj-loop-init . --pattern daily-triage --tool grok

# 在调度前估算运行成本
npx @jununfly/zj-loop-cost --pattern daily-triage --level L1 --cadence 1d

# 审计 loop readiness 并获得具体下一步
npx @jununfly/zj-loop-audit . --suggest

# 可选：安装 workflow-dispatch bundle
npx @jununfly/zj-loop-init . --add github-actions

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

如果 `npx` 在解析包时长时间无输出，可以使用已安装的可执行命令
（`zj-loop-init`、`zj-loop-audit`、`zj-loop-cost`），或直接复用 npm 本地缓存：

```bash
npm exec --offline --package=@jununfly/zj-loop-init -- zj-loop-init . --pattern daily-triage --tool grok
```

更多 fallback 路径见 [Quickstart](docs/QUICKSTART.md#if-npx-stalls-or-you-are-offline)。

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
/loop 1d Run zj-loop-triage. Update zj-loop/STATE.md. No auto-fix in week one.
```

4. 阅读 `zj-loop/STATE.md`，修正任何错误，然后提交 starter 和第一次 state update。

分阶段推出：**L1 report -> L2 assisted fixes -> L3 unattended**。不要因为 loop 已经自动化，就跳过人的阅读步骤。

## GitHub Actions Bundle

当你希望在 repo 中加入可手动触发的 smoke path 和由 Route Table 控制的
consumer workflows 时，安装生成式 workflow-dispatch bundle：

```bash
npx @jununfly/zj-loop-init . --add github-actions
```

生成的 `zj-loop-*.yml` workflows 会带上固定 package version 和 generated
metadata。默认只有 `manual-smoke-report` 是安全主路径。把 Route Table status
当成可选链路菜单使用；它会显示每条 route 的 mode、runner maturity、
readiness 和需要的固定确认短语。`dogfooded-live` 表示 reference repo 已有
证据，`user-project-ready` 才表示 generated bundle 能在用户项目中调用已发布
package runner。有副作用的 consumer 仍然需要显式通过 Route Table 启用：

```bash
npx --yes --package @jununfly/zj-loop-core@0.1.2 zj-loop-route status
npx --yes --package @jununfly/zj-loop-core@0.1.2 zj-loop-route enable ci-sweeper --confirm "enable ci-sweeper side effects"
npx --yes --package @jununfly/zj-loop-core@0.1.2 zj-loop-route disable ci-sweeper
```

用户项目的第一条启用链路应按 route readiness 自选，而不是按安装顺序固定。
Report-only routes 有意保持只记录 evidence；`ci-sweeper`、
`roadmap-sliced-development`、`pr-steward-fix-request`、
`dependency-sweeper`、`changelog-drafter-draft-request`、
`issue-triage-action`、`post-merge-roadmap-closeout` 等 action-capable routes
只有在 generated workflow 和 packaged runner 都标记为 `user-project-ready`
后，才应被当作用户项目 live path。

Generated workflows 在任何 runner 副作用前，都应该调用发布包里的 consumer
gate：

```bash
npx --yes --package @jununfly/zj-loop-core zj-loop-consumer plan <route-id> --json
```

这个 plan 会阻止 disabled route、无效 execution contract，以及只有 dogfood
证据但尚未 `user-project-ready` 的 route。

先手动运行 `ZJ Loop Smoke` workflow，再执行审计：

```bash
npx @jununfly/zj-loop-audit . --suggest
```

升级官方生成的 workflows：

```bash
npx @jununfly/zj-loop-init . --upgrade github-actions
```

如果生成的 workflow 被本地修改过，upgrade 会把旧文件改名为 `.bak` 后缀，
并在原路径写入新的 canonical 文件。提交前 review 两份文件；深度迁移本地
workflow 自定义逻辑仍然是 maintainer 决策。

当前 dogfood 自动化边界：

| Consumer route | 当前模式 | 今天能做什么 |
|----------------|----------|--------------|
| `ci-sweeper` | `live` | 为窄范围 validate/audit failure 创建 verifier-backed repair PR 或 escalation evidence。 |
| `roadmap-sliced-development` | `live` | 消费授权 activation comment，并启动有边界的 roadmap branch/PR 生命周期。 |
| `post-merge-roadmap-closeout` | `dry-run` | 在 Roadmap-Sliced PR 合并后规划 branch/issue cleanup；live cleanup 需要显式 operator confirmation。 |
| `dependency-sweeper` | `claim-only` with replayed runner | Claim 合格 dependency fix request，并 replay repair/escalation evidence；还不会 live 修改 manifest 或创建 PR。 |
| `pr-steward-fix-request` | `claim-only` with replayed runner | Claim 合格 failed-PR-check request，并 replay repair/escalation evidence；不修改 source PR。 |
| `changelog-drafter-draft-request` | `report-only` with replayed runner | 记录 draft request evidence，并 replay draft evidence/PR outcome；还不会 live 修改 changelog。 |
| `issue-triage-action` | `dry-run` with replayed runner | 规划 allowlisted label 或 fixed comment template；还不会 live 修改 issue。 |
| Report routes | `report-only` | 只记录 evidence。 |

## Tool Packages

| Package | CLI | 用途 | 当前版本 |
|---------|-----|------|----------|
| `@jununfly/zj-loop-core` | library | 共享 registry、project evidence、semantic queries 和 CLI harness | `0.1.2` |
| `@jununfly/zj-loop-init` | `zj-loop-init` | 初始化 starters、route table、state files、budget 和 run logs | `0.1.6` |
| `@jununfly/zj-loop-audit` | `zj-loop-audit` | Loop Readiness Score 和建议 | `0.1.3` |
| `@jununfly/zj-loop-cost` | `zj-loop-cost` | 按 pattern、level、cadence 估算 token 开销 | `0.1.4` |
| `@jununfly/zj-loop-sync` | `zj-loop-sync` | 检查 loop state 与 config 之间的漂移 | `0.1.2` |
| `@jununfly/zj-loop-mcp-server` | `zj-loop-mcp-server` | 只读 MCP 访问 patterns、skills、route table、state 和 safety docs | `0.1.3` |
| `@jununfly/zj-goal-audit` | `zj-goal-audit` | 面向 bounded run-until-done work 的 Goal Readiness Score | `0.1.1` |

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
| [PR Steward](patterns/pr-steward.md) | 5-15m | [pr-steward](starters/pr-steward/) | L1 watch | High |
| [CI Sweeper](patterns/ci-sweeper.md) | 5-15m | [ci-sweeper](starters/ci-sweeper/) | L2 cautious | Very high |
| [Dependency Sweeper](patterns/dependency-sweeper.md) | 6h-1d | [dependency-sweeper](starters/dependency-sweeper/) | L2 patch-only | Medium |
| [Changelog Drafter](patterns/changelog-drafter.md) | 1d or tag | [changelog-drafter](starters/changelog-drafter/) | L1 draft | Low |
| [Post-Merge Cleanup](patterns/post-merge-cleanup.md) | 1d-6h | [post-merge-cleanup](starters/post-merge-cleanup/) | L1 off-peak | Low |
| [Issue Triage](patterns/issue-triage.md) | 2h-1d | [issue-triage](starters/issue-triage/) | L1 propose-only | Low |
| [Roadmap-Sliced Development](patterns/roadmap-sliced-development.md) | 1d | [roadmap-sliced-development](starters/roadmap-sliced-development/) | L2 guided | Medium |

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
- [Safety](zj-loop/zj-loop-safety.md) — denylist、auto-merge、MCP scopes
- [Route Table Architecture](docs/designs/route-table-architecture.md) — loop signals 的全局 routing control plane
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
