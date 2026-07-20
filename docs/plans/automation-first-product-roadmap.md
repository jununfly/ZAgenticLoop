<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-20 12:49:50

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

### 当前施工：1-5-4-6-6. ai-studio GitLab Changelog draft-MR live dogfood and provider write evidence

**决策：**
- Q: 本次 live dogfood 使用哪种 fixture？ → 创建全新的独立 fixture：新建 request、carrier Issue、claim、automated/changelog-drafter-gitlab-* 分支、单文件 draft commit 和 draft MR；不合并、不执行 closeout、不发布。 (采用 A，避免复用历史 evidence，并完整验证新的 request 到 provider 写入链路。)
- Q: 新的 draft MR 允许修改哪个文件？ → 只修改 zj-loop/dogfood/changelog-draft.md，保持单文件、可审计，并与业务代码和真实发布文件隔离。 (采用 A，避免 live dogfood 污染业务文件或真实发布内容。)
- Q: draft MR 的分支与状态如何固定？ → source 使用唯一命名规则 automated/changelog-drafter-gitlab-<request-id>-<短标识>，target 固定为 master，只允许推送单文件 commit，MR 必须保持 Draft，不得自动合并。 (采用 A，确保 provider binding 稳定并避免误合并。)
- Q: live dogfood 完成后如何处理 fixture？ → 保留 carrier Issue、claim Note、branch、commit、Draft MR 和 artifacts，不合并、不关闭、不删除；必要清理另行执行并单独记录。 (采用 A，保证 provider-write 事实可复核，清理不与 positive evidence 混淆。)
- Q: carrier 与 draft MR 的授权如何分层？ → 使用两组独立固定确认短语：carrier 创建使用一组确认短语，claim/draft-MR 写入使用另一组确认短语；每一步单独校验，禁止跨阶段复用。 (采用 A，限制每一步的授权范围并避免 carrier 确认扩大为 branch/commit/MR 写入授权。)
- Q: 本节点何时算完成？ → 通过完整 live provider-write gate：新 request、carrier Issue、claim Note、branch、single-file commit、Draft MR 均真实创建；source 命名和 target=master 正确；MR 保持 Draft；artifacts 完成 project/request/claim/branch/commit/MR binding；且未发生 merge、release、closeout 或其他非授权副作用。 (采用 A，不能把单个 MR URL 或 pipeline 成功误认为完整 live evidence。)
- Q: 当前设计是否已经收敛，可以开始执行 live dogfood？ → 是：按既定 completion gate 执行；每个副作用阶段单独确认，执行后核对 provider 与 artifacts。 (采用 A，进入 live dogfood 执行阶段，不降低既定 gate。)
<!-- ROADMAP_SECTION_END -->
