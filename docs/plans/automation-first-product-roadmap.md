<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-17 00:41:07

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

### 当前施工：1-5-4-6. GitLab Changelog Drafter draft artifact or draft-MR evidence

**决策：**
- Q: GitLab Changelog Drafter 的默认完成形态是什么？ → 默认 draft-evidence，只有显式确认才创建 draft-MR。 (复用现有 promotion-gate 与 draft-consumer completion contract；GitLab provider-specific adapter 只在确认后执行 branch/commit/MR API。)
- Q: draft-evidence 的副作用边界是什么？ → 默认只生成并上传 CI artifact，不写入 tracked repository files；只有显式确认 draft-MR 才允许 GitLab branch/commit/MR API 写入。 (draft-plan.json 与 changelog-draft.md 是 review artifact；draft-MR 是独立的 provider-side effect path。)
- Q: GitLab Changelog Drafter 如何获得 release window？ → 只消费显式且完整的 ZJ_LOOP_CHANGELOG_DRAFT_REQUEST_JSON；不自动猜测 since_ref、until_ref 或 release window。缺失或 repo/base_branch 不匹配时输出 protocol_repair_request 或 escalation，零次 draft-MR API 写入。 (结构化输入是协议边界；provider adapter 不替 Agent 推断发布范围。)
- Q: GitLab draft-evidence 是否要求 GITLAB_TOKEN？ → 不要求。draft-evidence 只生成 CI artifact；只有显式 draft-MR 才要求 GITLAB_TOKEN 并调用 GitLab branch/commit/MR API。 (token 绑定 provider-side write，不把无副作用的 artifact 生成误判为 live 授权。)
- Q: GitLab draft-MR 如何授权？ → 复用 CREATE_CHANGELOG_DRAFT_PR_OR_EVIDENCE，但只有显式 draft_mode=pr 且确认短语匹配时才允许创建 MR；确认短语本身不能升级默认 draft-evidence。 (复用 promotion-gate 兼容协议，同时把 output mode 作为独立副作用边界。)
- Q: GitLab draft-MR 的 provider-side write 如何执行？ → 必须由 provider-specific GitLab Branch/Commit/Merge Request API 创建；目标分支严格取显式 release_window.base_branch，禁止 git push、gh 或分支推断。 (adapter 输出低成本 endpoint/payload 摘要与 MR lifecycle evidence，支持回放和审计。)
- Q: GitLab draft-MR 的文件 scope 如何固定？ → 只允许一个 repository-relative draft 文件，默认 docs/release-notes-draft.md；拒绝额外文件、绝对路径、路径穿越及 source MR 文件。 (Commit API actions 必须恰好覆盖该文件，adapter 在任何 provider write 前 fail-closed。)
- Q: GitLab draft-MR 的生命周期属性是什么？ → 始终以 Draft 状态创建，remove_source_branch=false，禁止 auto-merge；branch 使用确定性 automated/changelog-drafter-gitlab-<window-hash>，由独立 closeout 节点负责清理。 (draft-MR 是可审阅 artifact，不代表合并或发布完成。)
- Q: GitLab Changelog Drafter 是否创建 carrier Issue？ → 是，但仅显式 draft-MR 路径创建一个独立且可去重的 carrier Issue；默认 draft-evidence 不创建 Issue。 (carrier 绑定 draft request、draft-MR、human merge 和 closeout；避免把 artifact completion 当作发布完成。)
- Q: Changelog Drafter carrier 使用什么协议？ → 使用 Changelog Drafter 专属结构化 schema（zj-loop.changelog_draft_request.v1）；复用 GitLab lifecycle 的 dedupe、claim、reread 原语，但不复用 issue-fix-request schema。 (draft-consumer 与 fix-runner 保持语义分离。)
- Q: GitLab Changelog draft-MR 何时允许 provider write？ → 必须先成功 claim 专属 Changelog carrier；claim、request、project、release_window.base_branch 或 source binding 任一失败时，零次 branch/commit/MR API 写入并输出结构化 hard stop。 (claim 是唯一消费权，provider write 只能发生在 verifier-backed claim 之后。)
- Q: GitLab Changelog Drafter dogfood 的 draft 文件放在哪里？ → 使用 ai-studio 的专用 zj-loop/dogfood/changelog-draft.md 单文件 fixture，不修改业务目录或真实 README/CHANGELOG。 (draft-MR 只验证 Commit/MR/closeout API，fixture 可回滚且不代表业务文件变更。)
- Q: GitLab Changelog Drafter artifact 保存什么？ → 只保存低成本审计字段与生成结果，包括 request id、repo、base/since/until refs、draft mode、file scope 和 provider operation summary；不保存完整 GitLab response、token 或敏感 payload。 (保持可回放、低成本、低泄露面的 evidence contract。)
- Q: GitLab Changelog Drafter 的 truth 如何分层？ → orchestration review artifact 是主 truth；draft-MR body 只承载 post-merge contract 与简短摘要，不承载完整 draft 内容或 provider response。 (保持 Codex Harness/Doctor 可回放，同时让 MR body 面向 human review 与 closeout。)
- Q: GitLab Changelog Drafter 的实现顺序是什么？ → 按 core adapter、CLI、GitLab fragment、ai-studio draft fixture dogfood、human merge closeout 的顺序执行 TDD。 (每个 slice 单独验证；draft-evidence、draft-MR、closeout 不互相冒充完成。)

**当前子树：**
├── [ ][Y+] 1-5-4-6-1. GitLab Changelog Drafter draft-MR human merge、closeout 与 carrier lifecycle evidence
├── [x][Y+] 1-5-4-6-2. GitLab Changelog carrier、claim 与 Commit/MR adapter
├── [ ][Y+] 1-5-4-6-3. GitLab Changelog Drafter CLI 的 draft-evidence 与 draft-MR 模式
├── [ ][Y+] 1-5-4-6-4. GitLab Changelog Drafter 独立 fragment 与 generated-bundle gate
└── [ ][Y+] 1-5-4-6-5. ai-studio changelog draft fixture 与真实 draft-evidence dogfood
<!-- ROADMAP_SECTION_END -->
