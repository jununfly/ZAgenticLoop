<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `value-oriented-product-upgrade-roadmap.json` | 最后更新: 2026-07-13 22:38:28

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
│   ├── [~][Y+] 1-4-5. GitHub 与 GitLab Provider Parity
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

### 当前施工：1-4-5. GitHub 与 GitLab Provider Parity

Provider parity is the next execution focus. Goal: align GitLab support to the current GitHub route baseline, keep route protocols platform-neutral, and make any remaining provider-specific gaps explicit through deterministic gates and durable docs.

**决策：**
- Q: 是否先做 GitHub 与 GitLab Provider Parity，再做 Changelog Drafter 自动 Draft Artifact / Draft PR-MR？ → 是。 (Provider Parity 是 1-4-6 的地基；先对齐 GitHub baseline 与 GitLab 全 route 能力，避免 Changelog Drafter 自动 draft 先做成 GitHub-only 路径后再补 GitLab，造成长期割裂。)
- Q: 1-4-5 的成功标准是否定义为每个 GitHub route family 都有 GitLab 模板 + provider-aware runner/dry-run/live refusal 或 live evidence + deterministic gate 覆盖，而不是要求每条 route 都已 GitLab live 执行？ → 要。 (每条 route 必须有明确 provider parity 状态：live-supported、dry-run-supported、explicitly-refused-with-reason 或 blocked-with-follow-up。这样避免一次性打开高风险 GitLab live side effects，同时不能只靠 prose 声称未来支持。)
- Q: Provider parity 状态矩阵是否放进 Route Table 模板作为每条 route 的结构化字段，并由 validate-provider-parity-gate 检查？ → 要。 (Route Table 是每条 route 的执行、授权、成熟度真相源；provider_support 也应成为可检查事实，避免只放 docs 导致 Agent 忽略，或放 registry 造成 route 运行能力割裂。)
- Q: provider_support 是否必须进入 RouteStatus / zj-loop-route status --json 输出，而不是只让 provider parity gate 私下读取 YAML？ → 必须进入。 (Provider parity 是 Agent 判断某 route 在 GitHub/GitLab 上应 live、dry-run、显式拒绝还是 blocked 的运行时事实。status --json 必须暴露它；但它只表达 provider 能力状态，不等同于 route enablement，也不授权 live side effects。)
- Q: provider_support.<provider>.status 枚举是否固定为 live-supported、dry-run-supported、explicitly-refused-with-reason、blocked-with-follow-up，且不允许 unknown？ → 同意。 (该字段用于消灭 unknown。缺字段或非法值应让 provider parity gate fail。live-supported 仍不授权执行；dry-run-supported 表示 provider-aware plan/evidence 可生成；explicitly-refused-with-reason 必须带拒绝理由；blocked-with-follow-up 必须带 follow-up/blocker。)
- Q: provider_support 每个 provider 的最小结构是否固定为 status + evidence[]，并按状态要求额外字段？ → 同意。 (live-supported 必须有 live/dogfood/runner evidence；dry-run-supported 必须有 template/test/artifact/replay evidence；explicitly-refused-with-reason 必须有 reason 和 evidence[]；blocked-with-follow-up 必须有 blocker 和 follow_up，evidence[] 可为空但建议有。)
- Q: provider_support.*.evidence[] 是否只允许固定前缀，避免自由散文？ → 同意。 (先允许 template:、workflow:、gitlab-ci:、test:、replay:、artifact:、dogfood-run:、runner:、docs:、issue:、follow-up:。第一层 gate 检查前缀合法；后续 hardening 再验证本地文件存在或远端 run 可访问。)
- Q: provider_support 是否第一阶段不直接参与 automation_model.authorization.execution_allowed，只进入 provider_context；未来显式 target_provider 时再参与该次执行的 blocked reason？ → 同意。 (Route-level authorization 继续只看 route enablement + maturity，避免 GitLab dry-run/blocked 状态误伤 GitHub ready 能力。provider_support 暴露为 provider_context；显式 --provider gitlab/github 的执行路径再把 provider status 纳入 blocked reason。)

**当前子树：**
├── [x][Y+] 1-4-5-1. Provider Parity Gap Inventory
├── [x][Y+] 1-4-5-2. GitLab Generated CI Scaffold Parity
├── [x][Y+] 1-4-5-3. Provider Adapter API Helpers
├── [ ][Y+] 1-4-5-4. Route Family Provider Parity Evidence
└── [ ][Y+] 1-4-5-5. Provider Parity Release Gates And Docs
<!-- ROADMAP_SECTION_END -->
