<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `value-oriented-product-upgrade-roadmap.json` | 最后更新: 2026-07-13 15:51:11

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
│   ├── [~][X+] 1-4-3. CI、Dependency、PR Steward Fix Runner 提升
│   ├── [ ][X+] 1-4-4. Changelog Drafter 与 Release Draft Consumer 提升
│   └── [ ][X+] 1-4-5. GitHub 与 GitLab Provider Parity
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

### 当前施工：1-4-3-2. Dependency Sweeper Workflow-Dispatch Live Evidence

Added guarded Dependency Sweeper workflow-dispatch live-repair path but did not mark route execution-ready. Core CLI exposes zj-loop-dependency-sweeper live-repair; generated GitHub Actions/template accept confirm_live_repair and upload live-repair-result evidence. Dogfood run https://github.com/jununfly/ZAgenticLoop/actions/runs/29233185628 exposed that pinned npm package 0.1.6 cannot exercise unreleased live-repair, so the workflow now has a core_package input: default published pin for user projects, explicit ./tools/zj-loop-core override for unreleased repo dogfood. Real workflow-dispatch dogfood evidence is still required before live/execution-ready promotion. Verification: cd tools/zj-loop-core && npm test; cd tools/zj-loop-init && npm test; npm run test:generated-bundle-release-gate.

**决策：**
- Q: 未发布的 Dependency Sweeper live-repair 如何做 workflow-dispatch dogfood？ → 给 Dependency Sweeper workflow 增加 core_package 输入，默认保持发布包 pin；本仓未发布 dogfood 显式传 ./tools/zj-loop-core 使用当前 checkout dist。 (避免为了验证未发布功能而提前发版；用户项目默认路径仍使用发布包，dogfood 路径必须显式覆盖。)
<!-- ROADMAP_SECTION_END -->
