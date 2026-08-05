<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `opn-multi-node-graph-atom-next-milestone-roadmap.json` | 最后更新: 2026-08-05 20:00:15

[~][X+] 1. OPN Multi-node Graph Atom E2E 下一里程碑
├── [x][Y+] 1-1. Multi-node Graph Atom 场景与 Single-Agent baseline 增量
├── [~][Y+] 1-2. Human 中心责任单元与 Agent 节点组网
├── [x][Y+] 1-3. Directed Task Graph 编排、依赖与资源隔离
├── [~][Y+] 1-4. 多节点执行、Evidence 聚合与独立验证
├── [x][Y+] 1-5. Review Handoff、Human 决策与 closeout
└── [~][Y+] 1-6. 失败恢复、重放与端到端 conformance

### 当前施工：1-2. Human 中心责任单元与 Agent 节点组网

中心责任单元冻结为 Human + Coordinator Agent；Agent1/Agent2 是被编排执行节点。Coordinator 可推进 DAG、聚合 Evidence，但不能替代 Human 做最终接受、拒绝或责任决策。

**决策：**
- Q: 第一条 Graph Atom 的中心责任单元如何定义？ → 同意选 1：Human + Coordinator Agent 构成中心责任单元；Agent1 和 Agent2 是被编排执行节点。Coordinator 可推进 DAG、聚合 Evidence，但不能替代 Human 做最终接受、拒绝或责任决策。 (保持 Human 的最终责任、权限和决策不对称，同时验证 Agent 辅助中心编排的 ScaleUp 价值。)
- Q: Coordinator、Agent1、Agent2 的 capability 如何划分？ → 同意选 1：按角色、任务、worktree、Evidence scope 做 capability ceiling；Coordinator 只能编排/聚合/准备 merge proposal，Agent1 只能写自己的 worktree，Agent2 只能读验证 worktree，Human 批准 merge 并作最终决策。 (Human 与 Agent 协议对称但责任、权限和最终决策不对称；任何节点不得通过 capability 扩张越过中心责任或资源边界。)
<!-- ROADMAP_SECTION_END -->
