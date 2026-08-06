<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-real-use-validation-milestones-roadmap.json` | 最后更新: 2026-08-06 22:17:21

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

### 当前施工：1-3-3-2. Windows Agent 身份初始化与一次性 pairing request

Join API/CLI 与 identity bootstrap 已完成；尚需真实 CSR 签发、Windows join、Human approval、enrollment projection。

**当前子树：**
├── [x][Y+] 1-3-3-2-1. Windows Agent 本地 P-256 身份与证书 bootstrap
└── [ ][X+] 1-3-3-2-2. Windows CSR 签发、真实 join request 与 Human approval
<!-- ROADMAP_SECTION_END -->
