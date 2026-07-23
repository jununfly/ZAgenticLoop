<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-23 23:17:45

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

### 当前施工：1-5-5-3-5. GitLab bridged CI Sweeper event-driven repair lifecycle dogfood

Design decisions complete; next implement isolated CI Sweeper bridge, explicit synthetic failure fixture, API carrier gate, repair MR and guarded closeout in ai-studio-gitlab.

**决策：**
- Q: CI Sweeper 正向 fixture 放在哪个项目？ → A：仅在 mlive-dev/ai-studio-gitlab 专用测试 fork 执行；允许创建 repair MR，但由 Human 人工合并；不触碰 mlive-dev/ai-studio 生产项目。 (验证 bridge、carrier、claim、repair MR、closeout 全链路，生产项目保持只读/不触发。)
- Q: CI Sweeper 失败信号如何制造？ → A：在 ai-studio-gitlab 的 .gitlab-ci.local.yml 增加一次性、显式变量门控的 synthetic failing job；不修改业务代码，不影响普通 pipeline；只生成 Issue Fix Request/repair MR，不自动合并或发布。 (fixture 完成后删除或关闭入口。)
- Q: CI Sweeper bridge 如何与 roadmap bridge 共存？ → B：新增独立 CI Sweeper bridge 实例/入口；target_route=ci-sweeper，使用独立 marker 与 pipeline 配置；roadmap bridge 保持不变。 (验证多 route 共存、独立 marker、独立 pipeline 触发和故障隔离。)
- Q: CI Sweeper carrier 是否允许由 bridge API pipeline 创建？ → B：允许受控 bridge-shaped API pipeline 创建；必须同时满足 API source、carrier enabled、固定 confirmation、bridge 身份/项目/route/request body 全绑定和 GITLAB_TOKEN；其他 API pipeline zero-write。 (保持事件驱动完整性，同时保留显式开关、固定确认词和身份绑定。)
- Q: CI Sweeper carrier 使用哪个 Issue？ → A：为本次 synthetic failure 创建全新的独立 carrier Issue；使用新的 request_id/dedupe marker，不复用 Issue #2 或 roadmap carrier；closeout 后单独关闭并记录清理证据。 (隔离 route、request 和生命周期，避免重复消费或误关闭。)
- Q: repair MR 的最小变更范围是什么？ → A：只修改 ai-studio-gitlab 的 .gitlab-ci.local.yml，恢复或关闭 synthetic fixture 的失败 gate；不修改业务代码或普通测试文件；由 Human 人工合并。 (隔离测试 substrate，验证有效 diff、repair MR 和后续 pipeline。)
- Q: CI Sweeper 如何接收 synthetic failure？ → A：先创建故意失败的 pipeline，再用独立 Issue 的固定 marker Note 触发 CI Sweeper bridge；失败 pipeline ID 作为 signal_id，验证 pipeline/job/commit/artifact 到 carrier、claim、repair MR 的绑定。 (Issue Note 负责启动事件流，CI failure pipeline 保留为 source evidence。)
- Q: CI Sweeper bridge 使用什么 marker？ → A：固定使用 /zj-loop start ci-sweeper；route、marker、target pipeline 固定绑定；普通评论和其他 route marker 默认拒绝。 (与 roadmap marker 语法一致，但保持 route 隔离。)
- Q: CI Sweeper carrier 使用什么确认词？ → A：复用 CREATE_GITLAB_CI_SWEEPER_CARRIER，并要求 ZJ_LOOP_GITLAB_CARRIER_ENABLED=true；不新增临时确认词。 (沿用已有 GitLab CI Sweeper 协议，保持 provider parity 和安全双开关。)
- Q: CI Sweeper repair MR 使用什么分支策略？ → A：使用 automated/ci-sweeper-gitlab-<pipeline-id>-<request-hash>，目标分支 master；只创建 MR，由 Human 审核并合并，不直接提交 master。 (保持 branch allowlist、request identity、source pipeline 和人工 review 边界。)
- Q: CI Sweeper repair MR 合并后如何 closeout？ → A：受控自动 closeout；确认 MR 已合并、branch allowlist、carrier identity 和固定确认词全部通过后，追加 closeout evidence、删除 automated/ci-sweeper-gitlab-* 分支并关闭独立 carrier Issue；任一 guard 失败则 report-only。 (验证完整 lifecycle，同时限制清理副作用。)
- Q: CI Sweeper 正向 fixture 前如何验证安全边界？ → A：先跑负向矩阵，再只跑一次正向 fixture；错误 Secret、项目/route/ref、普通 Note、错误 marker、carrier gate 未开启和 confirmation 不匹配全部 zero-write，不创建 pipeline/Issue/MR/branch。 (负向证据通过后才允许正向 provider write。)
- Q: CI Sweeper dogfood 结束后保留哪些证据？ → A：保留 source failure pipeline/job/artifacts、route decision、carrier notes、claim、repair MR 和 closeout artifacts；只删除 automated/ci-sweeper-gitlab-* branch，关闭本次独立 carrier Issue，不删除 pipeline/job/MR/artifacts。 (保留不可变审计证据，清理可再生运行资源。)
- Q: 独立 bridge 如何区分 webhook path？ → A：在 ZAgenticLoop 开源 core 增加通用 ZJ_LOOP_GITLAB_BRIDGE_WEBHOOK_PATH 配置；默认 /gitlab/webhook/issue-note，CI Sweeper 使用独立 path；不暴露任何闭源项目内部信息。 (以兼容默认值提供多 bridge 共存能力，route 分流由独立 path、marker 和 target route 共同约束。)
- Q: 下一步是否进入完整 CI Sweeper repair lifecycle dogfood？ → A：在测试 fork 中执行一次受控 synthetic failure，验证 failure → carrier Issue → repair MR → 人工合并 → closeout 全链路；生产项目保持隔离。 (Bridge 触发链路已通过，剩余风险集中在真实失败信号、repair MR 与 closeout。)
- Q: synthetic failure fixture 如何开启？ → A：默认关闭，只通过显式 CI 变量手动开启一次；只修改 .gitlab-ci.local.yml，不影响普通流水线，验证完成后删除或关闭 fixture。 (保持普通流水线稳定，fixture 可控、可回滚。)
- Q: carrier Issue 如何创建？ → A：由受控 ci-sweeper pipeline 自动创建全新的独立 carrier Issue；必须同时满足 API source、ZJ_LOOP_GITLAB_CARRIER_ENABLED=true、固定确认词和 bridge 身份绑定。 (验证事件驱动链路；任一 gate 失败保持 zero-write。)
- Q: repair MR 允许修改哪些文件？ → A：只修改测试 fork 的 .gitlab-ci.local.yml，关闭或恢复 synthetic failure gate；不修改业务代码和普通测试文件。 (保证验证 CI Sweeper 生命周期，不引入业务变更噪声。)
- Q: repair MR 如何进入主分支？ → A：自动化只创建 automated/ci-sweeper-gitlab-<pipeline-id>-<request-hash> 分支和 MR，目标为 master；由 Human 审核并合并。 (自动化不直接写入 master，保留人工审查边界。)
- Q: repair MR 合并后如何 closeout？ → A：仅在 MR 已合并、分支符合 allowlist、carrier identity 和固定确认词均通过后，自动追加 closeout evidence、删除 repair 分支并关闭对应 carrier Issue；任一条件失败则 report-only。 (验证完整生命周期，同时把清理副作用限制在本次受控 fixture。)
- Q: dogfood 完成后的证据如何处理？ → A：保留 source failure pipeline/job/artifacts、route decision、carrier notes、claim、repair MR 和 closeout evidence；只删除本次 repair 分支并关闭 carrier Issue。 (保留不可变审计证据，只清理可再生运行资源。)
- Q: 正向 fixture 前是否强制先跑负向矩阵？ → A：是。先验证错误 Secret、项目/route/ref、普通 Note、错误 marker、carrier gate 和 confirmation 不匹配全部 zero-write；通过后只执行一次正向 fixture。 (先证明安全边界，再执行 provider 写操作。)
- Q: 是否开始执行负向安全矩阵？ → A：开始执行，先验证全量 zero-write 安全边界，不进行 provider 写操作。 (先完成本地负向合同测试，再决定是否进入一次正向 fixture。)
- Q: 负向安全矩阵结果是什么？ → A：本地负向合同测试 10/10 通过，错误凭证、禁用 route、项目/route/ref 不匹配、普通 Note、provider 失败/不确定响应和响应绑定异常均 zero-write。 (命令：npm run build && node --test test/gitlab-issue-note-bridge-negative-matrix.test.mjs test/gitlab-issue-note-bridge-trigger.test.mjs test/gitlab-issue-note-bridge-server.test.mjs；未访问 GitLab。)
- Q: 负向矩阵通过后是否进入正向 fixture？ → A：进入测试 fork，开启一次显式失败 gate，创建 source failure pipeline，再触发 CI Sweeper 完整 repair lifecycle；只执行一次。 (负向安全边界已通过，正向 provider write 限定在测试 fork。)
- Q: 正向 fixture 的人工评审入口是什么？ → 测试 fork 已创建 draft MR !33，分支 codex/ci-sweeper-positive-fixture；仅修改 .gitlab-ci.local.yml，Human 合并后才能进入一次正向失败流水线。 (MR URL: https://git.bilibili.co/mlive-dev/ai-studio-gitlab/-/merge_requests/33)
- Q: 正向 synthetic failure 证据是什么？ → 测试 fork master pipeline 10581856 的 job 26218671 按预期失败，并上传 synthetic-failure-evidence.json；失败日志声明 side_effects_executed:false。 (Pipeline: https://git.bilibili.co/mlive-dev/ai-studio-gitlab/-/pipelines/10581856; Job: https://git.bilibili.co/mlive-dev/ai-studio-gitlab/-/jobs/26218671)
- Q: CI Sweeper 当前 install-ready 且 execution_ready=false，下一步是否推进 execution-ready？ → A：是。补齐 execution-ready 所需的配置、证据和验证门，再在测试 fork 中重跑一次受控 synthetic failure；生产项目保持隔离。 (当前 pipeline 10581876 仅完成 bridge 与 route dispatch，未创建 carrier/repair MR；必须先提升到 execution-ready 才能验证完整 repair lifecycle。)
- Q: execution-ready 后为什么仍未创建 carrier/repair MR？ → A：测试 fork 的 .gitlab-ci.local.yml 只有 Issue Note bridge 的 route/plan job，缺少 GitLab CI Sweeper carrier trigger、consumer preflight、repair-MR 和 closeout jobs；补齐生成式执行片段后再重跑 synthetic failure lifecycle。 (已验证：pipeline 10582044/job 26219391 返回 execution_ready=true 但只有 plan；synthetic failure pipeline 10582062/job 26219517 按预期失败并上传 side_effects_executed=false；测试 fork MR !35 补齐执行链路，CI pipeline 10582090 已通过。)
- Q: 消费者 preflight shell 失败后采取什么修复？ → 在测试 fork 创建 Draft MR !36，只修改 .gitlab-ci.local.yml，将 node -e 命令统一改为单引号包裹；流水线 10582322 已通过，等待人工合并后重跑完整 dogfood。 (失败作业 26220128 在括号处发生 shell syntax error，未创建 repair MR，side_effects_executed=false。)
- Q: consumer 配置门禁缺失后如何推进正向 dogfood？ → 保留 Issue #7 作为负向证据，并在测试 fork 创建 Draft MR !37：补齐 route table 的 verification_gate_allowlist、repair_actions、repair_scope、master branch allowlist，同时让 carrier 传入 ci-sweeper-repair-actions.json；MR 流水线 10582668 已通过，等待人工合并。 (consumer job 26223105 已正常运行到 verifier，返回 verification-gate-allowlist-missing、repair-actions-missing、repair-scope-missing，未 claim、未创建 repair MR。)
- Q: repair actions fixture 缺失后如何继续？ → 保留 Issue #8 对应的 carrier 负向证据，并创建 Draft MR !38 新增正确路径的 zj-loop/dogfood/ci-sweeper-repair-actions.json；MR 流水线 10582706 已通过，等待人工合并后重跑正向 dogfood。 (受控流水线 10582682 的 carrier job 26223467 成功但 request-body 返回 ENOENT，未生成 Issue Fix Request，未发生 provider 副作用。错误路径分支已废弃。)
- Q: 修正 fixture 负向证据编号 → 本次 carrier 未创建 Issue；仅保留流水线 10582682/job 26223467 的负向执行证据，Issue #7 仍是上一轮 request-actions 缺失的 carrier。 (不新增或关闭 Issue，避免把 ENOENT 失败误记为 provider carrier。)
- Q: GitLab Commit API 首次失败后如何补齐 fixture？ → consumer 已完成 claim、verification gate、repair action gate，但因目标文件缺失返回 repair-commit-create-failed；创建 Draft MR !39 新增 zj-loop/dogfood/ci-sweeper-generated-substrate-fixture.yml，MR 流水线 10582719 已通过，等待人工合并。 (正向请求 ifr_7ed08dcec250、Issue #8、consumer pipeline 10582716/job 26223760 均保留失败证据；未创建 repair MR。)
- Q: GitLab CI Sweeper 正向 repair MR 是否创建成功？ → 成功：master 流水线 10582730 通过；受控流水线 10582735/job 26223926 创建 Issue #9 与 request ifr_d6a802bc8dba；consumer pipeline 10582736/job 26223932 通过 claim、两项 verifier、action gate，并创建 repair MR !40。等待人工合并后执行 closeout。 (repair MR !40 branch=automated/ci-sweeper-gitlab-10582736-98de4c86，target=master，action_count=1，仅更新 zj-loop/dogfood/ci-sweeper-generated-substrate-fixture.yml。)
<!-- ROADMAP_SECTION_END -->
