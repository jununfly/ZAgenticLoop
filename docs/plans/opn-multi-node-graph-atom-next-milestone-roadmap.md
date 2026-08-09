<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-multi-node-graph-atom-next-milestone-roadmap.json` | 最后更新: 2026-08-09 13:40:59

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

### 当前施工：1-8-4-2. retry6 真实 OPN independent verification 与 Human acceptance

**决策：**
- Q: retry6 如何让 Graph lifecycle 与真实 OPN network/UI approval 对齐？ → 同意：real-agent-dogfood start 接受显式 --network-id 并将其写入 lifecycle、approval summary 和后续 Graph phase；Human Approval UI 读取同一 network 的 pending approval summary，通过现有 HumanSigner 签署 real-agent-dogfood.approve，并原子写入 resume 消费的 approval envelope。UI 支持固定本地端口、前台常驻和跨平台 --open。 (修复 retry6 真实 wiring 阻塞；未传 --network-id 时保留随机网络兼容行为。)
<!-- ROADMAP_SECTION_END -->
