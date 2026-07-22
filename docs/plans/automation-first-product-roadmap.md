<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-22 16:53:09

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

### 当前施工：1-5-5-3-4. GitLab bridged Issue Triage event-driven lifecycle dogfood

Deferred from current version. Track GitLab Webhook Issue Triage adaptation in docs/plans/known-gaps.md; no product capability, trusted automation, or live completion claim until the checklist is fully satisfied.

**决策：**
- Q: ai-studio-gitlab 与 ai-studio 的职责边界是什么？ → ai-studio-gitlab 作为独立 GitLab Webhook 验证服务器/容器；ai-studio 作为主要开发、CI consumer、Issue Triage 集成项目。 (Webhook 基础设施与业务/consumer 项目分层；周末只做本地开发，工作日再做真实 provider 验证。)
- Q: 真实 Issue Triage dogfood 的项目绑定是什么？ → Issue Note 来源和目标 pipeline 都绑定 mlive-dev/ai-studio；bridge 服务部署在 mlive-dev/ai-studio-gitlab。 (服务托管项目与业务验证项目分离；bridge 的 project_path、API target 和 trigger token 绑定 ai-studio。)
- Q: GitLab Webhook Issue Triage 适配是否纳入本版本产品计划？ → 不纳入本版本；转移到 docs/plans/known-gaps.md checklist，作为后续版本待完善能力。 (保持本版本知行合一；已有 adapter、部署分支和本地测试只算探索性/基础设施准备，不算产品支持、trusted automation 或 live completion evidence。)
- Q: GitLab Webhook Issue Triage 何时允许重新纳入版本路线图？ → 只有协议、negative/recovery matrix、真实 live evidence、promotion gate 全部完成，并经 Human 明确确认后，才重新纳入。 (known gap 不因核心代码或本地测试完成而提前回流；避免探索性实现被误读为产品结论。)
- Q: 本版本发布时 GitLab Webhook 功能如何处理？ → 正常版本继续发布，但 Webhook 功能保持 disabled/unavailable；不启用 route、secret 或 provider write，其他功能正常。 (Webhook 是明确的 known gap，不影响其他产品功能；未完成 checklist 和 promotion gate 前不得对用户宣称可用。)
- Q: Webhook disabled/unavailable 如何对用户表达？ → 版本能力说明标记 unavailable；误调用 endpoint 返回稳定的 webhook-unavailable 结构化结果，并保证零 provider side effect。 (外部 GitLab 操作方和内部用户得到一致信号；unavailable 不被误判为网络故障或已启用能力。)
- Q: Webhook disabled 时 endpoint 返回什么协议？ → 返回 HTTP 200 和稳定 webhook-unavailable envelope，包含 schema、status、reason=webhook-unavailable、side_effects_executed=false。 (避免 GitLab 重试风暴，同时明确功能未启用；不触发 pipeline 或其他 provider side effect。)
- Q: 当前版本如何技术性保证 Webhook disabled？ → Route Table 将 Webhook route 固定为 enabled=false，运行时默认 disabled；未完成 promotion gate 前不得通过普通环境变量开启。 (disabled 是结构化、可检查、可审计状态；误注入 Secret 或误配置 Webhook 也不能自动启用。)
- Q: 谁能重新开启 disabled Webhook？ → 只有 Human 明确批准的 promotion PR，在 known-gaps checklist 和 promotion gate 完成后修改 Route Table 并开启；Secret 注入本身不能开启。 (防止部署权限或环境变量绕过产品版本 gate；enabled 状态必须由版本化变更和 Human 审核控制。)
- Q: 当前版本如何证明 Webhook disabled？ → CI/doctor 生成结构化 capability artifact，记录 webhook.status=unavailable、enabled=false、provider_writes_allowed=false，并检查运行时配置。 (不可用状态本身必须有可审计证据，防止被误判为漏测或已启用。)
- Q: disabled capability artifact 是否当前版本实现？ → 当前版本实现只读的 disabled capability check/artifact；不实现 Webhook trigger、Issue Triage write 或线上 bridge。 (用零 provider side effect 的可验证能力保证 unavailable 不是口头声明，同时不把 Webhook 适配带回本版本。)
- Q: disabled capability artifact 由什么机制生成？ → 复用现有 doctor/ledger，增加 GitLab Webhook capability 行，记录 unavailable、enabled=false、provider_writes_allowed=false。 (所有 agent 使用同一份 capability 状态；不新增 Webhook 专用状态系统。)
- Q: doctor/ledger 如何区分不可用与延期？ → 使用两个固定维度：status=unavailable、planning_status=deferred、enabled=false、provider_writes_allowed=false；status 与 planning_status 均由固定 enum 和 Route Table 校验。 (运行能力与版本计划状态严格分层，禁止用 incomplete 或平均评分替代。)
- Q: Webhook capability 与计划状态使用哪些固定 enum？ → status 固定为 available|unavailable|blocked|unknown；planning_status 固定为 in_scope|deferred|completed|superseded。当前为 status=unavailable、planning_status=deferred。 (两个维度均由 Route Table 校验；禁止用 incomplete 或自由文本替代。)
- Q: deferred unavailable Webhook 是否阻塞其他产品发布？ → 只阻塞 GitLab Webhook capability 和对应路线图节点；不阻塞其他产品功能发布，但整体版本状态必须显示 deferred known gap，不能宣称全能力完成。 (保持正常产品发布与诚实能力声明并存；不做整体平均评分或静默忽略。)
- Q: 当前版本收到 Webhook 请求时 agent 如何处理？ → 返回 status=unavailable、planning_status=deferred、side_effects_executed=false 的结构化 hard stop，引用 docs/plans/known-gaps.md；不调用 GitLab API，也不自动降级为其他写入路径。 (所有 agent 对 deferred capability 保持一致行为，避免把不可用能力转换成未授权的自动副作用。)
- Q: 当前版本对外如何声明 GitLab Webhook？ → 声明 GitLab Webhook Issue Triage 暂不可用（deferred）；本版本不启用该能力，也不产生 GitLab provider write；其他产品功能正常，不承诺具体上线日期。 (能力声明必须与实现状态一致，避免 beta 或隐含可用性承诺。)
- Q: Webhook unavailable 状态是否影响其他 capability？ → Webhook 只作为独立 route-specific ledger cell，status=unavailable、planning_status=deferred；只阻塞自身 route，不污染其他 capability 状态。 (doctor/ledger 严格按 route 计算，整体版本可显示 known gap，但其他功能正常发布。)
- Q: Webhook ledger cell 使用什么 route identity？ → 独立使用 gitlab-issue-note-bridge；issue-triage、issue-triage-action、issue-triage-transition 分别记录，bridge transport 不等于 Issue Triage capability。 (严格区分接入层、consumer 层和 provider write 层，避免 route 语义混淆。)
- Q: 当前版本 Route Table 是否保留 Webhook route？ → 保留完整 gitlab-issue-note-bridge route 条目，但固定 enabled=false、status=unavailable、planning_status=deferred，并声明 capabilities/verifiers 供 doctor/ledger 检查。 (系统可见且明确知道该能力；禁用状态不能被误读为未设计或可用。)
- Q: Webhook route 的 capabilities/verifiers 如何表达？ → 分成 declared_capabilities、verified_capabilities、verifiers；当前 declared_capabilities 可列未来范围，verified_capabilities 为空，verifiers 只验证 route-table、disabled-state、zero-side-effect。 (声明未来范围不等于完成证据；当前 route 明确不可用且零 provider side effect。)
- Q: Webhook bridge declared capabilities 覆盖到哪一层？ → 只声明 webhook-envelope-validation、receipt-dedupe、fixed-api-trigger；Issue Triage 分析、transition 和 provider write 由独立 route 声明。 (Bridge、consumer、provider write 三层保持独立，避免接入能力被误读为业务自动化能力。)
- Q: disabled capability artifact 使用什么 schema？ → 采用统一 envelope zj-loop.capability.v1 与 route-specific artifact zj-loop.gitlab_issue_note_bridge_capability.v1；route artifact 包含 status、planning_status、enabled、provider_writes_allowed、declared/verified capabilities 和 verifiers。 (doctor/ledger 统一消费，bridge route 保持独立语义。)
- Q: doctor/ledger 遇到 deferred Webhook 时如何影响退出码？ → 默认生成完整 artifact 并成功结束，但明确记录 route deferred；仅 --require-complete 等严格模式因 route 未完成而失败。 (正常发布不被该缺口阻塞，严格模式仍防止版本被误报为全能力完成。)
- Q: Webhook capability artifact 记录哪些绑定信息？ → 记录 provider=gitlab、project_path=mlive-dev/ai-studio、route_id=gitlab-issue-note-bridge、status=unavailable、planning_status=deferred、enabled=false、provider_writes_allowed=false；可记录 auth_source 名称，不记录 Secret、Token 或完整 payload。 (证明项目与 route 绑定且不泄露凭证；部署实验不被误当 live evidence。)
- Q: disabled capability check 覆盖哪些验证场景？ → 本地覆盖正常 disabled 配置、Route 缺失或 enum 非法、普通环境变量越权开启、所有场景 provider_writes_allowed=false；使用 fixture，不访问 GitLab。 (证明默认不可用、配置错误 fail-closed，周末不引入 provider side effect。)
- Q: disabled capability artifact 如何保存？ → 由 doctor/CI 每次动态生成并保存为 artifact/ledger 运行证据，不提交生成快照；Route Table 和 known-gaps 作为源配置。 (避免状态快照过期，同时保留每次运行的可审计证据。)
- Q: disabled capability artifact 保留多久？ → 默认保留 90 天，覆盖一个完整版本周期；只保留脱敏 capability 状态，不保存 Secret、Token 或完整 payload。 (支持版本回顾和 known-gap 审计，避免无限累积运行数据。)
- Q: 重新开启 GitLab Webhook 的第一步是什么？ → A：先提交 Webhook re-enable readiness PR，补齐版本、owner、项目绑定、Secret 分离、固定 endpoint/ref 与 health check；保持 enabled=false (当前没有可用 ai-studio-gitlab deployment；准备 PR 不产生 GitLab provider side effect，待 Human review 后再部署与 promotion。)
- Q: GitLab Webhook live fixture 使用哪个项目边界？ → A：只在 mlive-dev/ai-studio-gitlab 内网测试 fork 与其 bridge deployment 上验证；mlive-dev/ai-studio 生产项目不创建 fixture、不配置 Webhook、不触发 API pipeline (ai-studio 有真实用户，必须保持生产隔离；生产项目只作为后续受控安装目标，不能作为开发验证环境。)
- Q: 测试 fork 的 HTTPS bridge 如何承载？ → A：复用内网现有 Ingress，分配固定私有 DNS 与 TLS (不新增公网服务；Ingress 只暴露固定 /gitlab/webhook/issue-note 与 /healthz，目标为 ai-studio-gitlab 测试 fork。)
<!-- ROADMAP_SECTION_END -->
