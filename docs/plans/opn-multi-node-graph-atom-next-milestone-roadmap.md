<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-multi-node-graph-atom-next-milestone-roadmap.json` | 最后更新: 2026-08-09 10:10:53

[~][X+] 1. OPN Multi-node Graph Atom E2E 下一里程碑
├── [x][Y+] 1-1. Multi-node Graph Atom 场景与 Single-Agent baseline 增量
├── [x][Y+] 1-2. Human 中心责任单元与 Agent 节点组网
│   ├── [x][Y+] 1-2-1. Coordinator StateStore 原生 Graph read model 与 Human acceptance UI wiring
│   └── [x][Y+] 1-2-2. 真实 Graph phase/replay facts 驱动 Human Review read model
├── [x][Y+] 1-3. Directed Task Graph 编排、依赖与资源隔离
├── [x][Y+] 1-4. 多节点执行、Evidence 聚合与独立验证
├── [x][Y+] 1-5. Review Handoff、Human 决策与 closeout
├── [x][Y+] 1-6. 失败恢复、重放与端到端 conformance
│   └── [x][Y+] 1-6-1. deterministic full-chain Graph conformance fixture
├── [x][Y+] 1-7. 真实 Mac/Windows 三节点 Graph Atom dogfood 验收
│   ├── [x][Y+] 1-7-1. 独立 OPN Graph dogfood CLI 与 phase CAS wiring
│   └── [x][Y+] 1-7-2. Mac/Windows 真实 verification result 与 phase-native acceptance 验收
└── [~][Y+] 1-8. 本地开发 Provider Runtime 驱动的真实 Graph Atom 续跑
    ├── [x][Y+] 1-8-1. 创建绑定当前 Runtime 的 disposable Graph plan 与 worktrees
    ├── [x][Y+] 1-8-2. 初始化 execution 专属 ProviderAuthRef 与 TrustedRunner admission
    ├── [x][Y+] 1-8-3. 重新完成 Human approval 并 resume source execution
    └── [~][Y+] 1-8-4. 完成跨设备 independent verification 与 Human acceptance

### 当前施工：1-8-4-1. OPN gateway agent task/result 联调闭环

**决策：**
- Q: retry6 是否必须先经过 OPN gateway agent task/result 联调闭环？ → 是：先实现并验证 OPN gateway message-first 闭环，再启动 retry6；人工转述不能作为主验收路径。 (retry6 直接使用产品通路，覆盖本机第二 Agent 与 Windows Agent。)
- Q: 第一版 OPN Agent worker 采用单次 CLI 还是持续运行 worker？ → 采用持续运行的本地 gateway worker：自动创建/续期 session、receive/ack、bounded provider execution、幂等 agent.result reply 与断线重连；单次 CLI 仅作诊断工具。 (正式 co-work 主路径不能依赖人工重复执行 receive 命令。)
- Q: 第一版 worker 如何处理未授权、超范围或需要 Human decision 的 agent.task？ → 只自动执行已绑定且已授权的 agent.task；超出 capability、写入范围或需要 Human decision 时生成 human.action.request 并停在 pending，不自行执行。 (保持最小安全门槛与 Human 最终接受边界，同时避免把安全策略堆成联调阻塞。)
<!-- ROADMAP_SECTION_END -->
