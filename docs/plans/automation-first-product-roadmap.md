<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-20 15:49:35

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

### 当前施工：1-5-5-4-1. GitLab scheduled Issue Backlog report evidence

**决策：**
- Q: Issue Backlog scheduled evidence 首先使用哪个 schedule？ → 先只读检查并复用既有 GitLab schedule 957；只有 project、route、cron、ref、job、artifact path/schema fingerprint 全部匹配时才等待/验证真实 source=schedule pipeline。 (health check 不修改 schedule、不自动 play/enable、不使用 Web/API/manual pipeline 冒充 scheduled evidence；fingerprint 不匹配时输出 hard stop。)
- Q: schedule-health 只读检查在哪里执行？ → 在 mlive-dev/ai-studio 通过 GitLab 手动诊断 job 调用 zj-loop-doctor --provider gitlab --schedule-health；该 job 只读检查配置与执行窗口，不计为 source=schedule positive evidence。 (GITLAB_TOKEN 仅由 CI Secret 注入；doctor 不启用、play、修改或恢复 schedule；真实 positive 必须来自 schedule 957 自身。)
- Q: schedule-health configuration_missing 应如何处理？ → 先核验 mlive-dev/ai-studio 中 schedule 957 的实际存在性、active 状态和可读权限；若不存在或 ID 已变化，使用当前有效 schedule IID 重跑。 (configuration_missing/gitlab-api-unavailable 只表示 provider 查询层未完成，不计入 scheduled positive 或 negative evidence；不以 manual/API pipeline 替代 source=schedule。)
- Q: 只有 schedule 961 时如何继续？ → 先核验 schedule 961 的 route/job/ref/artifact/schema fingerprint；全部匹配 issue-backlog-triage 后才将 health-check schedule ID 从 957 替换为 961。 (schedule 961 若仍是 schedule-probe，只能保留为 probe evidence，不能用于 Issue Backlog scheduled completion；不匹配时不运行伪 positive。)
- Q: schedule 961 health-check 结果如何解释？ → 配置层通过，schedule 961 active 且 route/job/artifact/schema binding 正确；当前 status=not_due，等待下一次真实 source=schedule 执行窗口后再检查 positive artifact。 (health-check artifact 26044534 只证明配置与窗口诊断成功，不算 scheduled positive；不提前标记子节点完成。)
- Q: schedule 961 更新后旧 scheduled pipeline 是否可复用？ → 不可复用。schedule 961 在 2026-07-20 00:53（Asia/Shanghai）更新后，必须等待更新后的下一次 source=schedule pipeline；当前 health-check 26046075 在 01:01 返回 not_due。 (pipeline 10530166 只能作为候选观察，不得作为更新后 schedule 的 positive evidence；下一窗口约为 2026-07-21 00:53，需过 grace 后重新检查。)
- Q: schedule 961 更新后的 scheduled pipeline 是否已产生候选 positive evidence？ → 是。master scheduled pipeline 10530206 在 schedule 961 更新后产生 issue-recommendations.json，schema、project、route 正确；consumer plan 保持 report-only，transition-result 为 trusted-automation-not-enabled，零 provider write。 (该 pipeline 仍需通过 schedule-health verifier 绑定 source=schedule、schedule.updated_at、job 和 artifact schema；在 health status=healthy 前不标记节点完成。)
- Q: schedule 961 的候选 positive evidence 应如何收敛？ → 先运行 schedule-health verifier，绑定 schedule 961、pipeline 10530206、job、source=schedule、master ref 和 issue-recommendations.json schema；只有 verifier 返回 healthy 才完成节点。 (采用 A，避免只凭候选 pipeline 绕过 schedule 更新时间和执行窗口校验。)
- Q: schedule-health verifier 应绑定哪个 scheduled job？ → 绑定 zj_loop_issue_triage；artifact 为 issue-recommendations.json，schema 为 zj-loop.issue_recommendations.v1，route 为 issue-backlog-triage。 (采用 A，确保 verifier 检查 Issue Backlog 主 artifact producer，而不是 daily triage 或 schedule probe。)
- Q: scheduled pipeline 的有效时间窗口如何计算？ → 从 schedule 961 的 updated_at 按 cron 和时区推导下一次窗口，再加固定 grace；只有窗口后的 source=schedule pipeline 才算当前 evidence。 (采用 A，避免误收 schedule 更新前的旧 pipeline。)
- Q: schedule-health 的固定 grace 时长是多少？ → 固定为 10 分钟；窗口由 schedule.updated_at、cron 和时区推导，pipeline 必须晚于窗口起点、schedule.updated_at，并在 grace 后检查。 (沿用现有 schedule-health-contract.ts 与测试契约，不引入 route-specific 覆盖。)
- Q: scheduled Issue Backlog job 是否允许 provider 写入？ → 保持 report-only、零 provider write：只生成 issue-recommendations.json、route decision 和 consumer plan；不写 Issue、评论、label、assignment、Issue Fix Request 或 MR。 (采用 A，限定本节点为观察性 scheduled report evidence，不扩大为 trusted automation。)
- Q: scheduled positive evidence 应保留哪些 artifact？ → 完整保留 schedule-health-result.json、route-decision.json、consumer-plan.json、issue-recommendations.json，以及对应 pipeline/job 元数据和下载链接。 (采用 A，确保后续可以复核 report 内容、route binding 和 artifact schema。)
- Q: verifier 是否必须校验 artifact 内部 binding？ → 必须校验 artifact 内部 binding：project=mlive-dev/ai-studio、route=issue-backlog-triage、pipeline/job 与目标一致、source=schedule、report 状态为允许的 report-only 状态，且不包含 provider write 结果。 (采用 A，避免误收其他 route 的同 schema artifact。)
- Q: artifact 缺少 report-only 证据或出现任一副作用标记时如何处理？ → fail-closed，不计为 positive evidence；必须存在并满足 provider=gitlab、project_path=mlive-dev/ai-studio、route=issue-backlog-triage、source=gitlab-issues-api，以及 side_effects.labels/comments/state/requests 全部为 false；缺失、非 false 或不匹配均返回结构化失败。 (采用 A，避免接受不完整或带副作用的 artifact。)
- Q: schedule-health verifier 的失败结果应如何分类？ → 保持结构化分类：窗口未到时为 not_due；窗口后无 source=schedule pipeline 为 execution_missing；job/artifact 不存在为 artifact_missing；schema 或内部 binding 不匹配为 artifact_schema_invalid；均保留 negative evidence，不伪装为 healthy。 (采用 A，区分时间窗口未到、执行缺失和证据无效。)
- Q: 1-5-5-4-1 何时可以标记完成？ → 通过完整 scheduled evidence gate：schedule 961 active 且 fingerprint 正确；schedule-health 返回 healthy；pipeline source=schedule 且晚于 updated_at 推导窗口和 10 分钟 grace；job=zj_loop_issue_triage；artifact=issue-recommendations.json；schema、project、route、source 和 side_effects 全部匹配；完整 artifacts 与 pipeline/job 链接保存；没有任何 provider write。 (采用 A，避免把 not_due 或单个 pipeline URL 误认为完整 scheduled positive evidence。)
- Q: 当前 1-5-5-4-1 设计是否收敛，可以进入 verifier 实现和真实 schedule 验证？ → 是：按完整 scheduled evidence gate 实现/验证，不降低 report-only 和零 provider write 约束。 (采用 A，进入 verifier 实现阶段。)
<!-- ROADMAP_SECTION_END -->
