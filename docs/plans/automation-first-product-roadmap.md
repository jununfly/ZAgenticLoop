<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-17 23:44:42

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

### 当前施工：1-5-5-3-3-5. ai-studio GitLab Issue Note bridge live dogfood fixture

Added independent node:http runtime and CLI entrypoint in tools/zj-loop-core/src/gitlab-issue-note-bridge-server.ts and gitlab-issue-note-bridge-cli.ts, plus GET /healthz for UAT-Caster probes. Runtime exposes only POST /gitlab/webhook/issue-note, chains validation→receipt/dedupe→fixed trigger, and never stores raw payload or accepts dynamic route/ref. Authorized local HTTP integration plus bridge matrix passed 17 tests with build and git diff --check. Local smoke and candidate endpoint probe were non-live only; real ai-studio live evidence still requires deployment, carrier Issue/Note IID, Project Webhook, and separately injected trigger token.

**决策：**
- Q: ai-studio live dogfood fixture 的边界是什么？ → 在 mlive-dev/ai-studio 创建独立 carrier Issue，不复用历史 Issue/MR；只添加一条固定 marker Note /zj-loop start roadmap-sliced-development；绑定项目、target route=roadmap-sliced-development、pipeline ref=master；只验证 webhook envelope→receipt/dedupe→API pipeline trigger；不创建/修改 Branch、MR、业务文件、Issue label/state；真实 provider write 仅限创建 pipeline，其余由 artifact 记录。 (最小 fixture 防止把历史 MR 或业务副作用误认为 bridge evidence。)
- Q: carrier Issue 与 marker Note 如何产生？ → 由 Human 通过 GitLab Web UI 手动创建独立 carrier Issue 并添加唯一 marker Note；记录真实 issue_iid、note_id、Note URL；bridge 只消费 GitLab webhook 原始事件，event_id 必须来自 webhook header；bridge trigger token 只用于创建 pipeline，不用于创建 Issue/Note。 (positive evidence 必须是真实 Issue Note→webhook→bridge→pipeline 链路。)
- Q: GitLab Project Webhook 如何配置？ → 使用 bridge 固定 HTTPS endpoint；Secret Token 为独立 ZJ_LOOP_GITLAB_BRIDGE_TRIGGER_TOKEN；只启用 Issues events，不启用 Push/Merge request/Tag/Job/Pipeline 等其他事件；bridge 校验 X-Gitlab-Event=Issue Hook、X-Gitlab-Event-UUID、project path 与 secret；配置变更只记录脱敏 audit，不算 positive evidence。 (Webhook predicate 与 Route Table predicate 双重收敛事件范围。)
- Q: 被触发的 API pipeline 必须证明什么？ → 使用固定 master ref 的专用 job zj_loop_gitlab_issue_note_bridge_receipt；只校验 CI_PIPELINE_SOURCE=api、7 个 bridge 变量与 Issue/Note/envelope binding，运行 route decision/consumer plan，生成统一 envelope/receipt/dedupe/trigger evidence artifact；不写 Issue/Note/Branch/MR，不执行业务修复或 promotion。只有 job 成功且 artifact binding 完整才算 positive evidence。 (API pipeline 是受限执行载体，不是 bridge 或业务 side-effect 层。)
- Q: 真实 dogfood 的验证顺序是什么？ → 先运行错误 secret、非 Issue Hook、项目不匹配、非匹配 Note 等 zero-write negative cases；再发送合法 marker Note 验证唯一 positive pipeline；重放同一 webhook 验证 duplicate 且不创建第二个 pipeline；查询并下载 pipeline artifact 核对 event/Issue/Note/ref/route 全绑定；最后验证 recovery/uncertain fixture，禁止盲目重触发。 (先证明 hard stop，再执行唯一真实 provider trigger。)
- Q: dogfood fixture 完成后的清理边界是什么？ → 保留 carrier Issue、marker Note、pipeline 与 artifacts 作为审计证据；不关闭 Issue、不删除 Note、不删除 pipeline；完成后禁用 Project Webhook，trigger token 由 Human 轮换/删除；清理动作不计入 positive evidence，若执行必须单独记录 cleanup evidence。 (fixture 生命周期与 bridge evidence 生命周期分离。)
<!-- ROADMAP_SECTION_END -->
