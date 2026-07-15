<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-15 16:14:15

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
│   ├── [ ][Y+] 1-5-3. GitLab signal and request-carrier live adapter parity
│   ├── [ ][Y+] 1-5-4. GitLab branch MR review and closeout live adapter parity
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

### 当前施工：1-5-3-1-5-2-1. Owned GitLab schedule probe lifecycle state and guarded cleanup

**决策：**
- Q: 轮询期间 GitLab API 临时失败时如何处理？ → 继续每 30 秒有界重试直到 deadline，记录低成本错误计数；仅在 deadline 后 cleanup 并输出 escalation。 (一次网络/API 抖动不应中断真实 scheduled evidence 观察；deadline 与 guarded cleanup 防止无限循环和临时 schedule 残留。)
- Q: resume 是否可重新计算或延长 probe 观察窗口？ → 必须复用 state 中原始 armed_at 与 deadline，绝不重新计算或延长；deadline 已过则直接 guarded cleanup 并返回原窗口的 escalation/evidence。 (resume 仅恢复同一次有界事务，不能把中断变成无限等待。)
- Q: restore 的资源身份如何限定？ → 只接受 --probe-id，从 zj-loop/schedule-probes/<id>.json 读取 owned schedule 身份；没有 state、marker 不匹配或 state 已 cleaned 都拒绝，绝不接受任意 --schedule-id。 (restore 保持为清理自身资源的专用接口，不成为通用 GitLab schedule 删除工具。)
- Q: guarded cleanup 成功后如何处理 probe state？ → 保留 state 文件并标记为 cleaned，作为低成本 replay evidence；restore 看到 cleaned 时幂等拒绝，不再 DELETE。 (保留创建、观察、cleanup 的完整闭环证据，同时阻止重复清理。)
<!-- ROADMAP_SECTION_END -->
