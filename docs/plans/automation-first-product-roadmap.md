<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-22 02:34:37

[~][Y+] 1. Automation-First Product Goal Roadmap
├── [x][Y+] 1-1. Completion Alignment Ledger 与不可补偿完成硬门
│   ├── [x][Y+] 1-1-1. Durable completion-alignment architecture and applicability map
│   ├── [x][Y+] 1-1-2. Route Table completion target schema and generated template
│   ├── [x][Y+] 1-1-3. Core Completion Alignment Ledger derivation API
│   ├── [x][Y+] 1-1-4. Doctor completion ledger JSON text and exit contract
│   └── [x][Y+] 1-1-5. Completion contract parser and compatibility regression tests
├── [x][Y+] 1-2. 当前 Route 能力与用户体验缺口盘点
│   ├── [x][Y+] 1-2-1. Migrate current Route Table rows into explicit completion targets
│   ├── [x][Y+] 1-2-2. Derive initial required-cell capability and evidence gap baseline
│   └── [x][Y+] 1-2-3. Classify current evidence as compatible stale or missing
├── [x][Y+] 1-3. 默认自动执行到 review artifact 或 hard stop
│   ├── [x][Y+] 1-3-1. Automatic-progression transition trace contract
│   ├── [x][Y+] 1-3-2. Workspace Adapter local activation and review artifact runner
│   ├── [x][Y+] 1-3-3. Workspace Adapter local closeout resume and real Git dogfood
│   └── [x][Y+] 1-3-4. Bounded multi-slice continuation to artifact or hard stop
├── [x][Y+] 1-4. 结构化 stop signal 与 human handoff 体验
│   ├── [x][Y+] 1-4-1. Machine-readable human handoff location and confirmation contract
│   ├── [x][Y+] 1-4-2. Low-risk protocol repairs and structured protocol repair request
│   └── [x][Y+] 1-4-3. Ambiguous-handoff and unnecessary-confirmation metrics gate
├── [ ][Y+] 1-5. GitHub 与 GitLab 的 live 能力对齐
│   ├── [x][Y+] 1-5-1. Provider adapter completion evidence mapping
│   ├── [x][Y+] 1-5-2. GitHub required-route live and recovery reference evidence
│   ├── [x][Y+] 1-5-3. GitLab signal and request-carrier live adapter parity
│   ├── [x][Y+] 1-5-4. GitLab branch MR review and closeout live adapter parity
│   └── [ ][Y+] 1-5-5. GitLab required-route reference dogfood
├── [ ][Y+] 1-6. 确定性脚本 gate 与 replay 证据闭环
│   ├── [ ][Y+] 1-6-1. Architecture Integrity deterministic validation gate
│   ├── [ ][Y+] 1-6-2. Evidence compatibility invalidation and stale-status derivation
│   ├── [ ][Y+] 1-6-3. Completion delta CI and release hard gate
│   └── [ ][Y+] 1-6-4. Structured hard-stop and recovery replay corpus
└── [ ][Y+] 1-7. Dogfood 仪表盘与发布前完成判定
    ├── [ ][Y+] 1-7-1. Reference installation fixtures for GitHub GitLab and Workspace
    ├── [ ][Y+] 1-7-2. Doctor completion text renderer and user next actions
    ├── [ ][Y+] 1-7-3. README and capability-claim guard for completion targets
    └── [ ][Y+] 1-7-4. Release candidate complete-matrix audit

### 当前施工：1-5-5-6-1. 跨 producer、carrier、consumer 的端到端副作用完成门禁

已完成 core completion_evidence.v1 schema/validator/CLI，并将 completion_evidence 接入现有 orchestration 的 planned、hard_stopped、executed_to_review_artifact、duplicate、resume 结果；validator 校验完整身份链、外部 provider provenance、review artifact、resume/duplicate 约束与 report-only side_effects_executed=false。core 全量 340 项、新增 completion evidence 9 项与 dispatch 31 项测试通过。待完成：真实 GitHub/GitLab adapter provenance 接线、provider:none replay 与 GitLab report-only dogfood。

**决策：**
- Q: 端到端副作用完成门禁必须覆盖哪些证据？ → A：真实 GitLab + deterministic fixture 的完整正负矩阵 (自动路径必须证明零 provider 写入；Web 手动路径验证固定确认、单 carrier、单 claim、单 bounded repair MR；重复、空 diff、超额度全部 fail-closed。)
- Q: 端到端副作用完成门禁是否开启真实 provider 写入？ → A：只验证 producer → carrier → consumer 的结构化完成证据、身份绑定、失败阻断和 side_effects_executed 语义；保持 Webhook、carrier 自动写入、provider write disabled/unavailable。 (先完成安全协议验证，不重新引入自动写入风险。)
- Q: 端到端完成门禁采用什么状态模型？ → A：复用现有 zj-loop.orchestration，以同一 orchestration_id 贯穿 Signal、Route Decision、Carrier、Consumer、Preflight 与 Reviewable Artifact/Hard Stop；只使用 planned、executed_to_review_artifact、hard_stopped、duplicate、resume。 (不新增第二套状态机，避免 producer、carrier、consumer 状态漂移。)
- Q: 跨 producer、carrier、consumer 的完成证据必须绑定哪些身份？ → A：固定校验 orchestration_id、signal_id、route_id、request_id、carrier_id/issue_iid、consumer_id、current_head_sha，并要求声明 status、review_artifact、stop_reason、side_effects_executed；任一缺失或不一致即 hard_stop。 (防止其他 request、MR 或旧 head 的结果被误认为当前流程成功证据。)
- Q: provider 写入 disabled 时什么才算端到端完成？ → A：仅有 route decision/consumer plan 时为 planned；缺少必要 carrier、身份或 verifier 时为 hard_stopped；只有真正生成声明的 reviewable artifact 才允许 executed_to_review_artifact；所有状态都必须有结构化 evidence 且 side_effects_executed=false。 (不能用 producer、carrier、consumer job 成功冒充业务流程完成。)
- Q: 端到端门禁哪些步骤允许人工介入？ → A：只有真实授权边界允许人工介入，例如开启 provider 写入、确认高风险副作用或处理外部权限；普通 route、preflight、evidence 校验、duplicate/no-op 和 resume 自动完成；每次阻断必须提供 confirmation_location、required_phrase、resume_command、retry_policy、side_effects。 (避免把例行流程拆成多个手工步骤，确保人机交接可恢复。)
- Q: 端到端门禁负向验证覆盖哪些失败类型？ → A：覆盖 orchestration/signal、request/carrier/consumer、current_head_sha 错配或过期，carrier/consumer/verifier/review artifact 缺失，artifact schema 错误，duplicate/no-op，provider 写入 disabled/权限不足，以及上游成功但下游证据缺失；全部返回 hard_stop、结构化 reason、可 replay 且 side_effects_executed=false。 (覆盖历史身份错配与 job 成功但业务结果缺失两类事故。)
- Q: 端到端门禁放在哪里实现？ → A：放入 zj-loop-core 的共享 API/CLI，定义统一 completion evidence schema 与 deterministic validator；GitHub/GitLab CI 只传入平台证据并上传结果，provider adapter 只处理平台读取差异。 (跨 provider 复用一次核心语义，避免多个 route 的 YAML 分叉。)
- Q: 统一 completion evidence 使用什么 schema？ → A：新增 zj-loop.completion_evidence.v1，至少包含 orchestration_id、signal_id、route_id、request_id、carrier、consumer_id、current_head_sha、status、review_artifact、stop_reason、side_effects_executed、evidence_refs、resume_anchor、provenance；由 core 做 schema、身份、状态和副作用语义校验。 (避免不同 route 的完成语义无法统一消费。)
- Q: provider adapter 向统一门禁提供哪些证据？ → A：提供结构化 adapter provenance：provider、project/repository、pipeline/workflow ID 与 URL、job/check ID 与 URL、commit/ref/head SHA、artifact 名称/schema/下载引用、API/infra capability 版本、读取时间与认证来源类型；core 只验证语义和绑定关系，不解析日志文本。 (仅凭 URL 或日志文本不足以证明 artifact、commit 与当前 request 的绑定。)
- Q: 端到端完成门禁的验收测试覆盖什么范围？ → A：覆盖 core schema/validator 单元测试、全部负向矩阵 replay、GitHub adapter contract/parity、GitLab adapter contract/parity、provider:none 本地 replay、GitLab 目标项目一次 report-only dogfood，以及所有失败路径无副作用验证。 (证明共享 core、双 provider adapter 与真实 GitLab evidence 的契约一致。)
<!-- ROADMAP_SECTION_END -->
