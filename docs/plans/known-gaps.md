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
