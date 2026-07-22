<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-22 14:16:17

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

已完成 core completion_evidence.v1 schema/validator/CLI、orchestration 接入与 GitLab read-only adapter；完成 core 0.1.11 release-prep：同步 package/lock、zj-loop-init 默认版本、GitHub generated templates/workflows、version-lock 与 release/bundle gates。验证：core 340 项、新增 completion evidence 9 项、GitLab adapter 2 项、dispatch 31 项、init 32 项通过；provider parity、generated bundle release gate、version consistency healthy（0.1.11）通过。待人工合并 release PR、发布 npm 0.1.11，再更新 ai-studio MR 做 report-only dogfood。

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
- Q: provider adapter 接入顺序是什么？ → A：先接 GitLab report-only adapter，复用 zj-loop-gitlab-infra 的 pipeline/job/artifact/provenance 读取能力，在 mlive-dev/ai-studio 验证；随后用同一 completion evidence contract 做 GitHub parity。 (当前真实验证对象是 GitLab，且已有稳定 read-only infra，最快验证完整链路且不打开写入副作用。)
- Q: GitLab dogfood 如何获得包含新 adapter 的 core 版本？ → A：先在 GitHub 创建 PR，合并后发布 @jununfly/zj-loop-core@0.1.11；再让 ai-studio 通过独立 MR 更新版本锁与 CI 引用，最后运行 report-only dogfood。 (0.1.10 不包含 completion evidence adapter；正式发布链路才能验证版本锁、生成 CI 与目标项目一致性。)
- Q: GitLab report-only dogfood 通过后下一步是什么？ → A：进入 GitHub parity (复用同一 zj-loop.completion_evidence.v1，验证 GitHub workflow/check/artifact/provenance 读取、身份绑定、失败阻断与无副作用语义。)
- Q: GitHub parity 的 infra 层如何落位？ → A：新增独立的 zj-loop-github-infra 包 (与 zj-loop-gitlab-infra 对称，负责 GitHub API 的 read-only preflight、workflow run、check、artifact、commit/ref provenance 读取；core 只接收标准化证据。)
- Q: GitHub infra 首版 capability 面如何定义？ → A：workflow-run-read、check-read、artifact-read、commit-read、ref-read (与 GitLab read-only infra 对称，同时保留 GitHub 原生 workflow/check 和 commit/ref provenance，确保 artifact 能绑定当前 head SHA。)
- Q: GitHub read-only infra 的认证策略如何定义？ → A：token 可选，优先使用 Bearer token (有 GITHUB_TOKEN 或调用方注入 token 时走认证请求；无 token 时允许公共仓库读取，但 preflight 结构化报告认证来源、速率限制风险和可用能力；不提供任何写 API。)
- Q: GitHub 与 GitLab infra 是否使用统一错误分类？ → A：统一错误分类 (复用 auth-failed、permission-denied、not-found、rate-limited、transient-network、provider-contract-mismatch、response-shape-invalid；GitHub/GitLab adapter 只映射平台差异。)
- Q: GitHub API 的地址与版本策略如何定义？ → A：默认官方 API + 固定 API 版本，可覆盖地址 (默认 https://api.github.com，固定发送 X-GitHub-Api-Version: 2022-11-28；允许测试、GitHub Enterprise 或兼容部署覆盖 apiUrl。)
- Q: GitHub artifact 读取如何设计？ → A：按指定路径安全读取 ZIP 内的 JSON artifact (读取 artifact 元数据，下载 ZIP，在受控目录内定位指定 JSON 文件，解析 JSON 并返回 schema、payload 与 provenance；拒绝路径穿越、重复文件和非法 JSON。)
- Q: GitHub ZIP artifact 解析应使用什么实现？ → A：引入小型纯 JavaScript ZIP 库 (锁定 fflate 等纯 JS ZIP 依赖，并覆盖路径穿越、重复 entry、压缩包大小和非法 JSON；不依赖 Runner 是否安装 unzip。)
- Q: GitHub artifact 应如何选择？ → A：调用方必须提供精确 artifact 名称和 ZIP 内 JSON 路径 (只接受唯一匹配、未过期的 artifact；名称、文件路径或 schema 不匹配时结构化阻断，不自动猜测。)
- Q: GitHub workflow run 应如何定位？ → A：completion evidence 使用方必须提供精确 run_id；另提供唯一匹配查询辅助 (可按 workflow、head SHA、ref、event 查询候选 run，但只有唯一匹配才继续；无匹配或多匹配结构化阻断，不能自动选最新。)
- Q: GitHub workflow run 下的 job/check 应如何绑定？ → A：调用方提供精确 job 名称，adapter 要求唯一匹配并读取对应 check-run (job 不存在、多于一个或 check 状态无法映射时阻断；artifact 必须属于同一 run，不能只凭 workflow 级别成功判断。)
- Q: GitHub job/check 状态如何映射到 completion evidence？ → A：只有 success 才能生成完成证据 (queued/in_progress 进入 planned 或等待；failure/cancelled/timed_out/action_required 进入 hard_stopped；skipped/neutral 按缺失证据处理，不得冒充成功。)
- Q: GitHub commit/ref provenance 应如何强绑定？ → A：同时校验 workflow run、job、commit API 与指定 ref 的 SHA (任一缺失、不一致或 ref 已移动都结构化阻断；completion evidence 的 current_head_sha 必须等于一致的 SHA。)
- Q: zj-loop-github-infra 是否需要 CLI 入口？ → A：同时提供 TypeScript library + CLI (library 供 core/测试复用；CLI 提供 preflight、workflow run、job/check、artifact、commit/ref 的确定性 JSON 输出，GitHub Actions 和本地 replay 不直接写 API 调用。)
- Q: GitHub infra CLI 应采用哪种命令形态？ → A：按资源拆分命令，并提供组合 provenance 命令 (提供 preflight、workflow-run、job、artifact、commit-ref，另提供 provenance 一次性执行完整绑定校验；单资源命令便于诊断，组合命令便于 CI。)
- Q: GitHub parity 首轮真实 dogfood 使用哪个 workflow？ → A：ZJ Loop Smoke (首轮选择纯 report-only smoke；目标 job 为 smoke，目标 artifact 为 zj-loop-version-consistency，避免 PR/Issue/branch/workflow 写入。现有成功 run 29380641716 缺少可读取 artifact，需要先补齐 smoke artifact 证据再 dogfood。)
- Q: 现有 Smoke run 缺少 artifact，下一步如何补齐？ → A：为 ZJ Loop Smoke 增加 canonical completion evidence artifact (workflow 生成 completion-evidence.json，上传固定名称 zj-loop-completion-evidence；再触发新的 smoke run，用它做真实 GitHub parity dogfood。)
- Q: Smoke 的 completion-evidence.json 如何生成？ → A：调用 zj-loop-dispatch，从 orchestration 输出提取 completion_evidence (复用 core 状态机和 zj-loop.completion_evidence.v1；workflow 只负责生成输入、提取统一 evidence 并上传 artifact。)
- Q: Smoke canonical completion evidence 应如何表达？ → A：保留 status=planned，并把 completion-evidence.json 作为 report-evidence artifact (准确表示 Smoke 只完成 route/consumer 计划和可审阅证据，没有执行业务副作用；side_effects_executed=false。)
- Q: workflow 内生成的 evidence 与 GitHub adapter provenance 如何衔接？ → A：workflow 只生成业务 completion evidence，adapter 读取时补充并校验真实 GitHub provenance (workflow 使用 repository、run_id、job、sha、ref 作为初始绑定；adapter 再读取真实 run/job/check/commit/ref/artifact API，生成最终 provenance 并校验一致性。)
- Q: GitHub adapter 应如何输出校验后的结果？ → A：保留原始 completion evidence，额外输出 normalized provenance 与 validation result (原始业务 evidence 不被覆盖；adapter 输出 provider_provenance、绑定检查结果、错误分类和 side_effects_executed=false，core 再组合最终可消费证据。)
- Q: zj-loop-github-infra 应如何发布？ → A：作为独立公开 npm 包发布 @jununfly/zj-loop-github-infra@0.1.0 (使用独立 package、lockfile、测试、release workflow 和 tag zj-loop-github-infra-v0.1.0；GitHub parity dogfood 在该包发布后执行。)
- Q: 新 GitHub infra 包的 tag 和 npm 发布如何授权？ → A：先提交并合并 release PR；合并后由 Human 单独确认，再创建 tag 并发布 (未收到新包的明确确认前，不创建 zj-loop-github-infra-v0.1.0，也不执行 npm publish。)
- Q: 没有 GitHub token 时，preflight 应如何报告？ → A：状态为 ready，同时输出 warning (公共仓库 read-only 能力可用；明确记录 auth_source=none、匿名速率限制风险和受限 capability；真实 401/403/429 再分类阻断。)
- Q: GitHub API 的 429/瞬时网络错误如何处理？ → A：单次请求默认不自动重试，返回结构化错误和 retry_after (保持 deterministic；调用方决定是否 retry，避免多个 route 隐式放大请求量；默认关闭隐式重试。)
- Q: GitHub ZIP artifact 的资源限制如何定义？ → A：固定保守默认值，调用方只能进一步收紧 (默认压缩包最多 10 MB、解压总量最多 50 MB、单文件最多 10 MB、最多 100 个 entries；超限立即结构化阻断，不允许放宽。)
- Q: GitHub parity 的测试验收矩阵如何定义？ → A：真实 HTTP boundary + deterministic ZIP fixture + 负向矩阵 + 一次真实 GitHub read-only dogfood (覆盖认证/API 版本/编码、workflow/run/job/check/artifact/commit/ref normalization、429/403/404/网络错误、ZIP 路径穿越/重复/超限/非法 JSON、SHA 漂移和无副作用。)
- Q: 真实 GitHub dogfood 应在哪里运行？ → A：新增手动触发的 github-infra-dogfood workflow (仅授予 contents:read、actions:read、checks:read；输入精确 run_id、job 名称、artifact 名称和 JSON 路径；只上传 read-only provenance/validation artifact，不触发或写入 GitHub 资源。)
- Q: github-infra-dogfood 的输入是否允许自动推断？ → A：所有关键输入都必填，不自动选择 (repository、run_id、workflow_name、job_name、artifact_name、artifact_path、expected_head_sha 全部显式提供；缺失、多匹配或不一致直接阻断。)
- Q: dogfood 失败时应如何处理 artifact 和 job 状态？ → A：始终上传结构化结果，再让 job 失败 (成功或失败都上传原始 evidence、normalized provenance、validation result 和错误分类；验证失败返回非零退出码。)
- Q: zj-loop-github-infra 与 zj-loop-core 的依赖方向如何定义？ → A：GitHub infra 不依赖 core，只输出独立 normalized provenance/validation 结果 (与 GitLab infra 对称，避免 provider 包反向耦合 core；core 通过稳定结构接收 adapter 结果并执行 completion evidence 语义校验。)
- Q: 第一轮实现应如何拆 PR？ → A：一个 PR 完成 GitHub infra 包、测试、release workflow、dogfood workflow 和 Smoke artifact 改造 (一次审阅完整契约；合并后再单独确认 tag/npm 发布，保持人工发布边界。)
<!-- ROADMAP_SECTION_END -->
