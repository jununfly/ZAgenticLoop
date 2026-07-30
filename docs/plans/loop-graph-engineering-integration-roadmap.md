<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `loop-graph-engineering-integration-roadmap.json` | 最后更新: 2026-07-30 23:33:28

[~][X+] 1. Loop Engineering与Graph Engineering产品融合
├── [~][X+] 1-1. Loop Engineering与Graph Engineering统一心智模型
├── [ ][X+] 1-2. Loop与Graph协同的端到端用户体验路径
├── [ ][X+] 1-3. OPN产品能力与技术架构融合边界
└── [ ][X+] 1-4. 下一实现里程碑与行为验收边界
    ├── [x][X+] 1-4-1. single-agent-opn-atom.v1 baseline fixture
    ├── [x][X+] 1-4-2. 本机双Agent Human-controlled enrollment与Node Identity
    ├── [x][X+] 1-4-3. SQLite StateStore、ArtifactStore与loopback Relay
    ├── [x][X+] 1-4-4. Directed Task Graph与OrchestrationPlan
    ├── [x][X+] 1-4-5. orchestration-and-isolation preflight
    ├── [ ][X+] 1-4-6. Human Grill、blocked/recovery与重新preflight
    ├── [ ][X+] 1-4-7. Codex与Workbuddy两阶段Native OPN Tracer
    ├── [ ][X+] 1-4-8. deterministic gate、独立语义审查与Review Handoff
    └── [ ][X+] 1-4-9. Graph Engineering Evidence Set与最终conformance验收

### 当前施工：1-1. Loop Engineering与Graph Engineering统一心智模型

**决策：**
- Q: Loop Engineering与Graph Engineering是什么关系？ → 二者是正交但组合的产品层：Loop Engineering处理单个目标在时间维度上的发现、执行、验证、修正和交付闭环；Graph Engineering处理多个Human/Agent/设备节点在空间与关系维度上的组网、身份、能力、权限、路由、协同、责任和恢复。ZAgenticLoop通过二者融合实现OPN。 (Graph Engineering不是Graph Database、普通DAG工作流或Agent群聊；拓扑只是其一部分，核心是节点、责任、能力、事件和状态关系。)
- Q: Graph Engineering中的图由什么构成？ → 采用由可审计协议关系生成的多层图，而不是用户自由绘制的拓扑图：Identity Graph、Capability Graph、Authority Graph、Event Graph和State Graph分别表示身份、能力、授权、事件参与和生命周期关系。用户可调整策略、授权和委托，但不能通过绘制边直接获得权限；Event Graph是Network Graph上的临时投影。 (每条边必须有来源、有效期、作用域和撤销记录，避免把视觉拓扑误当成运行时权威。)
- Q: 如何用递归、迭代和ScaleUp/ScaleOut理解ZAgenticLoop架构？ → 采用三层算法思想：递归将复杂目标、任务图和网络拆成仍保持明确目标、有限权限、可执行工作、验证、证据与责任决策或停止的更小实例；迭代在原子契约上叠加状态、证据、约束和委托，每次暴露输入、输出、进展、失败和下一决策；只有当原子或迭代单元在协议、隔离、幂等、权限上限、资源预算和验证语义上可组合时，才允许ScaleUp或ScaleOut到更多任务、节点或网络。 (递归保证去掉枝叶后仍完整正确，迭代提供复杂场景适应性，ScaleUp/ScaleOut只复制已证明可组合的能力，不把并行数量误当产品价值。)
- Q: ZAgenticLoop的最小完整产品原子是什么？ → 采用Single-Agent OPN Atom：Human委托一个独立enrolled Agent执行一个有价值且有界的MessageEvent，Agent完成Execution并返回Evidence和Review Handoff，Human做最终决策或明确停止。Human-only Loop Atom只能证明目标有价值和成功标准，不能证明OPN的生产能力杠杆；必须有Agent参与才能验证网络化效率提升。 (把产品原子从‘任务能完成’提升到‘Human通过Agent节点获得可验证的能力杠杆’，同时保留责任、权限和证据闭环。)
- Q: Single-Agent OPN Atom中Human与Agent的交互粒度是什么？ → Human负责目标、约束、授权和最终Review；Agent在授权范围内独立完成内部Loop，不要求Human持续逐步提示或批准。流程为Human定义目标与约束、授予有界能力、Agent发现/执行/验证、返回Evidence和Review Handoff、Human执行accept/revise/recover/reject；风险、歧义、权限不足、预算耗尽、验证失败或恢复时才中途唤回Human。 (保留Human责任而不把Agent退化成需要持续遥控的工具，形成可验证的效率杠杆。)
- Q: Single-Agent OPN Atom如何证明效率杠杆？ → 至少记录并比较Human从目标提出到最终决策的总耗时、主动介入次数和原因、Agent独立完成的有效步骤、Review Handoff是否足以支持决策、验证通过率与返工次数、blocked/recovery可解释性和未授权副作用（必须为0），并与Human-only完成同类任务的baseline比较。核心判断是Human是否用更少协调成本获得更多可验证且可负责的有效产出，而不是Agent动作数量。 (将OPN价值绑定到可验证结果和Human协调成本，不被并发数、token数或自动化次数误导。)
- Q: OPN效率基线是否采用Human-only比较？ → 不专门做Human-only科学比较；将Single-Agent OPN Atom定义为ZAgenticLoop的内部产品baseline。后续多节点Graph Atom、复杂编排和ScaleOut都与该baseline比较新增能力、协调成本、证据质量、恢复能力和风险，重点判断组合是否带来足够的能力增量，而不是证明Agent优于Human。 (避免把产品目标误写成单Agent替代Human的性能Benchmark，保持OPN作为可组合生产网络的产品方向。)
- Q: Single-Agent OPN Atom baseline如何产品化？ → 定义为single-agent-opn-atom.v1 conformance fixture：固定Human owner、一个独立enrolled Agent、一个有价值且有界的MessageEvent、CapabilityGrant、Execution、Evidence、Review Handoff、Human decision或explainable stop、blocked/recovery路径和零未授权副作用；协议和验收边界固定，低风险业务任务可以替换。后续Graph Atom必须说明相对baseline的能力增量。 (把baseline变成可重复验证的产品契约，而不是绑定单一业务Demo或Agent数量。)
- Q: Single-Agent Atom递归组合成Multi-node Graph Atom时保留哪些不变量？ → 必须保留：每个子任务有明确目标/边界/成功标准；每个Agent有独立身份、CapabilityGrant和执行记录；组合任务有Human或Human+Agent责任中心；每个结果有Evidence和Review Handoff；失败/歧义/权限不足/恢复有停止语义；分派前完成外部资源隔离；组合保持幂等、可恢复、可审计且未授权副作用为0。可变化：Agent数量、任务图宽度深度、依赖/并行度、中间Artifact和验证层级。 (递归增加枝叶但不改变原子契约的责任、权限、证据、隔离、幂等、恢复和停止语义。)
- Q: 何时允许从原子组合ScaleUp或ScaleOut？ → 只有在已证明的组合范式成立时允许扩张：子任务有明确边界和兼容contract，资源隔离已知且可验证，fan-out有上限，执行独立或幂等，存在canonical aggregation/verification，资源和预算有上限，并有Human承担的恢复路径。任一条件未知时不自动扩张，由中心单元grill Human或退回更小的已验证组合。 (Scale不是无限递归或节点复制；只有原子契约可组合且聚合结果可验证时才扩大规模。)
- Q: 何时允许从原子组合ScaleUp或ScaleOut？ → 只有在已证明的组合范式成立时允许扩张：子任务有明确边界和兼容contract，资源隔离已知且可验证，fan-out有上限，执行独立或幂等，存在canonical aggregation/verification，资源和预算有上限，并有Human承担的恢复路径。任一条件未知时不自动扩张，由中心单元grill Human或退回更小的已验证组合。 (Scale不是无限递归或节点复制；只有原子契约可组合且聚合结果可验证时才扩大规模。)
- Q: Multi-node Graph Atom相对Single-Agent baseline必须新增什么？ → 至少包含Human-held center responsibility unit、两个独立enrolled Agent execution nodes、两个不同但有依赖关系的任务、Directed Task Graph、明确资源隔离、中间Evidence、canonical aggregation或verification和一个Review Handoff。仅增加第二个Agent而没有新增可组合能力，不算Graph Atom。 (Graph Atom必须证明任务分工、依赖、隔离和聚合能力，而不是把多Agent聊天或并行数量当作产品升级。)
- Q: Multi-node Graph Atom相对Single-Agent baseline必须新增什么？ → 至少包含Human-held center responsibility unit、两个独立enrolled Agent execution nodes、两个不同但有依赖关系的任务、Directed Task Graph、明确资源隔离、中间Evidence、canonical aggregation或verification和一个Review Handoff。仅增加第二个Agent而没有新增可组合能力，不算Graph Atom。 (Graph Atom必须证明任务分工、依赖、隔离和聚合能力，而不是把多Agent聊天或并行数量当作产品升级。)
<!-- ROADMAP_SECTION_END -->
