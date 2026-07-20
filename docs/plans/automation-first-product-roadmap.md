<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-20 15:38:10

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
<!-- ROADMAP_SECTION_END -->
