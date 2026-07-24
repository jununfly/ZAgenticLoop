<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-24 14:11:05

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
├── [x][Y+] 1-6. 确定性脚本 gate 与 replay 证据闭环
│   ├── [x][Y+] 1-6-1. Architecture Integrity deterministic validation gate
│   ├── [x][Y+] 1-6-2. Evidence compatibility invalidation and stale-status derivation
│   ├── [x][Y+] 1-6-3. Completion delta CI and release hard gate
│   └── [x][Y+] 1-6-4. Structured hard-stop and recovery replay corpus
└── [x][Y+] 1-7. Dogfood 仪表盘与发布前完成判定
    ├── [x][Y+] 1-7-1. Reference installation fixtures for GitHub GitLab and Workspace
    ├── [x][Y+] 1-7-2. Doctor completion text renderer and user next actions
    ├── [x][Y+] 1-7-3. README and capability-claim guard for completion targets
    └── [x][Y+] 1-7-4. Release candidate complete-matrix audit

### 当前施工：1-5-5-3. GitLab event-driven required-route dogfood

**决策：**
- Q: 1-5-5-3 的 event-driven 入口是否固定为 GitLab 原生事件 source，禁止用 Web/API pipeline 伪造？ → 是。merge_request_event 固定覆盖 PR Steward/Post-Merge；Issue 或 Issue Note 原生事件覆盖 Issue Triage/CI Sweeper；gitlab-web-pipeline 只属于 1-5-5-2，不计入 event-driven evidence。每类事件必须记录真实 CI_PIPELINE_SOURCE 与 source IID/Note/MR IID。 (保持 trigger mode 与 evidence truth 一致，禁止把 Web/API replay 当作 event-driven completion。)
- Q: GitLab 缺少 issue_note_event pipeline source 时，是否允许 webhook bridge 触发 API pipeline？ → 允许，但严格分层。merge_request_event 直接作为原生 evidence；Issue/Note 路径以 GitLab webhook envelope 为主 truth，bridge 只能触发固定 consumer API pipeline，CI_PIPELINE_SOURCE=api 仅是执行载体，不得冒充原生事件。 (必须保留 webhook event ID、Issue IID、Note ID、request ID 和 project binding；任一缺失或不一致均 zero-write hard stop。)
- Q: Webhook bridge 应放在哪里？ → 放在 ZAgenticLoop 的 provider adapter 层，作为独立、无业务代码的 GitLab bridge；不放进 product-project 业务仓库，也不把 bridge 逻辑塞进 CI job。GitLab Project Webhook 只投递事件，bridge 校验 secret/project/event，再触发固定 API pipeline；provider side effects 仍由 consumer pipeline 的 claim/verifier 边界负责。 (bridge 不直接写 Issue、Note、Branch 或 MR；event ID 负责 dedupe，保留结构化 envelope。)
- Q: Webhook bridge 触发 API pipeline 是否使用独立最小权限 Pipeline Trigger Token，而不是复用 GITLAB_TOKEN？ → 是。GITLAB_TOKEN 仅供 consumer adapter 执行 Issue/Note/Branch/MR provider write；ZJ_LOOP_GITLAB_BRIDGE_TRIGGER_TOKEN 仅允许 bridge 触发固定 API pipeline。bridge 不接受任意 project/ref/job 参数，token 值不进入 evidence，只记录脱敏 auth_source。 (缺失 token、project/route/ref 不匹配时拒绝触发 pipeline。)
- Q: Webhook bridge 是否只保存低成本事件审计字段，不保存完整 GitLab webhook payload？ → 是。保留 event_id、event_type、project_path、Issue IID/Note ID/MR IID、source_url、target_route、target_ref、received_at、dedupe_key、auth_source、trigger_pipeline_id；原始 payload 只在内存中校验，不进入 artifact 或长期状态。 (保持与低成本 provider audit 原则一致，事件 envelope 可回放但不泄露完整 provider response。)
- Q: 事件过滤是否只接受 route-specific allowlist，而不是所有 Issue/MR 事件都触发？ → 是。Issue Note 只接受固定 activation/request command marker；Merge Request 只接受目标状态变化和明确失败信号；其他更新、普通评论、标签变化默认 ignored/not_applicable，不触发 consumer。事件 predicate 必须由 Route Table 验证。 (避免 bridge 自行猜 route 语义，降低噪声和误消费风险。)
- Q: 重复 webhook 投递是否以 event_id 去重，并在触发 API pipeline 前持久化 dedupe receipt？ → 是。相同 event_id 只保留第一条 receipt；不同 event_id 通过 route-level dedupe_key 做幂等判断。pipeline 触发结果未知时生成 trigger-uncertain evidence，禁止盲目重试，只能显式 resume/restore。receipt 只保存低成本字段和 pipeline ID。 (避免重复消费和不确定 provider/API 状态，保持事件桥可回放。)
- Q: event-driven 的完成边界是否按 route-specific completion form 判定，而不是 Webhook 收到或 API pipeline 启动就算完成？ → 是。PR Steward 要到 report/request、claim/verifier 和 escalation 或 repair-MR artifact；CI Sweeper 要到 Issue Fix Request、claim/verifier 和 bounded repair-MR artifact；Post-Merge 要到真实 MR 合并事件、contract verifier 与 branch/carrier closeout evidence；Issue Triage 要到真实 Note/Issue 事件与 transition verifier evidence。 (人工 merge、closeout、恢复分别遵守各 route contract，不能互相替代。)
- Q: dogfood 顺序是否先验证无需 webhook bridge 的原生 merge_request_event，再实现 Issue/Note webhook bridge？ → 是。先完成 merge_request_event 的 PR Steward report/request/claim/verifier，再完成 MR event 的 Post-Merge closeout；随后实现 Issue/Note webhook bridge，依次验证 Issue Triage 与 CI Sweeper，最后汇总 event-driven matrix evidence。 (先隔离 GitLab 原生事件能力，再引入 bridge 的 dedupe、trigger-uncertain 与 API pipeline 执行载体风险。)
- Q: 原生 merge_request_event dogfood 是否创建独立最小 fixture MR，只修改 zj-loop/dogfood/pr-steward-fixture.yml，不复用 !315 或历史 MR？ → 是。使用独立 zjal-* 源分支、目标 master、单文件 fixture scope 和可控失败 check；显式绑定 MR IID、head SHA、source/target branch。失败时零次源 MR 写入，人工关闭/合并与 Post-Merge closeout 分开验证。 (避免 explicit-on-demand 与 event-driven evidence 串线，也避免触碰 product-project 业务逻辑。)
- Q: PR Steward event-driven dogfood 是否以结构化 escalation 作为正向 completion，而不创建第二个 repair MR？ → 是。验证完整 merge_request_event → report → request → claim → verifier → escalation；只创建独立 Issue Fix Request carrier，不写 source MR，不创建 repair MR。repair MR 作为后续增强证据，不阻塞 event-driven 基础能力完成。 (复用已验证 GitLab PR Steward escalation completion form，保持 source MR 与 carrier 隔离。)
- Q: PR Steward event-driven 正向 dogfood 是否允许自动创建独立 carrier Issue，并要求 carrier 与 source MR 完全隔离？ → 是。carrier 只能由固定 GITLAB_TOKEN 创建，body 绑定 project path、source MR IID、source head SHA、request ID、dedupe key；claim/verifier/escalation 只写 carrier，不写 source MR，不自动合并或关闭 source MR；carrier closeout 独立处理。 (保持 source review 与 request carrier 的 provider-side effect 边界清晰可回放。)
- Q: PR Steward event-driven negative/recovery 是否覆盖 source head SHA mismatch、request/project mismatch、claim mismatch、verifier scope failure 和重复 event dedupe？ → 全部覆盖。每个 case 输出结构化 hard stop 或 escalation；side_effects_executed=false，零次 source MR 写入和 repair MR 创建；重复 event 不创建第二个 carrier；recovery 只能显式 resume/restore，禁止自动重试。 (确保 event-driven evidence 不停留在 happy path，并验证消费权、scope 和恢复边界。)
- Q: event-driven GitLab CI 是否采用固定 DAG 编排，禁止在 rules 内配置 needs？ → 是。只有 CI_PIPELINE_SOURCE=merge_request_event 的原生 MR event job 进入；job 显式绑定 CI_MERGE_REQUEST_IID、CI_COMMIT_SHA、source/target branch；needs 只写在 job 顶层，事件入口立即运行，recovery 不被无关上级 job 阻塞。 (避免 GitLab YAML parser 错误和同 stage 隐式阻塞，保持 event identity 可回放。)
- Q: event-driven 是否按完整可验收的垂直功能拆分，避免第一刀被误解为整个 1-5-5-3 已完成？ → 是。1-5-5-3 拆成完整功能 slices：原生 MR event 的 PR Steward 生命周期、原生 MR event 的 Post-Merge closeout 生命周期、Issue/Note webhook bridge 协议与 dedupe、bridge 驱动的 Issue Triage 生命周期、bridge 驱动的 CI Sweeper 生命周期。每个 slice 都有独立 positive、negative/recovery 和 live evidence；父节点只有全部 slices 完成后才完成。 (第一刀只完成一个明确命名的垂直功能，roadmap 父节点保持 in_progress，禁止用局部 evidence 宣称完整 event-driven 能力。)
- Q: Issue Note bridge 暂不可用时下一步推进什么？ → A：保持 webhook live dogfood deferred，推进 GitLab bridged Issue Triage event-driven lifecycle dogfood (缺少可访问 HTTPS bridge endpoint；不部署、不伪造 live evidence，先验证已有 bridged Issue Triage 协议与负向/恢复闭环。)

**当前子树：**
├── [x][Y+] 1-5-5-3-1. GitLab native MR event PR Steward escalation lifecycle dogfood
├── [x][Y+] 1-5-5-3-2. GitLab native MR event Post-Merge closeout lifecycle dogfood
│   ... 5 more child nodes; run tree 1-5-5-3-2 --depth 2 for full view
├── [ ][Y+] 1-5-5-3-3. GitLab Issue Note webhook bridge envelope dedupe and trigger recovery
│   ... 5 more child nodes; run tree 1-5-5-3-3 --depth 2 for full view
├── [x][Y+] 1-5-5-3-4. GitLab bridged Issue Triage event-driven lifecycle dogfood
│   ... 1 more child nodes; run tree 1-5-5-3-4 --depth 2 for full view
└── [x][Y+] 1-5-5-3-5. GitLab bridged CI Sweeper event-driven repair lifecycle dogfood
<!-- ROADMAP_SECTION_END -->
