<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-15 08:51:29

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

### 当前施工：1. Automation-First Product Goal Roadmap

先完成 1-1 的 completion contract；1-2 迁移并基线化当前事实；1-3 与 1-4 可在 contract 稳定后并行；1-5、1-6、1-7 依次收口 adapter、gates 和 release evidence。

**决策：**
- Q: 架构目标与用户体验目标是否二选一？ → 两者必须同时满足，并在项目演进中动态保持一致。架构目标先进时应拉动用户体验补齐；用户体验落后时应作为稳定参考对象反向打磨架构确定性。 (参考动态规划思路：每个阶段都维护局部最优与全局目标的一致性，避免架构漂亮但体验不顺，或体验承诺超过架构事实。)
- Q: 路线图应如何切成可执行 slices？ → 按同一真相面、核心派生、自动推进与Workspace、GitHub/GitLab适配、确定性gate/replay、reference dogfood/release 六条依赖线切分；每个叶子必须有明确接口、测试或dogfood证据，不能把中间报告误作完成。 (先完成可表达并可判定的 completion contract，后续 adapter 与用户体验工作才有共同完成标准。)

**当前子树：**
├── [x][Y+] 1-1. Completion Alignment Ledger 与不可补偿完成硬门
│   ... 5 more child nodes; run tree 1-1 --depth 2 for full view
├── [x][Y+] 1-2. 当前 Route 能力与用户体验缺口盘点
│   ... 3 more child nodes; run tree 1-2 --depth 2 for full view
├── [x][Y+] 1-3. 默认自动执行到 review artifact 或 hard stop
│   ... 4 more child nodes; run tree 1-3 --depth 2 for full view
├── [x][Y+] 1-4. 结构化 stop signal 与 human handoff 体验
│   ... 3 more child nodes; run tree 1-4 --depth 2 for full view
├── [ ][Y+] 1-5. GitHub 与 GitLab 的 live 能力对齐
│   ... 5 more child nodes; run tree 1-5 --depth 2 for full view
├── [ ][Y+] 1-6. 确定性脚本 gate 与 replay 证据闭环
│   ... 4 more child nodes; run tree 1-6 --depth 2 for full view
└── [ ][Y+] 1-7. Dogfood 仪表盘与发布前完成判定
    ... 4 more child nodes; run tree 1-7 --depth 2 for full view
<!-- ROADMAP_SECTION_END -->
