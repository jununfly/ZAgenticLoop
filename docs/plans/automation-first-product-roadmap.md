<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-14 19:09:20

[~][Y+] 1. Automation-First Product Goal Roadmap
├── [~][Y+] 1-1. Completion Alignment Ledger 与不可补偿完成硬门
│   ├── [x][Y+] 1-1-1. Durable completion-alignment architecture and applicability map
│   ├── [x][Y+] 1-1-2. Route Table completion target schema and generated template
│   ├── [ ][Y+] 1-1-3. Core Completion Alignment Ledger derivation API
│   ├── [ ][Y+] 1-1-4. Doctor completion ledger JSON text and exit contract
│   └── [ ][Y+] 1-1-5. Completion contract parser and compatibility regression tests
├── [ ][Y+] 1-2. 当前 Route 能力与用户体验缺口盘点
│   ├── [ ][Y+] 1-2-1. Migrate current Route Table rows into explicit completion targets
│   ├── [ ][Y+] 1-2-2. Derive initial required-cell capability and evidence gap baseline
│   └── [ ][Y+] 1-2-3. Classify current evidence as compatible stale or missing
├── [ ][Y+] 1-3. 默认自动执行到 review artifact 或 hard stop
│   ├── [ ][Y+] 1-3-1. Automatic-progression transition trace contract
│   ├── [ ][Y+] 1-3-2. Workspace Adapter local activation and review artifact runner
│   ├── [ ][Y+] 1-3-3. Workspace Adapter local closeout resume and real Git dogfood
│   └── [ ][Y+] 1-3-4. Bounded multi-slice continuation to artifact or hard stop
├── [ ][Y+] 1-4. 结构化 stop signal 与 human handoff 体验
│   ├── [ ][Y+] 1-4-1. Machine-readable human handoff location and confirmation contract
│   ├── [ ][Y+] 1-4-2. Low-risk protocol repairs and structured protocol repair request
│   └── [ ][Y+] 1-4-3. Ambiguous-handoff and unnecessary-confirmation metrics gate
├── [ ][Y+] 1-5. GitHub 与 GitLab 的 live 能力对齐
│   ├── [ ][Y+] 1-5-1. Provider adapter completion evidence mapping
│   ├── [ ][Y+] 1-5-2. GitHub required-route live and recovery reference evidence
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

### 当前施工：1-1. Completion Alignment Ledger 与不可补偿完成硬门

顺序：1-1-1 已完成 durable design；1-1-2 定义同一 Route Table 结构；1-1-3 派生 core ledger；1-1-4 暴露 doctor；1-1-5 固化兼容性回归。

**决策：**
- Q: 完成标准应该按架构目标还是用户体验目标？ → 两者同时作为 hard completion criteria：架构上必须有 Route Table truth、runner/preflight/replay/gate 证据；体验上必须能从用户信号自动推进到 review artifact 或结构化 hard stop，且用户不需要在多个位置反复猜下一步。 (这是动态对齐评分，不是二选一。A 先进时拉 B，B 落后时约束 A 的宣称。)
- Q: 完成度是否允许加权评分抵消硬缺口？ → 不允许。以 Completion Alignment Ledger 替代评分；Architecture Integrity、live capability、stop/recovery、experience continuity、automatic progression 与 verification 均为不可补偿硬门。 (旧的评分措辞正式废弃；历史决策保留其被替换原因。)

**当前子树：**
├── [x][Y+] 1-1-1. Durable completion-alignment architecture and applicability map
├── [x][Y+] 1-1-2. Route Table completion target schema and generated template
├── [ ][Y+] 1-1-3. Core Completion Alignment Ledger derivation API
├── [ ][Y+] 1-1-4. Doctor completion ledger JSON text and exit contract
└── [ ][Y+] 1-1-5. Completion contract parser and compatibility regression tests
<!-- ROADMAP_SECTION_END -->
