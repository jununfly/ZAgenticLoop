<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `value-oriented-product-upgrade-roadmap.json` | 最后更新: 2026-07-13 19:46:55

[~][X+] 1. Value-Oriented Product Upgrade Full Map
├── [x][Y+] 1-1. 用户目标导向的自动 Loop 入口
│   ├── [x][X+] 1-1-1. 目标型命令与用户故事入口
│   ├── [x][X+] 1-1-2. 首次运行到下一次运行的连续体验
│   ├── [x][X+] 1-1-3. 自动继续与停止提示的用户界面
│   └── [x][X+] 1-1-4. 用户故事式帮助文档与示例项目
├── [x][Y+] 1-2. Route Readiness 与自动化授权模型
│   ├── [x][Y+] 1-2-1. Readiness 语义收敛与升级路径
│   ├── [x][Y+] 1-2-2. Route Table 自动化意图与执行授权拆分
│   ├── [x][Y+] 1-2-3. Route 状态菜单、评分与推荐算法
│   └── [x][Y+] 1-2-4. 启用、禁用、提升成熟度的确定性命令
├── [x][Y+] 1-3. Signal 到 Review Artifact 的自动编排
│   ├── [x][Y+] 1-3-1. Signal Envelope Schema 与 Validator
│   ├── [x][Y+] 1-3-2. Orchestration Envelope 持久化与 Duplicate Resume
│   ├── [x][Y+] 1-3-3. zj-loop-dispatch CLI 与 auto plan execute resume 模式
│   ├── [x][Y+] 1-3-4. Source Carrier 复用与 Request Comment Plan
│   ├── [x][Y+] 1-3-5. Issue Backlog Triage 到 Issue Triage Transition Tracer
│   ├── [x][Y+] 1-3-6. Roadmap Sliced Development Activation Tracer
│   └── [x][Y+] 1-3-7. Review Artifact 与 Hard Stop 输出文档
├── [~][X+] 1-4. Consumer Runner 全链路执行能力
│   ├── [x][Y+] 1-4-1. Roadmap Activation ConsumerAdapter 全链路执行能力
│   ├── [x][Y+] 1-4-2. Issue Backlog Triage 到 Transition 的自动链路
│   ├── [x][Y+] 1-4-3. CI、Dependency、PR Steward Fix Runner 提升
│   ├── [~][Y+] 1-4-4. Changelog Drafter 与 Release Draft Consumer 提升
│   ├── [ ][X+] 1-4-5. GitHub 与 GitLab Provider Parity
│   └── [ ][X+] 1-4-6. Changelog Drafter 自动产出 Draft Artifact 与 Draft PR
├── [ ][X+] 1-5. 前提条件、安全与成本包络
│   ├── [ ][X+] 1-5-1. 权限、凭证与 Actor 能力探测
│   ├── [ ][X+] 1-5-2. 低摩擦预算模型与 max work units
│   ├── [ ][X+] 1-5-3. 工作区安全、风险分级与硬停机
│   ├── [ ][X+] 1-5-4. Loop Prevention 与重复请求治理
│   └── [ ][X+] 1-5-5. 高风险 Human Gate 最小化策略
├── [ ][X+] 1-6. 证据回放、状态解释与故障定位
│   ├── [ ][X+] 1-6-1. 统一 Run Summary 与 Evidence Index
│   ├── [ ][X+] 1-6-2. Stop Signal 分类、定位与恢复建议
│   ├── [ ][X+] 1-6-3. 跨 Provider 回放与 Debug CLI
│   └── [ ][X+] 1-6-4. 运行历史、状态看板与用户心智
├── [ ][X+] 1-7. 用户项目安装、升级与启用体验
│   ├── [ ][X+] 1-7-1. Install Wizard 与 First-Run Guided Setup
│   ├── [ ][X+] 1-7-2. Upgrade 保留用户意图与配置漂移治理
│   ├── [ ][X+] 1-7-3. Route Bundle 选择、启用与回滚命令
│   └── [ ][X+] 1-7-4. README、Quickstart 与场景化教程重构
├── [ ][X+] 1-8. Dogfood 验证、发布门槛与能力分级
│   ├── [ ][X+] 1-8-1. 本仓 Dogfood Matrix 与 Route 能力台账
│   ├── [ ][X+] 1-8-2. 每条 Route 的 E2E Replay 与 Live Evidence
│   ├── [ ][X+] 1-8-3. 发布前 Gate、版本策略与回归套件
│   └── [ ][X+] 1-8-4. 能力分级晋升到 execution-ready 的证据审计
├── [x][Y+] 1-9. Codex + ZAgenticLoop Harness 首条完整产品体验路径
│   ├── [x][Y+] 1-9-1. Codex Harness 边界与职责定义
│   ├── [x][Y+] 1-9-2. Codex 会话到 Loop Runtime 的入口编排
│   ├── [x][Y+] 1-9-3. Codex 中的自动继续、暂停与恢复体验
│   ├── [x][Y+] 1-9-4. Codex 可读的 Evidence、Stop Signal 与 Next Action 输出
│   ├── [x][Y+] 1-9-5. Codex Dogfood 到用户项目复制路径
│   ├── [x][Y+] 1-9-6. 无 GitHub/GitLab 依赖的 Codex-Centered Loop 路径
│   └── [x][Y+] 1-9-7. Codex Harness 全局结构化 Input/Output 协议
└── [x][Y+] 1-10. Codex Harness 执行切片与交付顺序
    ├── [x][Y+] 1-10-1. Core 协议 Schema 与 Validator
    ├── [x][Y+] 1-10-2. Core 协议 Renderer 与 CLI/API 入口
    ├── [x][Y+] 1-10-3. Core Run Metrics Recorder
    ├── [x][Y+] 1-10-4. GitHub Issue 到 PR Closeout 的 Harness Dogfood
    ├── [x][Y+] 1-10-5. No-Provider Codex-Centered 协议等价物
    ├── [x][Y+] 1-10-6. Codex Harness 用户故事与帮助示例
    └── [x][Y+] 1-10-7. 发布前 Gate 与回归证据

### 当前施工：1-4-4-2. Changelog Drafter Workflow-Dispatch Live Evidence

Implementation updated: Changelog Drafter now has a guarded live-draft CLI, workflow_dispatch inputs for confirm_live_draft/core_package, artifact upload with if: always(), safe summary cat guards, and runner evidence emits final_changelog_acceptance=false. Promotion gate now only misses real workflow-dispatch dogfood evidence, which requires this workflow change to exist on a remote branch/PR before it can be run truthfully.

**决策：**
- Q: Changelog Drafter workflow-dispatch live evidence 的最小成功形态是否接受 draft-evidence，而不强制 draft-pr？ → 接受 draft-evidence，不强制必须 draft-pr。 (目标是证明 runner 能通过 workflow-dispatch 安全地产生 reviewable draft outcome；draft-evidence 副作用更小但能覆盖固定确认短语、request carrier、runner lifecycle、artifact upload、side-effect boundary。draft-pr 是更强证据但不是硬要求；promotion 不应只依赖 escalation-issue。)
- Q: Changelog Drafter workflow-dispatch dogfood 是否支持 core_package=./tools/zj-loop-core 本地包覆盖？ → 要。默认仍用发布包版本，dogfood 时允许显式传 core_package=./tools/zj-loop-core。 (本地包覆盖用于验证当前分支尚未发布的 core 改动；workflow 需要在本地包模式下先 npm install --prefix ./tools/zj-loop-core，并且 artifact upload 使用 if: always()，避免失败时丢证据。)
- Q: Changelog Drafter live evidence 是否必须证明不触碰发布侧副作用？ → 必须。 (side-effect-boundary gate 必须证明 draft consumer 只生成可审查草稿，不完成发布。live result / state 应显式记录 tag_created=false、release_created=false、package_published=false、final_changelog_acceptance=false；最好由 runner result 结构化输出，并由 promotion gate 检查。)
- Q: 是否把 final_changelog_acceptance=false 补进 Changelog Drafter runner result / tests / promotion gate 识别？ → 要。 (该字段作为 side-effect-boundary 的硬字段，明确 draft-evidence / draft-pr 只是可审查草稿，不代表最终 changelog 已接受；runner result、测试和 promotion gate 都应覆盖。)
- Q: 是否把 Changelog Drafter workflow-dispatch 从 draft-plan 升级到 guarded live draft evidence 主路径？ → 同意。 (新增 confirm_live_draft input，固定短语 CREATE_CHANGELOG_DRAFT_PR_OR_EVIDENCE，默认 draft_mode=evidence；dogfood 主路径生成 draft-evidence artifact，不强制 draft-pr；支持 core_package=./tools/zj-loop-core；artifact upload 必须 if: always()，workflow summary 只在文件存在时 cat。)
<!-- ROADMAP_SECTION_END -->
