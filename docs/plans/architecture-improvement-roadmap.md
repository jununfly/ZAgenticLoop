<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `architecture-improvement-roadmap.json` | 最后更新: 2026-06-30 21:16:51

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
├── [x][X+] 1-5. 统一 zj-loop CLI 产品族外壳
│   ├── [x][X+] 1-5-1. 盘点 zj-loop CLI 参数与输出体验重复
│   └── [x][X+] 1-5-2. 设计共享 CLI harness 的最小 API
├── [ ][X+] 1-6. 升级 MCP 为 Agentic Loop Working 语义 API
│   ├── [x][X+] 1-6-1. 审计 MCP resources-tools 的语义边界
│   ├── [~][X+] 1-6-2. 设计基于 core 的语义查询 API
│   ├── [ ][Y+] 1-6-3. 实现 core semantic query module
│   ├── [ ][Y+] 1-6-4. 迁移 MCP tools 消费 core semantic queries
│   └── [ ][Y+] 1-6-5. 补齐 MCP 语义 API 文档与兼容性测试
└── [x][Y+] 1-7. 制定验证与迁移切片
    ├── [x][Y+] 1-7-1. 规划 audit-init 最小纵切迁移
    └── [x][Y+] 1-7-2. 更新质量门禁与 before-after demo 证据

### 当前施工：1-6-2. 设计基于 core 的语义查询 API

第11刀施工中：拓展 core semantic query API 设计 roadmap，不实现运行时代码。

**决策：**
- Q: 第11刀是否直接实现 core semantic query API？ → 否。本刀继续拓展 roadmap：把 1-6-2 拆成 query universe、result contracts、core/evidence 边界、MCP adapter mapping、verification plan；实现留到后续 exploit 节点。 (用户明确说还是拓展 roadmap；本刀保持 explore，不写运行时代码。)

**当前子树：**
├── [x][X+] 1-6-2-1. 定义 Agentic Loop Working 语义查询问题宇宙
├── [x][X+] 1-6-2-2. 设计 transport-neutral 语义查询结果契约
├── [ ][X+] 1-6-2-3. 划分 core semantics 与 project evidence 边界
├── [ ][X+] 1-6-2-4. 规划 MCP tools 到 core semantic queries 的适配映射
└── [ ][X+] 1-6-2-5. 定义语义查询 API 的契约测试与迁移门禁
<!-- ROADMAP_SECTION_END -->
