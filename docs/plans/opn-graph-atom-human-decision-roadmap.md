<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-graph-atom-human-decision-roadmap.json` | 最后更新: 2026-07-31 22:41:54

[~][X+] 1. OPN Graph Atom Human Decision 下一里程碑
├── [X][Y+] 1-1. Human Acceptance Authority Contract
├── [ ][Y+] 1-2. Review Handoff Acceptance CAS Fact
├── [ ][Y+] 1-3. Graph Review Event-level Accept UI
├── [ ][Y+] 1-4. Acceptance Negative Matrix与Replay验证
└── [ ][Y+] 1-5. Human Acceptance End-to-end Conformance

### 已完成：1-1. Human Acceptance Authority Contract

**决策：**
- Q: 事件级最终接受请求需要绑定哪些内容？ → 必须绑定 network_id、event_id、plan_id、plan_revision、plan_digest、review_handoff_digest、verification_digest、Human identity、signer fingerprint、decision=accepted、accepted_at、HumanSigner 签名和 canonical payload digest。接受事实只表示 Human 接受当前 Review Handoff，不伪装 Agent 执行成功或绕过 Verification。 (保持 Human 决策、Agent Execution、独立 Verification 三层责任分离。)

**实现证据：** `tools/zj-loop-core/src/human-acceptance.ts` 提供 provider-neutral `createHumanAcceptance` 与 `validateHumanAcceptance`；`test/human-acceptance.test.mjs` 覆盖成功、blocked handoff、scope/digest/signature 篡改 fail-closed。下一步进入 `1-2 Review Handoff Acceptance CAS Fact`。
<!-- ROADMAP_SECTION_END -->
