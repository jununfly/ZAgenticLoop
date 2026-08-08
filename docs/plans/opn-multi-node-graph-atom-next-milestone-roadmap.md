<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-multi-node-graph-atom-next-milestone-roadmap.json` | 最后更新: 2026-08-08 18:44:14

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

### 当前施工：1-8-4. 完成跨设备 independent verification 与 Human acceptance

已修复并测试 Runtime adapter contract digest wiring；准备重新执行真实 provider launch。

**决策：**
- Q: 真实 Provider Runtime 的 adapter contract digest 如何绑定到 Graph execution？ → bind-admission 必须读取当前 Runtime IPC binding，并将其 adapter_contract_digest 绑定进 approval summary 与 worker context；不能继续使用启动前独立推导的 digest。 (修复 provider-runtime-launch-handle-missing 前的 contract mismatch，保持 Runtime binding 与 admission 四方一致。)
<!-- ROADMAP_SECTION_END -->
