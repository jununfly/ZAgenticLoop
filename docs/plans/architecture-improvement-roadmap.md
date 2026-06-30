<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `architecture-improvement-roadmap.json` | 最后更新: 2026-06-30 20:39:18

[~][X+] 1. ZAgenticLoop 架构设计与技术选型深化
├── [x][X+] 1-1. 绘制当前 Agentic Loop Working 系统地图
├── [x][Y+] 1-2. 抽取 zj-loop-core 共享领域内核
│   ├── [x][Y+] 1-2-1. 定义 zj-loop-core 包边界与公共类型
│   ├── [x][Y+] 1-2-2. 抽取 registry loader 与领域模型
│   ├── [x][Y+] 1-2-3. 抽取项目证据探测与文件系统适配器
│   └── [x][Y+] 1-2-4. 按 cost-init-audit-sync-MCP 顺序接入 core
├── [x][Y+] 1-3. 提升 patterns/registry.yaml 为单一事实源
│   ├── [x][Y+] 1-3-1. 扩展 registry schema 承载 starter-state-budget-command
│   ├── [x][Y+] 1-3-2. 迁移 init-cost-MCP 的硬编码 pattern 事实
│   └── [x][Y+] 1-3-3. 补齐 registry 校验与兼容性测试
├── [x][X+] 1-4. 设计 readiness 策略规则引擎
│   ├── [x][X+] 1-4-1. 盘点现有 readiness signals 与分数来源
│   └── [x][X+] 1-4-2. 设计声明式 readiness rule schema 草案
├── [ ][X+] 1-5. 统一 zj-loop CLI 产品族外壳
│   ├── [ ][X+] 1-5-1. 盘点 zj-loop CLI 参数与输出体验重复
│   └── [ ][X+] 1-5-2. 设计共享 CLI harness 的最小 API
├── [ ][X+] 1-6. 升级 MCP 为 Agentic Loop Working 语义 API
│   ├── [ ][X+] 1-6-1. 审计 MCP resources-tools 的语义边界
│   └── [ ][X+] 1-6-2. 设计基于 core 的语义查询 API
└── [x][Y+] 1-7. 制定验证与迁移切片
    ├── [x][Y+] 1-7-1. 规划 audit-init 最小纵切迁移
    └── [x][Y+] 1-7-2. 更新质量门禁与 before-after demo 证据

### 当前施工：1. ZAgenticLoop 架构设计与技术选型深化

**决策：**
- Q: 第一阶段应该先 exploit 哪个架构瓶颈？ → 推荐先做 zj-loop-core + registry 单一事实源的最小纵切，暂不先做 readiness rule engine 或 MCP 语义 API。 (原因：core/registry 会直接降低 audit/init/sync/cost/MCP 的重复；readiness rule engine 和 MCP API 都会消费这些基础能力，过早做容易把硬编码换个地方放。)
- Q: Human 是否确认第一阶段只做 core + registry 最小纵切？ → 确认。第一阶段聚焦 zj-loop-core + patterns/registry.yaml 单一事实源，不先实现 readiness rule engine 和 MCP 语义 API。 (这是后续 exploit 的约束：先降低领域事实重复和迁移成本，再进入策略引擎/API 层。)
- Q: 是否停止继续 grill 并提交当前 roadmap？ → 要。停止继续追问，把当前 roadmap 作为第一阶段架构实施计划提交到当前分支。 (关键边界、技术选型、迁移顺序和验收门禁已经收束；后续细节进入代码施工时再由具体实现反馈驱动。)

**当前子树：**
├── [x][X+] 1-1. 绘制当前 Agentic Loop Working 系统地图
├── [x][Y+] 1-2. 抽取 zj-loop-core 共享领域内核
│   ... 4 more child nodes; run tree 1-2 --depth 2 for full view
├── [x][Y+] 1-3. 提升 patterns/registry.yaml 为单一事实源
│   ... 3 more child nodes; run tree 1-3 --depth 2 for full view
├── [x][X+] 1-4. 设计 readiness 策略规则引擎
│   ... 2 more child nodes; run tree 1-4 --depth 2 for full view
├── [ ][X+] 1-5. 统一 zj-loop CLI 产品族外壳
│   ... 2 more child nodes; run tree 1-5 --depth 2 for full view
├── [ ][X+] 1-6. 升级 MCP 为 Agentic Loop Working 语义 API
│   ... 2 more child nodes; run tree 1-6 --depth 2 for full view
└── [x][Y+] 1-7. 制定验证与迁移切片
    ... 2 more child nodes; run tree 1-7 --depth 2 for full view
<!-- ROADMAP_SECTION_END -->
