<!-- ROADMAP_SECTION_START -->
## ZJ Roadmap

> 数据文件: `architecture-improvement-roadmap.json` | 最后更新: 2026-06-30 20:05:46

[~][X+] 1. ZAgenticLoop 架构设计与技术选型深化
├── [x][X+] 1-1. 绘制当前 Agentic Loop Working 系统地图
├── [~][Y+] 1-2. 抽取 zj-loop-core 共享领域内核
│   ├── [x][Y+] 1-2-1. 定义 zj-loop-core 包边界与公共类型
│   ├── [x][Y+] 1-2-2. 抽取 registry loader 与领域模型
│   ├── [ ][Y+] 1-2-3. 抽取项目证据探测与文件系统适配器
│   └── [x][Y+] 1-2-4. 按 cost-init-audit-sync-MCP 顺序接入 core
├── [ ][Y+] 1-3. 提升 patterns/registry.yaml 为单一事实源
│   ├── [x][Y+] 1-3-1. 扩展 registry schema 承载 starter-state-budget-command
│   ├── [x][Y+] 1-3-2. 迁移 init-cost-MCP 的硬编码 pattern 事实
│   └── [ ][Y+] 1-3-3. 补齐 registry 校验与兼容性测试
├── [ ][X+] 1-4. 设计 readiness 策略规则引擎
│   ├── [ ][X+] 1-4-1. 盘点现有 readiness signals 与分数来源
│   └── [ ][X+] 1-4-2. 设计声明式 readiness rule schema 草案
├── [ ][X+] 1-5. 统一 zj-loop CLI 产品族外壳
│   ├── [ ][X+] 1-5-1. 盘点 zj-loop CLI 参数与输出体验重复
│   └── [ ][X+] 1-5-2. 设计共享 CLI harness 的最小 API
├── [ ][X+] 1-6. 升级 MCP 为 Agentic Loop Working 语义 API
│   ├── [ ][X+] 1-6-1. 审计 MCP resources-tools 的语义边界
│   └── [ ][X+] 1-6-2. 设计基于 core 的语义查询 API
└── [x][Y+] 1-7. 制定验证与迁移切片
    ├── [x][Y+] 1-7-1. 规划 audit-init 最小纵切迁移
    └── [x][Y+] 1-7-2. 更新质量门禁与 before-after demo 证据

### 当前施工：1-2. 抽取 zj-loop-core 共享领域内核

首个建议 exploit 区：建立共享领域内核，先承载 registry loading、公共类型、项目证据探测，不在第一步承载 readiness scoring 策略。

**决策：**
- Q: zj-loop-core 第一版是否作为独立 workspace package？ → 要。第一版采用独立 workspace package，例如 tools/zj-loop-core / @jununfly/zj-loop-core。 (core 是 audit/init/sync/cost/MCP 的共同依赖，不归属于任一 CLI；独立包可以保持领域语言和事实模型的中立 owner。)

**当前子树：**
├── [x][Y+] 1-2-1. 定义 zj-loop-core 包边界与公共类型
├── [x][Y+] 1-2-2. 抽取 registry loader 与领域模型
├── [ ][Y+] 1-2-3. 抽取项目证据探测与文件系统适配器
└── [x][Y+] 1-2-4. 按 cost-init-audit-sync-MCP 顺序接入 core
<!-- ROADMAP_SECTION_END -->
