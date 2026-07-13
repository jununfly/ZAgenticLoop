<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `value-oriented-product-upgrade-roadmap.json` | 最后更新: 2026-07-14 00:14:21

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
│   ├── [x][Y+] 1-4-4. Changelog Drafter 与 Release Draft Consumer 提升
│   ├── [x][Y+] 1-4-5. GitHub 与 GitLab Provider Parity
│   └── [~][Y+] 1-4-6. Changelog Drafter 自动产出 Draft Artifact 与 Draft PR
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

### 当前施工：1-4-6. Changelog Drafter 自动产出 Draft Artifact 与 Draft PR

**决策：**
- Q: 1-4-6 的范围是重造 runner 还是补齐自动触发/编排链路？ → 补齐自动触发/编排链路，不重造 Changelog Drafter runner。现有 runner 已支持 guarded draft-evidence / draft-pr、固定确认短语、GitHub workflow、draft request replay 和 live runner 测试。 (目标链路收敛为 release-window signal -> Route Decision -> changelog-drafter-draft-request -> guarded live draft artifact / draft PR -> review artifact；GitLab live draft MR 继续明确拒绝，后续单独节点再提升。)
- Q: Changelog Drafter 的自动产出默认生成 draft-evidence 还是 draft-pr？ → 默认生成 draft-evidence，允许显式升级到 draft-pr。 (默认路径以低风险 review artifact 为主；draft-pr 需要通过固定确认短语或 workflow input 显式选择 draft_mode=pr，避免 release/changelog 语义被过早写入 PR。)
- Q: Changelog Drafter 的自动触发来源是只允许 workflow_dispatch，还是允许 release-window signal 自动进入？ → 两者都支持；主路径是 release-window signal 自动进入 Route Decision，workflow_dispatch 保留为手动 replay、dogfood、修复入口。 (Route Decision 只生成 changelog-drafter-draft-request，不直接写 changelog、不创建 PR、不发布；副作用仍由 guarded runner 执行。)
- Q: Changelog Drafter runner 是否必须只消费 changelog-drafter-draft-request？ → 必须。Runner 只消费 changelog-drafter-draft-request，不能直接消费 changelog-drafter-report 或 release-window signal。 (固定链路为 release-window signal -> Route Decision -> changelog-drafter-draft-request -> Changelog Drafter runner；report 只负责观察和记录，draft-request 才是进入副作用边界的 activation carrier。)
- Q: Changelog Drafter 自动产出的结果证据主 truth 放在哪里？ → 两层都要，但主 truth 放 orchestration review artifact；zj-loop/changelog-drafter-state.md 只保存低成本状态摘要和可回放索引。 (draft evidence / draft PR 是一次执行的 reviewable outcome，应绑定本次 orchestration；state 文件用于 dedupe、resume、历史索引，不承载完整结果。)
- Q: Changelog Drafter 自动产出失败后是否自动重试？ → 不自动重试；生成 structured hard stop / escalation evidence。 (同一个 draft request 失败后停在可回放证据上，避免 release/changelog 链路循环；需要 retry 时创建新的 draft request，或由 human/automation 显式 resume。)
- Q: 1-4-6 应拆成哪些可执行 slices？ → 拆成三片：1) Changelog Drafter ConsumerAdapter Review Artifact；2) Changelog Drafter Workflow Auto Draft Evidence；3) Changelog Drafter Docs And Release Gate Alignment。 (代码探索显示 runner 已存在，但 ConsumerAdapter 只注册 roadmap activation；GitHub workflow 只有输入 draft request 时才 live-draft，tag push 仍主要是 report。优先补 orchestration review artifact 主路径，再接 workflow 自动 draft evidence，最后更新 docs/gate。)

**当前子树：**
├── [x][Y+] 1-4-6-1. Changelog Drafter ConsumerAdapter Review Artifact
├── [x][Y+] 1-4-6-2. Changelog Drafter Workflow Auto Draft Evidence
└── [ ][Y+] 1-4-6-3. Changelog Drafter Docs And Release Gate Alignment
<!-- ROADMAP_SECTION_END -->
