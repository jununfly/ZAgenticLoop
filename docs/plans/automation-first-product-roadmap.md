<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `automation-first-product-roadmap.json` | 最后更新: 2026-07-27 02:04:11

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
├── [~][Y+] 1-5. GitHub 与 GitLab 的 live 能力对齐
│   ├── [x][Y+] 1-5-1. Provider adapter completion evidence mapping
│   ├── [x][Y+] 1-5-2. GitHub required-route live and recovery reference evidence
│   ├── [x][Y+] 1-5-3. GitLab signal and request-carrier live adapter parity
│   ├── [x][Y+] 1-5-4. GitLab branch MR review and closeout live adapter parity
│   └── [~][Y+] 1-5-5. GitLab required-route reference dogfood
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

### 当前施工：1-5-5-8-1. Durable agent-local handoff envelope and GitLab state-branch persistence

Protocol and read/claim adapter implemented; handoff creation bridge integration, protected state-branch provisioning, and live GitLab replay remain in progress.

**决策：**
- Q: B1 handoff 的持久化真相源是什么？ → 目标 GitLab 项目的受保护 zj-loop-state 分支，按 handoffs、claims、executions、evidence 路径保存 append-only JSON；state-writer credential 与 Pipeline Trigger Token 分离。 (使用 [skip ci] 避免 state branch 产生业务 Pipeline；不写 master，实例磁盘重置不影响 Mac Codex 恢复待认领任务。)
- Q: Execution Request 如何绑定 Registration？ → 使用 immutable commit SHA + 文件路径 + SHA-256 digest；普通 A 请求也快照默认 Registration，B1/B2 请求必须显式提供固定绑定；只提供 branch/master 或未提交 Registration 直接 blocked。 (bridge 校验后将 Registration snapshot 写入 handoff/envelope；执行期间不重新读取漂移后的 Registration。)
- Q: B1 请求到达 bridge 后，bridge 执行什么副作用？ → 仅创建一个 durable handoff，并写入 receipt/dedupe record；返回 202 handoff-created；不触发 Pipeline、不调用 Mac、不写 Issue/Note/MR、不修改 master。 (B1 必须显式 opt-in；同一 event_id/dedupe_key 只创建一个 handoff；Mac Codex 不在线不算失败，handoff 保持 pending。)
- Q: B1 的 handoff_id/request_id 由谁生成？ → 由 bridge 基于已验证的 project、event_id、dedupe_key、Issue/Note 生成稳定 identity；Note 只能声明 route、executor override 和 Registration binding，不能自由指定 request identity。 (同一 webhook 重放得到同一 handoff；冲突或伪造 request_id blocked；handoff_id 统一关联 state、claim、execution、MR evidence。)
- Q: zj-loop-state 分支如何初始化？ → 由 Human/Admin 预先创建并保护，写入基础目录和 [skip ci] 规则；bridge 不自动创建或从 master 派生 state branch。分支缺失、未保护或权限不符合直接 blocked。 (初始化、保护、state-writer 权限配置属于部署前置；adapter 只负责既有 state branch 的 append-only 读写。)
- Q: state branch 的写入提交如何组织？ → 每个状态变更创建一个带 [skip ci] 的 GitLab commit，claim 使用 expected HEAD SHA 做 CAS；只追加/创建对应 JSON，不覆盖历史 evidence，不 force push、不 squash/rebase。 (提交历史本身是审计日志；HEAD 冲突返回 already-claimed 或 state-conflict。)
- Q: B1 handoff 状态转移允许哪些路径？ → 允许 pending→claimed→running→completed；claimed/running 可转 blocked 或 released；blocked/released 仅通过显式 recover/re-claim 产生新 claim/recovery evidence 后回到 claimed；completed 不可逆。 (禁止无 claim 直接 running、旧 claim 覆盖新 claim、自动恢复，以及 completed→claimed/running。)
- Q: B1 handoff envelope 的最小字段集是什么？ → 使用 zj-loop.agent_handoff.v1，包含 handoff/request identity、status/created_at、GitLab project/Issue/Note/event/dedupe source、route_id、executor kind/profile/capabilities、Registration commit/path/digest、workspace project/base ref/base commit、claim 和 side_effects_executed；不保存完整 webhook payload。 (字段集服务于审计、claim、worktree 重建、MR 关联和 replay；provider 原始 payload 只在 bridge 内存中校验。)
- Q: B1 bridge如何选择并持久化agent-local handoff？ → 仅接受Note中的显式隐藏JSON Registration commit/path/sha256合同；bridge校验项目、路由、注册快照和agent-local allowlist后写入受保护zj-loop-state，A默认路径仍触发GitLab Pipeline，禁止自动A→B回退。 (第二切片实现；handoff只产生durable state，不创建Pipeline、Issue、Note、MR或master写入。)
<!-- ROADMAP_SECTION_END -->
