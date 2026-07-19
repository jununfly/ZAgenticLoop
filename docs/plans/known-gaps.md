# Known Gaps

本文件记录明确延期、尚未构成当前版本产品能力的事项。Checklist 未全部完成前，任何 agent 都不得把对应的 adapter、部署实验、本地测试或单次 provider 结果描述为产品结论、trusted automation capability 或 live completion evidence。

## GitLab Webhook Issue Triage 适配

**状态：** Deferred from current version

**范围边界：**

- `mlive-dev/ai-studio-gitlab` 仅作为独立 Webhook bridge 的验证服务器/容器。
- `mlive-dev/ai-studio` 承载主要代码、CI consumer、Issue Triage 和最终业务验证。
- 周末不执行 UAT-Caster、Webhook、真实 pipeline 或其他线上变更。
- 已存在的 ZAgenticLoop bridge 代码、vendor 包、部署分支和本地测试属于探索性/基础设施准备，不代表本能力已发布。

**后续版本完成清单：**

- [ ] 明确版本目标、产品 owner、GitLab 项目绑定和 Route Table 固定映射。
- [ ] 独立 bridge 只校验固定 project、Issue Hook、event ID、secret 和 marker。
- [ ] webhook secret 与 pipeline trigger token 分离，并通过运行时 Secret 注入。
- [ ] bridge 只触发固定 `master` API pipeline，不接受 webhook 提供的任意 project/ref/route。
- [ ] `CI_PIPELINE_SOURCE=api` 的 Issue Triage consumer 入口接入 `ai-studio`，并生成统一 envelope、receipt、dedupe、route 和 trigger artifacts。
- [ ] 默认路径保持 report-only；Issue 状态/标签写入必须有独立、可审计的显式确认。
- [ ] 完成错误 secret、项目不匹配、事件不允许、普通 Note、非匹配 marker 的 zero-write 矩阵。
- [ ] 完成 webhook 重放 duplicate、trigger-failed、trigger-uncertain 和显式 recovery 矩阵。
- [ ] 在 GitLab 可访问的 HTTPS bridge endpoint 上完成真实 Issue Note -> bridge -> API pipeline positive evidence。
- [ ] 验证 artifact 完整绑定 project、Issue IID、Note ID、event ID、target route、`master` ref 和 pipeline ID。
- [ ] 明确 Webhook、carrier Issue、marker Note、pipeline 和 artifact 的保留/禁用/轮换策略。
- [ ] 通过 human review、promotion gate 和版本发布决策后，才能将此能力从 known gap 移回版本路线图。

**当前版本结论：**

本版本不声明支持 GitLab Webhook 驱动的 Issue Triage，不启用全自动 provider write，也不将已有探索性实现计入 `1-5-5-3-4` 完成证据。

**发布策略：**

- [x] 正常版本继续发布，其他产品功能不受影响。
- [x] GitLab Webhook 对用户明确显示为 `disabled/unavailable`。
- [x] 未完成本清单前，不启用 Webhook route、runtime secret 或 provider write。
- [x] 发布能力说明和 endpoint 都采用稳定的 `webhook-unavailable` 表达，且误调用始终零 provider side effect。
- [x] Route Table 和运行时默认保持 `enabled=false`，普通环境变量不能绕过 promotion gate。
- [x] 只有 Human 批准的 promotion PR 才能重新开启，Secret 注入本身不能启用。
- [x] 当前版本只实现只读 capability check/artifact，证明 `status=unavailable`、`enabled=false`、`provider_writes_allowed=false`；不实现 trigger 或 provider write。
- [x] capability enum 固定为 `status: available|unavailable|blocked|unknown` 与 `planning_status: in_scope|deferred|completed|superseded`。
- [x] 该 deferred gap 只阻塞 Webhook capability 和对应路线图节点，不阻塞其他产品功能发布；整体版本状态仍必须展示该 gap。
- [x] agent 收到当前版本的 Webhook 请求时必须 hard stop：`status=unavailable`、`planning_status=deferred`、`side_effects_executed=false`，不调用 API、不自动降级。
- [x] 对外声明固定为“GitLab Webhook Issue Triage 暂不可用（deferred）；其他产品功能正常”，不承诺具体上线日期。
- [x] Webhook 只作为独立 route-specific ledger cell，不污染其他 capability 状态。
- [x] ledger route identity 固定为 `gitlab-issue-note-bridge`；不冒充 `issue-triage`、`issue-triage-action` 或 `issue-triage-transition`。
- [x] Route Table 保留完整但 disabled 的 `gitlab-issue-note-bridge` 条目，声明 capabilities/verifiers，供 doctor/ledger 检查。
- [x] route capability 分为 `declared_capabilities`、`verified_capabilities`、`verifiers`；当前 verified 集合为空，仅验证 route、disabled 和 zero-side-effect。
- [x] bridge declared scope 仅包含 `webhook-envelope-validation`、`receipt-dedupe`、`fixed-api-trigger`；Issue Triage 与 provider write 不归 bridge。
- [x] capability artifact 采用统一 `zj-loop.capability.v1` envelope 与 route-specific `zj-loop.gitlab_issue_note_bridge_capability.v1`。
- [x] doctor 默认报告 deferred gap 并成功结束；仅严格 `--require-complete` 模式因该 route 未完成而失败。
- [x] artifact 只记录 provider/project/route 和 capability 状态，可记录 auth_source 名称；禁止记录 Secret、Token 或完整 payload。
- [x] disabled check 本地覆盖正常配置、缺失/非法 Route、越权开启和 zero-write；不访问 GitLab。
- [x] capability artifact 由 doctor/CI 动态生成并保存为运行证据，不提交生成快照。
- [x] capability artifact 默认保留 90 天，覆盖一个完整版本周期；只保留脱敏状态。
- [x] 只读 capability artifact 归入 doctor/ledger 与 control-evidence/matrix verifier，不打开 deferred 的 `1-5-5-3-4`。
