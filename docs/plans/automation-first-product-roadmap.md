<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-15 18:16:45

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

### 当前施工：1-5-3-1-5-2-3. Target-project tarball rollout and owned scheduled artifact evidence

2026-07-15 ai-studio live dogfood: deployed fresh core/init tarballs to zjal-gitlab-yaml-folded-script-fix with runner tag jinkela-k8s-runner-jscs-05 and reachable internal Node image. Probe job 25926933 created owned schedule 959; GitLab consumed the schedule but produced no source=schedule pipeline before deadline. Artifact recorded scheduled-pipeline-missing with poll_errors=0, while guarded cleanup removed 959 and state recorded cleanup_outcome=cleaned. Existing schedule 957 was unchanged.

**决策：**
- Q: Probe CLI reports escalation but GitLab job is success → Treat this as a follow-up defect: scheduled-pipeline-missing must propagate a nonzero process exit or explicit workflow health failure after artifact upload. (The live artifact proved the current CLI exits 0 for an escalated result, which obscures the missing evidence in GitLab job status. Keep the artifact and guarded cleanup behavior, but add a deterministic failure mapping before accepting scheduled live evidence as complete.)
- Q: 手动触发的 owned schedule probe 默认应指向哪个 ref？ → 默认使用 CI_COMMIT_REF_NAME；检查默认分支长期调度健康时，才显式传 --ref "$CI_DEFAULT_BRANCH"。 (测试分支的安装验证与默认分支生产健康是两类证据。默认跟随当前 job ref 才能验证刚部署的 CI bundle，不再隐式把临时 schedule 固定到默认分支。)
- Q: probe 已上传 artifact 但结果为 escalated 时，CI 应如何退出？ → 使用固定 exit 2；completed 为 0，refused/usage error 为 1，SIGINT 为 130，SIGTERM 为 143。 (让 GitLab job 状态与结构化 result 一致，同时保留 130/143 的取消语义，避免把 escalation 误显示为成功。)
- Q: owned schedule 与 scheduled pipeline 的归属如何做到无歧义？ → 以 owned_schedule_id 的 schedule detail 中 last_pipeline.id 为唯一锚点；再验证 pipeline.source=schedule、pipeline.ref=temporary_schedule.ref、pipeline.created_at>=armed_at。任何缺失或不一致均 escalation、上传 artifact、exit 2 并 guarded cleanup。 (不使用基于 source/ref/time 的候选匹配 fallback。模板默认传 CI_COMMIT_REF_NAME，默认分支健康检查才显式传 CI_DEFAULT_BRANCH。)
- Q: owned probe 成功是否必须验证 scheduled pipeline 内的 receipt artifact？ → 必须。成功链路固定为 owned schedule -> exact last_pipeline.id -> source=schedule pipeline -> 专属 receipt job -> schedule-probe-receipt.json -> probe 校验 -> guarded cleanup。 (创建 schedule 时注入唯一 ZJ_LOOP_SCHEDULE_PROBE_ID；receipt artifact 回显 probe_id、pipeline id、ref 与 schema。仅创建 pipeline 或候选匹配都不能作为成功证据。)
- Q: receipt job 的自动触发与副作用边界是什么？ → 仅在 CI_PIPELINE_SOURCE=schedule 且 ZJ_LOOP_SCHEDULE_PROBE_ID 非空时自动运行；needs: []、allow_failure: false、短 timeout，使用 bundle 配置的 image/runner tags。 (它不进入 Route Decision、不消费 Issue Fix Request、不创建 schedule；只写 schedule-probe-receipt.json 与最小 replay state。普通 schedule（如 957）没有 probe id，因此完全不触发。)
- Q: probe id 如何写入和验证，才能成为创建、receipt 与 cleanup 的共同身份？ → 创建 schedule 时原子写入 ZJ_LOOP_SCHEDULE_PROBE_ID=<probe-id>；创建后与 cleanup 前都重新读取并验证 marker、ref、cron、timezone、变量值完全一致。 (变量创建/回读不支持则 arm 失败；若资源已创建，仅在完整 identity 匹配时立即清理。任何漂移拒绝 DELETE 并 escalation。)
- Q: receipt artifact 的最小硬 schema 是什么？ → 固定 zj-loop.gitlab_schedule_probe_receipt.v1，必含 probe_id、pipeline_id、project、ref、source=schedule。 (probe 必须用 exact last_pipeline.id 定位 pipeline，再定位固定 job zj_loop_schedule_probe_receipt，下载 artifact 并逐字段验证；job、artifact、JSON、schema 或字段任一缺失/不一致均 exit 2 后 cleanup。)
- Q: escalated exit 2 时如何避免 GitLab shell 吞掉结构化证据？ → fragment 必须以 set +e 运行 CLI、捕获 exit_code、恢复 set -e、cat schedule-probe-result.json，再以原 exit_code 退出；artifact 维持 when: always。 (completed 保持 0；escalated 可见 result 后以 2 失败；SIGINT/SIGTERM 保持 130/143。这样 shell、job 状态与 artifact 的事实一致。)
- Q: GitLab image 的通用默认与 ai-studio dogfood 应如何分层？ → 发布 bundle 继续默认 node:22；ai-studio dogfood 显式 pin hub.bilibili.co/nyx-compile/bilibili-nodejs-debian12@sha256:1d9b33a6a995d34ba57623a66f60c7564fbe41180bb53d49e82bc01770196290。 (通用默认保持跨项目可移植；target project 用 zj-loop-init --gitlab-image 传入自身可达镜像。Node 22.21.1 digest 避免 Docker Hub 不可达与 tag 漂移。)
- Q: 定位到 owned last_pipeline 后，receipt job 的等待、失败与 cleanup 边界是什么？ → receipt success 且 artifact 校验通过立即 cleanup 并 completed；failed/canceled 立即 cleanup 后 escalated exit 2；pending/running/缺 artifact 每 30 秒轮询到原始 deadline，随后 cleanup escalated exit 2。 (API 临时失败仅记录低成本计数并有界重试，不延长 deadline；cleanup 漂移或失败保留 state 并 escalated，不自动重试。pipeline、receipt、cleanup 组成同一有界事务。)

**当前子树：**
├── [x][Y+] 1-5-3-1-5-2-3-1. Atomic owned-schedule probe variable and full cleanup identity guard
├── [x][Y+] 1-5-3-1-5-2-3-2. Exact owned-schedule last-pipeline correlation and ref validation
├── [x][Y+] 1-5-3-1-5-2-3-3. Scheduled receipt job fragment and generated-bundle contract gates
├── [x][Y+] 1-5-3-1-5-2-3-4. Receipt artifact polling, validation, and escalation exit-code mapping
└── [ ][Y+] 1-5-3-1-5-2-3-5. Pinned-image ai-studio tarball dogfood with receipt and cleanup evidence
<!-- ROADMAP_SECTION_END -->
