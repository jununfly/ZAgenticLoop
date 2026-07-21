<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-22 00:58:35

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

### 当前施工：1-5-5-6-5. generated CI、vendor 包与目标项目版本一致性门禁

已完成实现首个 vertical slice：core 新增 zj-loop-version-consistency CLI 与 version-consistency-result.v1，校验 version-lock、core 版本、生成文件 hash、模板 hash、实际引用和 vendor SHA256；init 在 GitHub/GitLab bundle 安装/升级时生成 zj-loop/version-lock.json，并在生成 job 前置执行 gate、上传 evidence。core 0.1.10/npm tests 340 passing；init tests 32 passing；generated bundle gate、provider parity gate、真实本地 GitHub version check healthy。剩余：发布 core 0.1.10，目标 ai-studio 通过 MR 更新并完成正常/漂移负向 dogfood。

**决策：**
- Q: 版本一致性门禁要求绑定哪些证据？ → A：绑定 checkout commit、vendor tarball SHA256、generated CI template hash 与目标项目实际引用路径 (任一版本或引用路径不一致都 fail-closed，禁止进入 GitLab 副作用路线。)
- Q: 生成 CI、vendor 包与目标项目版本的唯一真相源是什么？ → 采用 A：由仓库中的单一版本清单统一生成；记录 core 版本、vendor tarball 路径、SHA256 与生成模板 hash，初始化器、模板和审计器统一读取，不一致时 fail-closed。 (避免 0.1.7、0.1.8、0.1.9 等版本在生成器、模板、vendor 和目标项目中漂移。)
- Q: 目标项目如何证明实际运行版本与版本清单一致？ → 采用 A：目标项目提交 zj-loop/version-lock.json，记录 core 包版本、vendor tarball 相对路径、SHA256、生成模板 hash 和期望 CI 引用；CI 启动阶段校验 checkout、vendor、模板和实际命令参数，不一致时 fail-closed。 (防止目标项目手动修改 YAML、替换 vendor 包或切换旧分支后仍进入副作用流水线。)
- Q: 版本锁定校验失败时阻断哪些 job？ → 采用 A：所有 ZJ Loop job 在最前置阶段统一失败，包括 report-only、health、carrier、claim、repair、closeout；先输出结构化 version-drift evidence，再阻止后续 route 执行。 (避免旧版本产出的 report 或 health 被误认为当前版本正向证据，也避免任何副作用路径绕过版本门禁。)
- Q: 版本升级流程如何授权？ → 采用 A：单个 PR/MR 原子更新版本清单、vendor tarball、SHA256、生成模板、初始化器默认值和测试；本仓库门禁通过后，目标项目通过独立 MR 更新 version-lock.json，人工合并后才允许新版本进入目标项目。 (禁止只改版本号或只替换 vendor，确保 core、生成 CI、初始化器和目标项目的升级边界一致且可审计。)
- Q: 版本一致性门禁的完成验证范围是什么？ → 采用 A：全量生成器回归、版本漂移负向测试和一个真实目标项目验证；覆盖所有生成模板的版本引用、vendor SHA256、version-lock 校验，并验证旧版本、错误 hash、错误路径、模板漂移均 fail-closed；最后在 mlive-dev/ai-studio 验证正常配置与人为漂移配置。 (既证明本仓库生成逻辑，也证明真实 GitLab 目标项目不会带着漂移版本进入 route。)
- Q: 版本一致性校验应输出什么 evidence？ → 采用 A：新增统一 version-consistency-result.json；包含 schema、status、checkout SHA、core package/version、vendor path/SHA256、template hash、version-lock hash、expected/observed 对比、failure reason、pipeline/job provenance 和 side_effects_executed=false；每个 ZJ job 上传，失败状态为 blocked。 (让 health verifier、审计器和 replay 能稳定消费版本门禁结果，避免把版本可信度混入 route-decision 语义或依赖日志解析。)
- Q: 版本一致性门禁的 provider 覆盖范围是什么？ → 采用 A：GitHub 与 GitLab 的全部生成 CI 一次覆盖；共享 version-lock.json、version-consistency-result.json 和校验逻辑，避免只修复 GitLab 后 GitHub 保留同类版本漂移。 (生成器、目标项目和审计器保持跨 provider 一致的 fail-closed 版本边界。)
- Q: core 0.1.10 的发布顺序如何执行？ → 采用 A：先创建 PR，由 Human 合并；合并后发布 core 0.1.10，再更新 ai-studio。 (符合原子升级和人工授权边界，目标项目只引用已合并且已发布的版本。)
- Q: core 0.1.10 合并后的发布入口是什么？ → 采用 A：合并到默认分支后创建 zj-loop-core-v0.1.10 tag，由 tag 自动触发 release workflow；workflow checkout 精确 tag 后执行 npm ci、build、全量测试和 npm provenance publish。 (发布包严格绑定已审查且已合并的提交，避免从浮动默认分支发布或误选旧 tag。)
<!-- ROADMAP_SECTION_END -->
