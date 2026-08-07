<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-real-use-validation-milestones-roadmap.json` | 最后更新: 2026-08-07 18:35:00

[~][X+] 1. OPN 真实可用与用户价值验证里程碑
├── [x][Y+] 1-1. M1：长期开发测试版 Runtime Trust
│   ├── [x][Y+] 1-1-1. 完成 development artifact bootstrap 与 Human approval
│   └── [x][Y+] 1-1-2. 真实 signed Runtime dogfood 启动门禁通过
├── [x][Y+] 1-2. M2：同机 Multi-Agent Graph Atom
│   ├── [x][Y+] 1-2-1. 同机 Agent node enrollment 与中心责任单元
│   ├── [x][Y+] 1-2-2. 同机 Directed Graph 执行、Evidence 与 Human review
│   └── [x][Y+] 1-2-3. 同机真实双 Agent 只读任务通过
├── [~][Y+] 1-3. M3：跨设备 Multi-node Graph Atom
│   ├── [x][Y+] 1-3-1. 跨设备 pairing、device identity 与 secure transport
│   ├── [x][Y+] 1-3-2. 跨设备 reconnect、replay 与 StateStore 协作
│   └── [~][Y+] 1-3-3. 跨设备真实三节点只读任务通过
├── [ ][Y+] 1-4. M4：写入型 OPN Development Job
│   ├── [ ][Y+] 1-4-1. 任务编排资源隔离检查与 worktree 策略
│   ├── [ ][Y+] 1-4-2. 多 Agent commit、中心合并与合并后验证
│   └── [ ][Y+] 1-4-3. 真实写入型开发任务 Human accept 通过
└── [ ][Y+] 1-5. M5：真实用户价值 Dogfood
    ├── [ ][Y+] 1-5-1. 选择真实 dogfood 任务并建立 baseline
    ├── [ ][Y+] 1-5-2. 记录用户价值、体验和失败恢复反馈
    └── [ ][Y+] 1-5-3. 根据真实反馈规划下一里程碑

### 当前施工：1-3-3-3-4. 基于 OPN 通路的 Agent adapter 协作

Join API/CLI、CSR 签发、Windows join、Human approval 与 enrollment projection 已完成；跨设备 Co-work Channel 仍由 1-3-3-3 承载。

当前已完成真实 Transport HTTP server 的 Core wiring：mTLS session、sender-bound envelope、StateStore offered/acknowledged facts 与 credential token verifier；Mac 中心节点已具备本地 StateStore-backed receive/ack 与 Inbox projection，并已用真实 Windows 消息验证。新增 provider-neutral Transport CLI：Windows `receive` 每次建立新 session 并 ack，Mac `local-send` 通过中心 StateStore 发回；Human OPN UI 已展示 Inbox projection。已完成真实 Mac↔Windows 双向消息、断开后新 session 重连、双端 CLI receive/ack 与 Mac OPN Inbox UI 运行验收。当前进入受控 Artifact 文件传输与完整性校验。

**当前子树：**
├── [x][Y+] 1-3-3-2-1. Windows Agent 本地 P-256 身份与证书 bootstrap
└── [x][X+] 1-3-3-2-2. Windows CSR 签发、真实 join request 与 Human approval

1-3-3-3-2 已完成真实 Mac↔Windows 双向消息、断线后新 session 重连、双端 CLI receive/ack 与 Mac OPN Inbox UI 验收。
1-3-3-3-3 已实现 bounded content-addressed ArtifactStore、HTTP metadata/byte transfer、digest 校验、StateStore transfer facts 与 `artifact-send`/`artifact-download` CLI，并完成真实 Windows→Mac endpoint→Windows round-trip 验收：Mac 返回 `verified`，Windows 本地 ArtifactStore 返回 `store_status: stored`。
当前进入基于 OPN 通路的 Agent adapter 协作；不得把 Agent provider 直接耦合进核心 Transport。
已完成第一条 adapter tracer bullet：`agent.task` → NativeAgentRuntime → result Artifact → `agent.result` → input ack；下一步接入现有 provider-neutral 本机 Agent provider，并用真实 Mac↔Windows task 协作验收。
<!-- ROADMAP_SECTION_END -->
